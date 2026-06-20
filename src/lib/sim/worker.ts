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

function matchSeedFromId(matchId: string): number {
  let h = 0;
  for (let i = 0; i < matchId.length; i++) {
    h = (Math.imul(31, h) + matchId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildCtx(input: MatchInput): EngineCtx {
  const seed = matchSeedFromId(input.matchId);
  const home = {
    team: input.home.team,
    players: new Map(input.home.players.map((p: Player) => [p.id, p])),
    ratings: precomputeSide(input.home.players, input.home.formation, input.home.lineup, input.home.tacticStyle, input.home.team.coach, seed),
  };
  const away = {
    team: input.away.team,
    players: new Map(input.away.players.map((p: Player) => [p.id, p])),
    ratings: precomputeSide(input.away.players, input.away.formation, input.away.lineup, input.away.tacticStyle, input.away.team.coach, seed + 1),
  };
  return { home, away, eventCounter: { v: 0 } };
}

function isPauseStatus(s: MatchState['status']): boolean {
  return s === 'halftime' || s === 'extraTimeHalfTime';
}

function startLoop() {
  if (!ctx || !state) return;
  if (timer) clearInterval(timer);
  if (state.speed === 'instant') {
    while (state.status !== 'fulltime') {
      tick(state, ctx);
      if (isPauseStatus(state.status)) {
        tick(state, ctx); // auto-resume both halftime stalls in instant mode
      }
    }
    send({ type: 'finished', state });
    return;
  }
  const ms = SPEED_MS[state.speed];
  timer = setInterval(() => {
    if (paused || !ctx || !state) return;
    if (isPauseStatus(state.status)) {
      return; // stall — UI sends resume
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
      state = initialState(msg.input.matchId, msg.input.speed, msg.input.rules);
      state.homeOnPitch = [...ctx.home.ratings.lineup];
      state.awayOnPitch = [...ctx.away.ratings.lineup];
      if (msg.input.corruption) state.corruption = msg.input.corruption;
      tick(state, ctx); // kickoff
      send({ type: 'state', state });
      startLoop();
    } else if (msg.type === 'pause') {
      paused = true;
    } else if (msg.type === 'resume') {
      paused = false;
      if (state && isPauseStatus(state.status)) {
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
