import type { Player } from '@/lib/types';
import type { MatchInput, MatchState, Speed } from './types';
import { precomputeSide } from './precompute';
import { initialState, tick, type EngineCtx } from './engine';

type Inbound =
  | { type: 'start'; input: MatchInput }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'speed'; speed: Speed }
  | { type: 'instant' };

type Outbound =
  | { type: 'state'; state: MatchState }
  | { type: 'finished'; state: MatchState }
  | { type: 'error'; message: string };

const SPEED_MS: Record<Speed, number> = {
  '0.5': 2000,
  '1': 1000,
  '2': 500,
  '5': 200,
  instant: 0,
};

let ctx: EngineCtx | null = null;
let state: MatchState | null = null;
let timer: number | null = null;
let paused = false;

function send(msg: Outbound) {
  (self as unknown as Worker).postMessage(msg);
}

function buildCtx(input: MatchInput): EngineCtx {
  const home = {
    team: input.home.team,
    players: new Map(input.home.players.map((p: Player) => [p.id, p])),
    ratings: precomputeSide(input.home.players, input.home.formation, input.home.lineup, input.home.tacticStyle),
  };
  const away = {
    team: input.away.team,
    players: new Map(input.away.players.map((p: Player) => [p.id, p])),
    ratings: precomputeSide(input.away.players, input.away.formation, input.away.lineup, input.away.tacticStyle),
  };
  return { home, away, eventCounter: { v: 0 } };
}

function startLoop() {
  if (!ctx || !state) return;
  if (timer) clearInterval(timer);
  if (state.speed === 'instant') {
    while (state.status !== 'fulltime') {
      tick(state, ctx);
      if (state.status === 'halftime') {
        tick(state, ctx);
      }
    }
    send({ type: 'finished', state });
    return;
  }
  const ms = SPEED_MS[state.speed];
  timer = setInterval(() => {
    if (paused || !ctx || !state) return;
    if (state.status === 'halftime') {
      // automatic resume after a short pause is handled by UI sending resume; engine just stalls.
      return;
    }
    tick(state, ctx);
    send({ type: 'state', state });
    if (state.status === 'fulltime') {
      if (timer) clearInterval(timer);
      send({ type: 'finished', state });
    }
  }, ms) as unknown as number;
}

self.onmessage = (ev: MessageEvent<Inbound>) => {
  try {
    const msg = ev.data;
    if (msg.type === 'start') {
      ctx = buildCtx(msg.input);
      state = initialState(msg.input.matchId, msg.input.speed);
      state.homeOnPitch = [...ctx.home.ratings.lineup];
      state.awayOnPitch = [...ctx.away.ratings.lineup];
      tick(state, ctx); // kickoff
      send({ type: 'state', state });
      startLoop();
    } else if (msg.type === 'pause') {
      paused = true;
    } else if (msg.type === 'resume') {
      paused = false;
      if (state && state.status === 'halftime') {
        tick(state, ctx!);
        send({ type: 'state', state });
        startLoop();
      }
    } else if (msg.type === 'speed') {
      if (state) state.speed = msg.speed;
      startLoop();
    } else if (msg.type === 'instant') {
      if (state) state.speed = 'instant';
      startLoop();
    }
  } catch (err) {
    send({ type: 'error', message: String(err) });
  }
};
