import type { Player } from '@/lib/types';
import type { MatchInput, MatchState, Speed } from './types';
import { precomputeSide, enrichPlanBRules } from './precompute';
import { computeMatchupAdjustment } from './matchup';
import { initialState, tick, performManualSub, type EngineCtx } from './engine';

type Inbound =
  | { type: 'start'; input: MatchInput }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'speed'; speed: Speed }
  | { type: 'instant' }
  | { type: 'manualsub'; side: 'home' | 'away'; outId: string; inId: string }
  | { type: 'updatetactic'; side: 'home' | 'away'; input: MatchInput };

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
  const homeRatings = precomputeSide(input.home.players, input.home.formation, input.home.lineup, input.home.tacticStyle, input.home.team.coach, seed, input.home.team.coachSuspended, input.home.customTacticStyle, input.home.morale, input.home.unavailablePlayerIds ? new Set(input.home.unavailablePlayerIds) : undefined, input.home.bench, input.home.plannedSubs, input.home.positionMap, { planB: enrichPlanBRules(input.home.planB, input.home.team), setPieceTakers: input.home.setPieceTakers, captainId: input.home.captainId });
  const awayRatings = precomputeSide(input.away.players, input.away.formation, input.away.lineup, input.away.tacticStyle, input.away.team.coach, seed + 1, input.away.team.coachSuspended, input.away.customTacticStyle, input.away.morale, input.away.unavailablePlayerIds ? new Set(input.away.unavailablePlayerIds) : undefined, input.away.bench, input.away.plannedSubs, input.away.positionMap, { planB: enrichPlanBRules(input.away.planB, input.away.team), setPieceTakers: input.away.setPieceTakers, captainId: input.away.captainId });

  // No-tactic penalty: disorganised side — crippled offensively, defence collapses
  if (!input.home.hasTactic) {
    homeRatings.attack   *= 0.30;
    homeRatings.midfield *= 0.30;
    homeRatings.defense  *= 0.40;
  }
  if (!input.away.hasTactic) {
    awayRatings.attack   *= 0.30;
    awayRatings.midfield *= 0.30;
    awayRatings.defense  *= 0.40;
  }

  // Cross-side matchup adjustments: formation vs formation + style vs style
  const homeAdj = computeMatchupAdjustment(
    input.home.formation, input.away.formation,
    input.home.tacticStyle, input.home.customTacticStyle,
    input.away.tacticStyle, input.away.customTacticStyle,
  );
  const awayAdj = computeMatchupAdjustment(
    input.away.formation, input.home.formation,
    input.away.tacticStyle, input.away.customTacticStyle,
    input.home.tacticStyle, input.home.customTacticStyle,
  );

  homeRatings.attack   *= homeAdj.attackMult;
  homeRatings.defense  *= homeAdj.defenseMult;
  homeRatings.midfield *= homeAdj.midfieldMult;

  awayRatings.attack   *= awayAdj.attackMult;
  awayRatings.defense  *= awayAdj.defenseMult;
  awayRatings.midfield *= awayAdj.midfieldMult;

  const home = {
    team: input.home.team,
    players: new Map(input.home.players.map((p: Player) => [p.id, p])),
    ratings: homeRatings,
  };
  const away = {
    team: input.away.team,
    players: new Map(input.away.players.map((p: Player) => [p.id, p])),
    ratings: awayRatings,
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
      state.homeBench = [...ctx.home.ratings.bench];
      state.awayBench = [...ctx.away.ratings.bench];
      state.homeAvailableBench = [...ctx.home.ratings.bench];
      state.awayAvailableBench = [...ctx.away.ratings.bench];
      if (msg.input.corruption) state.corruption = msg.input.corruption;
      if (msg.input.leg1Score) state.leg1Score = msg.input.leg1Score;
      if (msg.input.weather) state.weather = msg.input.weather;
      if (msg.input.referee) {
        state.referee = msg.input.referee;
        // Générosité variable du temps additionnel selon l'arbitre
        state.homeAddedTime = Math.max(0, state.homeAddedTime + msg.input.referee.addedTimeBias);
        state.awayAddedTime = Math.max(0, state.awayAddedTime + msg.input.referee.addedTimeBias);
      }
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
    } else if (msg.type === 'manualsub') {
      if (state && ctx) {
        performManualSub(state, ctx, msg.side, msg.outId, msg.inId);
        send({ type: 'state', state });
      }
    } else if (msg.type === 'updatetactic') {
      if (ctx && state) {
        // Rebuild BOTH sides: matchup adjustments are cross-side — a home tactic
        // change also shifts the away side's formation/style matchup multipliers.
        const newCtx = buildCtx(msg.input);
        // Preserve in-match reality: players already on the pitch must not
        // reappear on the rebuilt benches (double-sub guard), and planned subs
        // already executed stay executed.
        const onPitch = new Set([...state.homeOnPitch, ...state.awayOnPitch]);
        for (const side of ['home', 'away'] as const) {
          const fresh = newCtx[side].ratings;
          const old = ctx[side].ratings;
          fresh.bench = fresh.bench.filter((id) => !onPitch.has(id));
          for (const plan of fresh.plannedSubs) {
            if (old.plannedSubs.some((p) => p.done && p.outId === plan.outId && p.inId === plan.inId)) {
              plan.done = true;
            }
          }
          // Un plan B déjà déclenché ne se réarme pas après un changement tactique en match
          for (const rule of fresh.planB) {
            if (old.planB.some((r) => r.done && r.id === rule.id)) rule.done = true;
          }
        }
        ctx = newCtx;
      }
    }
  } catch (err) {
    send({ type: 'error', message: String(err) });
  }
};
