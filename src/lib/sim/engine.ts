import type { Player, Position, Team } from '@/lib/types';
import type { MatchEvent, MatchState, SideRatings } from './types';
import { ZONE, eventText } from './events';

export type EngineCtx = {
  home: { team: Team; players: Map<string, Player>; ratings: SideRatings };
  away: { team: Team; players: Map<string, Player>; ratings: SideRatings };
  eventCounter: { v: number };
};

function rand(): number { return Math.random(); }
function chance(p: number): boolean { return rand() < p; }
function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]; }
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }
function clamp(n: number, lo: number, hi: number) { return n < lo ? lo : n > hi ? hi : n; }

export function initialState(matchId: string, speed: MatchState['speed'], rules: MatchState['rules']): MatchState {
  return {
    matchId,
    status: 'pregame',
    minute: 0,
    half: 1,
    addedTime: 0,
    homeAddedTime: 1 + Math.floor(rand() * 5),
    awayAddedTime: 1 + Math.floor(rand() * 7),
    score: { home: 0, away: 0 },
    events: [],
    shots: { home: 0, away: 0 },
    shotsOnTarget: { home: 0, away: 0 },
    saves: { home: 0, away: 0 },
    passes: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    offsides: { home: 0, away: 0 },
    freekicks: { home: 0, away: 0 },
    dribbles: { home: 0, away: 0 },
    clearances: { home: 0, away: 0 },
    keyPasses: { home: 0, away: 0 },
    cards: { home: { yellow: [], red: [] }, away: { yellow: [], red: [] } },
    possession: { home: 50, away: 50 },
    possessionTicks: { home: 0, away: 0 },
    playerKeyPasses: {},
    playerSaves: {},
    playerDribbles: {},
    playerClearances: {},
    ball: { x: 50, y: 25 },
    speed,
    homeOnPitch: [],
    awayOnPitch: [],
    homeBench: [],
    awayBench: [],
    homeAvailableBench: [],
    awayAvailableBench: [],
    rules,
    homeSubs: 0,
    awaySubs: 0,
  };
}

function pushEvent(
  state: MatchState,
  ctx: EngineCtx,
  base: Omit<MatchEvent, 'id' | 'text' | 'minute' | 'half'>,
  teamName: string,
  playerName?: string,
): MatchEvent {
  const minuteDisplay =
    state.half === 1 && state.minute > 45 ? `45+${state.minute - 45}`
    : state.half === 2 && state.minute > 90 ? `90+${state.minute - 90}`
    : String(state.minute);
  const ev: MatchEvent = {
    id: ++ctx.eventCounter.v,
    minute: state.minute,
    half: state.half,
    text: eventText(base.type, Number(minuteDisplay) || state.minute, teamName, playerName),
    ...base,
  };
  state.events.push(ev);
  return ev;
}

function pickAttacker(side: 'home' | 'away', ctx: EngineCtx, state: MatchState): Player | null {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const candidates = onPitch.map((id) => players.get(id)!).filter((p) => p && ['ST', 'LW', 'RW', 'AM', 'CM'].includes(p.position));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.stats.technical.finishing + b.stats.mental.composure) - (a.stats.technical.finishing + a.stats.mental.composure));
  return pick(candidates.slice(0, Math.min(4, candidates.length)));
}

function pickMidfielder(side: 'home' | 'away', ctx: EngineCtx, state: MatchState): Player | null {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const candidates = onPitch.map((id) => players.get(id)!).filter((p) => p && ['CM', 'AM', 'DM', 'LM', 'RM'].includes(p.position));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.stats.technical.passing + b.stats.technical.firstTouch) - (a.stats.technical.passing + a.stats.technical.firstTouch));
  return pick(candidates.slice(0, Math.min(4, candidates.length)));
}

function pickDefender(side: 'home' | 'away', ctx: EngineCtx, state: MatchState): Player | null {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const candidates = onPitch.map((id) => players.get(id)!).filter((p) => p && ['CB', 'LB', 'RB', 'DM'].includes(p.position));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.stats.technical.tackling + b.stats.technical.marking) - (a.stats.technical.tackling + a.stats.technical.marking));
  return pick(candidates.slice(0, Math.min(4, candidates.length)));
}

function pickHeader(side: 'home' | 'away', ctx: EngineCtx, state: MatchState): Player | null {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const candidates = onPitch.map((id) => players.get(id)!).filter((p) => p && ['ST', 'LW', 'RW', 'AM', 'CM', 'CB'].includes(p.position));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.stats.technical.heading + b.stats.physical.jumping) - (a.stats.technical.heading + a.stats.physical.jumping));
  return pick(candidates.slice(0, Math.min(4, candidates.length)));
}

function pickDribbler(side: 'home' | 'away', ctx: EngineCtx, state: MatchState): Player | null {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const candidates = onPitch.map((id) => players.get(id)!).filter((p) => p && ['ST', 'LW', 'RW', 'AM', 'CM'].includes(p.position));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.stats.technical.dribbling + b.stats.physical.agility) - (a.stats.technical.dribbling + a.stats.physical.agility));
  return pick(candidates.slice(0, Math.min(4, candidates.length)));
}

function pickFreeKickTaker(side: 'home' | 'away', ctx: EngineCtx, state: MatchState): Player | null {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const candidates = onPitch.map((id) => players.get(id)!).filter((p) => p && ['ST', 'LW', 'RW', 'AM', 'CM', 'LM', 'RM'].includes(p.position));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.stats.technical.longShots + b.stats.mental.composure) - (a.stats.technical.longShots + a.stats.mental.composure));
  return pick(candidates.slice(0, Math.min(3, candidates.length)));
}

function pickFouler(side: 'home' | 'away', ctx: EngineCtx, state: MatchState): Player | null {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const cands = onPitch.map((id) => players.get(id)!).filter(Boolean);
  if (!cands.length) return null;
  cands.sort((a, b) => b.stats.mental.aggression - a.stats.mental.aggression);
  return pick(cands.slice(0, 5));
}

function gkOf(side: 'home' | 'away', ctx: EngineCtx, state: MatchState): Player | null {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  for (const id of onPitch) {
    const p = players.get(id);
    if (p?.position === 'GK') return p;
  }
  return null;
}

function teamRatingMultiplier(side: 'home' | 'away', state: MatchState): number {
  const reds = side === 'home' ? state.cards.home.red.length : state.cards.away.red.length;
  return Math.pow(0.93, reds);
}

function posFamily(pos: Position): Position[] {
  if (['CB', 'LB', 'RB'].includes(pos)) return ['CB', 'LB', 'RB'];
  if (['DM', 'CM', 'AM', 'LM', 'RM'].includes(pos)) return ['DM', 'CM', 'AM', 'LM', 'RM'];
  return ['LW', 'RW', 'ST'];
}

function checkGoldenGoal(state: MatchState, ctx: EngineCtx): void {
  if ((state.status === 'extraTimeFirst' || state.status === 'extraTimeSecond') && state.rules.goldenGoal) {
    state.status = 'fulltime';
    pushEvent(state, ctx, { type: 'fulltime', side: null, ballPos: ZONE.centre }, ctx.home.team.name);
  }
}

function resolveShot(
  state: MatchState,
  ctx: EngineCtx,
  possessing: 'home' | 'away',
  opp: 'home' | 'away',
  teamName: string,
  oppName: string,
  pGoalMult = 1,
  zone?: { x: number; y: number },
  assisterId?: string,
): boolean {
  state.shots[possessing]++;
  const shooter = pickAttacker(possessing, ctx, state);
  const oppGk = gkOf(opp, ctx, state);
  const fin = shooter?.stats.technical.finishing ?? 10;
  const com = shooter?.stats.mental.composure ?? 10;
  const gkVal = oppGk?.overall ?? 50;
  const pGoal = clamp(sigmoid((fin + com - gkVal * 0.5) / 8) * pGoalMult, 0.04, 0.75);
  const ballZone = zone ?? (possessing === 'home' ? ZONE.awayBox : ZONE.homeBox);
  const onTarget = chance(0.55);
  if (onTarget) {
    state.shotsOnTarget[possessing]++;
    if (chance(pGoal)) {
      state.score[possessing]++;
      const effectiveAssist = assisterId !== shooter?.id ? assisterId : undefined;
      pushEvent(state, ctx, { type: 'goal', side: possessing, playerId: shooter?.id, assistId: effectiveAssist, ballPos: ballZone },
        teamName, shooter ? `${shooter.firstName} ${shooter.lastName}` : undefined);
      state.ball = ZONE.centre;
      return true;
    } else if (chance(0.10)) {
      pushEvent(state, ctx, { type: 'crossbar', side: possessing, playerId: shooter?.id, ballPos: ballZone },
        teamName, shooter ? `${shooter.firstName} ${shooter.lastName}` : undefined);
    } else {
      state.saves[opp]++;
      if (oppGk?.id) state.playerSaves[oppGk.id] = (state.playerSaves[oppGk.id] ?? 0) + 1;
      pushEvent(state, ctx, { type: 'save', side: opp, playerId: oppGk?.id, ballPos: ballZone },
        oppName, oppGk ? `${oppGk.firstName} ${oppGk.lastName}` : undefined);
    }
  } else {
    pushEvent(state, ctx, { type: 'shot', side: possessing, playerId: shooter?.id, ballPos: ballZone },
      teamName, shooter ? `${shooter.firstName} ${shooter.lastName}` : undefined);
  }
  return false;
}

function tryShot(
  state: MatchState,
  ctx: EngineCtx,
  possessing: 'home' | 'away',
  opp: 'home' | 'away',
  teamName: string,
  oppName: string,
  pGoalMult = 1,
  zone?: { x: number; y: number },
  assisterId?: string,
): void {
  if (resolveShot(state, ctx, possessing, opp, teamName, oppName, pGoalMult, zone, assisterId)) {
    checkGoldenGoal(state, ctx);
  }
}

function tryPenaltyShot(
  state: MatchState,
  ctx: EngineCtx,
  possessing: 'home' | 'away',
  opp: 'home' | 'away',
  teamName: string,
  oppName: string,
  shooter: import('@/lib/types').Player | undefined,
): void {
  const oppGk = gkOf(opp, ctx, state);
  const fin = shooter?.stats.technical.finishing ?? 10;
  const com = shooter?.stats.mental.composure ?? 10;
  const gkVal = oppGk?.overall ?? 50;
  const pGoal = clamp(sigmoid((fin + com - gkVal * 0.5) / 8) * 1.8, 0.04, 0.75);
  const ballZone = possessing === 'home' ? ZONE.awayBox : ZONE.homeBox;
  state.shots[possessing]++;
  const onTarget = chance(0.55);
  if (onTarget) {
    state.shotsOnTarget[possessing]++;
    if (chance(pGoal)) {
      state.score[possessing]++;
      pushEvent(state, ctx, { type: 'goal', side: possessing, playerId: shooter?.id, ballPos: ballZone },
        teamName, shooter ? `${shooter.firstName} ${shooter.lastName}` : undefined);
      state.ball = ZONE.centre;
      checkGoldenGoal(state, ctx);
    } else {
      // on target but saved
      pushEvent(state, ctx, { type: 'penalty_saved', side: opp, playerId: oppGk?.id, ballPos: ballZone },
        oppName, oppGk ? `${oppGk.firstName} ${oppGk.lastName}` : undefined);
    }
  } else {
    // off target
    pushEvent(state, ctx, { type: 'penalty_miss', side: possessing, playerId: shooter?.id, ballPos: ballZone },
      teamName, shooter ? `${shooter.firstName} ${shooter.lastName}` : undefined);
  }
}

function executeSub(state: MatchState, ctx: EngineCtx, side: 'home' | 'away', outId: string, inId: string): boolean {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const benchIds = side === 'home' ? ctx.home.ratings.bench : ctx.away.ratings.bench;
  const teamName = side === 'home' ? ctx.home.team.name : ctx.away.team.name;
  if (!onPitch.includes(outId) || !benchIds.includes(inId)) return false;
  const outP = players.get(outId);
  const inP = players.get(inId);
  if (!outP || !inP) return false;
  if (side === 'home') {
    state.homeOnPitch = state.homeOnPitch.map((id) => id === outId ? inId : id);
    state.homeAvailableBench = state.homeAvailableBench.filter((id) => id !== inId);
  } else {
    state.awayOnPitch = state.awayOnPitch.map((id) => id === outId ? inId : id);
    state.awayAvailableBench = state.awayAvailableBench.filter((id) => id !== inId);
  }
  const benchList = benchIds;
  const bIdx = benchList.indexOf(inId);
  if (bIdx !== -1) benchList.splice(bIdx, 1);
  pushEvent(state, ctx, { type: 'substitution', side, playerId: inId, replacedId: outId, ballPos: ZONE.centre },
    teamName, `${inP.firstName} ${inP.lastName} ↔ ${outP.firstName} ${outP.lastName}`);
  return true;
}

function performAutoSubs(state: MatchState, ctx: EngineCtx, side: 'home' | 'away'): void {
  const subsUsed = side === 'home' ? state.homeSubs : state.awaySubs;
  if (subsUsed >= state.rules.maxSubs) return;

  const numToMake = Math.min(2, state.rules.maxSubs - subsUsed);
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const benchIds = side === 'home' ? ctx.home.ratings.bench : ctx.away.ratings.bench;
  const plannedSubs = side === 'home' ? ctx.home.ratings.plannedSubs : ctx.away.ratings.plannedSubs;

  // Apply planned halftime subs first (those without a specific minute)
  const halftimePlanned = plannedSubs.filter((s) => !s.done && s.minute === undefined);
  let made = 0;
  for (const plan of halftimePlanned) {
    if (made >= numToMake || subsUsed + made >= state.rules.maxSubs) break;
    if (executeSub(state, ctx, side, plan.outId, plan.inId)) {
      plan.done = true;
      made++;
    }
  }

  // Fill remaining slots with automatic subs (lowest overall non-GK)
  if (made < numToMake) {
    const remaining = numToMake - made;
    const availBench = benchIds
      .map((id) => players.get(id))
      .filter((p): p is Player => !!p)
      .sort((a, b) => b.overall - a.overall);
    if (!availBench.length) { if (side === 'home') state.homeSubs += made; else state.awaySubs += made; return; }

    const starters = onPitch
      .map((id) => players.get(id))
      .filter((p): p is Player => !!p && p.position !== 'GK')
      .sort((a, b) => a.overall - b.overall);

    for (const out of starters) {
      if (made >= numToMake || !availBench.length) break;
      // Skip if this player has a planned sub (different minute) — don't replace them automatically
      const hasPlanned = plannedSubs.some((s) => !s.done && s.outId === out.id);
      if (hasPlanned) continue;
      const family = posFamily(out.position);
      const compatIdx = availBench.findIndex((p) => family.includes(p.position));
      const sub = compatIdx >= 0 ? availBench.splice(compatIdx, 1)[0] : availBench.shift()!;
      if (executeSub(state, ctx, side, out.id, sub.id)) made++;
    }
    void remaining;
  }

  if (side === 'home') state.homeSubs += made;
  else state.awaySubs += made;
}

function applyPlannedSubsByMinute(state: MatchState, ctx: EngineCtx, side: 'home' | 'away'): void {
  const subsUsed = side === 'home' ? state.homeSubs : state.awaySubs;
  if (subsUsed >= state.rules.maxSubs) return;
  const plannedSubs = side === 'home' ? ctx.home.ratings.plannedSubs : ctx.away.ratings.plannedSubs;
  const pending = plannedSubs.filter((s) => !s.done && s.minute !== undefined && s.minute <= state.minute);
  let made = 0;
  for (const plan of pending) {
    if (subsUsed + made >= state.rules.maxSubs) break;
    if (executeSub(state, ctx, side, plan.outId, plan.inId)) {
      plan.done = true;
      made++;
    }
  }
  if (side === 'home') state.homeSubs += made;
  else state.awaySubs += made;
}

export function performManualSub(
  state: MatchState,
  ctx: EngineCtx,
  side: 'home' | 'away',
  outId: string,
  inId: string,
): boolean {
  const subsUsed = side === 'home' ? state.homeSubs : state.awaySubs;
  if (subsUsed >= state.rules.maxSubs) return false;

  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const benchIds = side === 'home' ? ctx.home.ratings.bench : ctx.away.ratings.bench;

  if (!onPitch.includes(outId)) return false;
  if (!benchIds.includes(inId)) return false;
  const outPlayer = players.get(outId);
  const inPlayer = players.get(inId);
  if (!outPlayer || !inPlayer) return false;

  const teamName = side === 'home' ? ctx.home.team.name : ctx.away.team.name;

  if (side === 'home') {
    state.homeOnPitch = state.homeOnPitch.map((id) => (id === outId ? inId : id));
    state.homeSubs++;
  } else {
    state.awayOnPitch = state.awayOnPitch.map((id) => (id === outId ? inId : id));
    state.awaySubs++;
  }
  // Remove the incoming player from bench tracking
  const benchList = side === 'home' ? ctx.home.ratings.bench : ctx.away.ratings.bench;
  const benchIdx = benchList.indexOf(inId);
  if (benchIdx !== -1) benchList.splice(benchIdx, 1);

  // Keep available bench in state in sync
  if (side === 'home') {
    state.homeAvailableBench = state.homeAvailableBench.filter((id) => id !== inId);
  } else {
    state.awayAvailableBench = state.awayAvailableBench.filter((id) => id !== inId);
  }

  pushEvent(state, ctx, { type: 'substitution', side, playerId: inId, replacedId: outId, ballPos: ZONE.centre },
    teamName, `${inPlayer.firstName} ${inPlayer.lastName} ↔ ${outPlayer.firstName} ${outPlayer.lastName}`);
  return true;
}

function simulatePenalties(state: MatchState, ctx: EngineCtx): void {
  const penScore = { home: 0, away: 0 };
  state.penaltyScore = penScore;

  function takePenalty(side: 'home' | 'away'): void {
    const opp: 'home' | 'away' = side === 'home' ? 'away' : 'home';
    const teamName = side === 'home' ? ctx.home.team.name : ctx.away.team.name;
    const shooter = pickAttacker(side, ctx, state);
    const gk = gkOf(opp, ctx, state);
    const pGoal = clamp(sigmoid(((shooter?.stats.technical.finishing ?? 10) + (shooter?.stats.mental.composure ?? 10) - (gk?.overall ?? 50) * 0.5) / 8) * 1.5, 0.50, 0.86);
    const scored = chance(pGoal);
    if (scored) penScore[side]++;
    state.events.push({
      id: ++ctx.eventCounter.v,
      minute: state.minute,
      half: 2,
      type: 'penalty',
      side,
      playerId: shooter?.id,
      text: scored
        ? `⚽ TAB — ${teamName} marque ! (${penScore.home}-${penScore.away})`
        : `🧤 TAB — Arrêté ! (${penScore.home}-${penScore.away})`,
      ballPos: side === 'home' ? ZONE.awayBox : ZONE.homeBox,
    });
  }

  // IRL logic: stop as soon as one side cannot catch up
  // kicks[i] = kicks taken by side after round i (0-indexed)
  for (let i = 0; i < 5; i++) {
    // home kicks (round i, kick i+1)
    takePenalty('home');
    {
      const homeKicksDone = i + 1;
      const awayKicksDone = i;
      const homeLeft = 5 - homeKicksDone;
      const awayLeft = 5 - awayKicksDone;
      // home already won: away can't catch even scoring all remaining
      if (penScore.home > penScore.away + awayLeft) break;
      // away already lost: home can't be caught even if away scores all remaining
      // (not possible to determine here, away hasn't kicked round i yet)
      void homeLeft;
    }
    // away kicks (round i, kick i+1)
    takePenalty('away');
    {
      const homeKicksDone = i + 1;
      const awayKicksDone = i + 1;
      const homeLeft = 5 - homeKicksDone;
      const awayLeft = 5 - awayKicksDone;
      // away already won
      if (penScore.away > penScore.home + homeLeft) break;
      // home already won
      if (penScore.home > penScore.away + awayLeft) break;
      // all kicks done with equal score → go to sudden death
      if (homeLeft === 0 && awayLeft === 0 && penScore.home === penScore.away) break;
    }
  }
  let sd = 0;
  while (penScore.home === penScore.away && sd++ < 20) {
    takePenalty('home');
    if (penScore.home !== penScore.away) break;
    takePenalty('away');
  }
}

export function tick(state: MatchState, ctx: EngineCtx): MatchState {
  if (state.status === 'pregame') {
    state.status = 'firstHalf';
    state.minute = 1;
    pushEvent(state, ctx, { type: 'kickoff', side: null, ballPos: ZONE.centre }, ctx.home.team.name);
    return state;
  }
  if (state.status === 'fulltime') return state;

  if (state.status === 'halftime') {
    performAutoSubs(state, ctx, 'home');
    performAutoSubs(state, ctx, 'away');
    state.status = 'secondHalf';
    state.half = 2;
    state.minute = 46;
    state.ball = ZONE.centre;
    return state;
  }

  if (state.status === 'extraTimeHalfTime') {
    state.status = 'extraTimeSecond';
    state.minute = 106;
    state.ball = ZONE.centre;
    return state;
  }

  if (state.status === 'penalties') {
    simulatePenalties(state, ctx);
    state.status = 'fulltime';
    pushEvent(state, ctx, { type: 'fulltime', side: null, ballPos: ZONE.centre }, ctx.home.team.name);
    return state;
  }

  state.minute++;

  // Apply any planned subs triggered by this minute
  applyPlannedSubsByMinute(state, ctx, 'home');
  applyPlannedSubsByMinute(state, ctx, 'away');

  if (state.half === 1 && state.minute > 45 + state.homeAddedTime) {
    state.status = 'halftime';
    pushEvent(state, ctx, { type: 'halftime', side: null, ballPos: ZONE.centre }, ctx.home.team.name);
    return state;
  }

  if (state.status === 'secondHalf' && state.minute > 90 + state.awayAddedTime) {
    // For two-legged ties, ET/penalties fire on aggregate draw, not per-match draw
    const tied = state.leg1Score
      ? (state.score.home + state.leg1Score.away) === (state.score.away + state.leg1Score.home)
      : state.score.home === state.score.away;
    if (tied && state.rules.extraTime) {
      state.status = 'extraTimeFirst';
      state.minute = 90;
      pushEvent(state, ctx, { type: 'extraTime', side: null, ballPos: ZONE.centre }, ctx.home.team.name);
      return state;
    }
    if (tied && state.rules.penalties) { state.status = 'penalties'; return state; }
    state.status = 'fulltime';
    pushEvent(state, ctx, { type: 'fulltime', side: null, ballPos: ZONE.centre }, ctx.home.team.name);
    return state;
  }

  if (state.status === 'extraTimeFirst' && state.minute > 105) {
    state.status = 'extraTimeHalfTime';
    pushEvent(state, ctx, { type: 'halftime', side: null, ballPos: ZONE.centre }, ctx.home.team.name);
    return state;
  }

  if (state.status === 'extraTimeSecond' && state.minute > 123) {
    const tied = state.leg1Score
      ? (state.score.home + state.leg1Score.away) === (state.score.away + state.leg1Score.home)
      : state.score.home === state.score.away;
    if (tied && state.rules.penalties) { state.status = 'penalties'; return state; }
    state.status = 'fulltime';
    pushEvent(state, ctx, { type: 'fulltime', side: null, ballPos: ZONE.centre }, ctx.home.team.name);
    return state;
  }

  // Possession roll
  const homeMid = ctx.home.ratings.midfield * teamRatingMultiplier('home', state);
  const awayMid = ctx.away.ratings.midfield * teamRatingMultiplier('away', state);
  const pHome = homeMid / (homeMid + awayMid);
  const possessing: 'home' | 'away' = chance(pHome) ? 'home' : 'away';
  if (possessing === 'home') { state.possessionTicks.home++; state.passes.home += 6; }
  else { state.possessionTicks.away++; state.passes.away += 6; }
  const totalTicks = state.possessionTicks.home + state.possessionTicks.away;
  state.possession.home = Math.round((state.possessionTicks.home / totalTicks) * 100);
  state.possession.away = 100 - state.possession.home;

  const r = rand();
  const opp: 'home' | 'away' = possessing === 'home' ? 'away' : 'home';
  const oppName = possessing === 'home' ? ctx.away.team.name : ctx.home.team.name;
  const teamName = possessing === 'home' ? ctx.home.team.name : ctx.away.team.name;
  const myAttack = (possessing === 'home' ? ctx.home.ratings.attack : ctx.away.ratings.attack) * teamRatingMultiplier(possessing, state);
  const oppDefense = (possessing === 'home' ? ctx.away.ratings.defense : ctx.home.ratings.defense) * teamRatingMultiplier(opp, state);
  const pAttack = myAttack / (myAttack + oppDefense);
  const myMods = possessing === 'home' ? ctx.home.ratings.tacticMods : ctx.away.ratings.tacticMods;
  const oppMods = possessing === 'home' ? ctx.away.ratings.tacticMods : ctx.home.ratings.tacticMods;

  const wShot     = 0.08 * (0.6 + pAttack) * myMods.shotFreqMult;
  const wFoul     = 0.08 * oppMods.foulRateMult;
  // direct/long-ball styles generate more set-piece situations → more corners
  const wCorner   = 0.04 * (myMods.shotFreqMult > 1 ? 1 + (myMods.shotFreqMult - 1) * 0.8 : 1.0);
  const wOffside  = state.rules.noOffside ? 0 : 0.03;
  // possession/tiki-taka/pressing styles create more key passes
  const wKeyPass  = 0.18 * myMods.midfieldMult;
  const wFreeKick = 0.03;
  // contre-attaque/direct/long-ball styles favour direct runs over build-up
  const wDribble  = 0.28 * pAttack * Math.max(1, myMods.attackMult);
  const wClear    = 0.03 * (1 - pAttack);
  const total = wShot + wFoul + wCorner + wOffside + wKeyPass + wFreeKick + wDribble + wClear;

  if (r < wShot) {
    tryShot(state, ctx, possessing, opp, teamName, oppName);

  } else if (r < wShot + wFoul) {
    // Corruption bias: if ref is bought and honoring the deal,
    // fouls are called against the victim side more often, cards too.
    // side='both': both teams bribed the ref — he plays normally (higher card rate on both).
    const corr = state.corruption;
    const corrActive = corr?.accepted && corr?.honored;
    const corrBoth = corrActive && corr!.side === 'both';
    // foulSide = who the foul is called against
    // normally = opp (the defending team fouled the attacker)
    // with single-side corruption: bias fouls against opp of briber
    const victimSide: 'home' | 'away' = (corrActive && !corrBoth)
      ? (corr!.side === possessing ? opp : possessing)
      : opp;
    state.fouls[victimSide]++;
    const fouler = pickFouler(victimSide, ctx, state);
    // single-side corruption increases penalty chance for briber
    const penChance = (corrActive && !corrBoth && corr!.side === possessing) ? 0.18 : 0.08;
    if (chance(penChance) && fouler) {
      const pz = possessing === 'home' ? ZONE.awayBox : ZONE.homeBox;
      const penTaker = pickAttacker(possessing, ctx, state);
      pushEvent(state, ctx, { type: 'penalty', side: possessing, playerId: penTaker?.id, ballPos: pz },
        teamName, penTaker ? `${penTaker.firstName} ${penTaker.lastName}` : undefined);
      tryPenaltyShot(state, ctx, possessing, opp, teamName, oppName, penTaker ?? undefined);
    } else {
      const victimName = victimSide === 'home' ? ctx.home.team.name : ctx.away.team.name;
      // 3% chance: the fouled player (attacker from possessing side) gets injured
      const fouledPlayer = pickAttacker(possessing, ctx, state);
      if (fouledPlayer && chance(0.03)) {
        applyInjury(state, ctx, possessing, fouledPlayer);
      }
      pushEvent(state, ctx, { type: 'foul', side: victimSide, playerId: fouler?.id, ballPos: ZONE.centre },
        victimName, fouler ? `${fouler.firstName} ${fouler.lastName}` : undefined);
      if (fouler) {
        const ag = fouler.stats.mental.aggression / 20;
        // 'both' deal: ref inflates cards on both sides (chaotic match). Single: biases against victim.
        const cardMult = corrBoth ? 1.8 : (corrActive && victimSide !== corr!.side) ? 2.0 : 1.0;
        if (chance((0.005 + 0.005 * ag) * cardMult)) {
          applyRed(state, ctx, victimSide, fouler);
        } else if (chance((0.13 + 0.06 * ag) * cardMult)) {
          if (state.cards[victimSide].yellow.includes(fouler.id)) {
            applyRed(state, ctx, victimSide, fouler);
          } else {
            state.cards[victimSide].yellow.push(fouler.id);
            pushEvent(state, ctx, { type: 'yellow', side: victimSide, playerId: fouler.id, ballPos: ZONE.centre },
              victimName, `${fouler.firstName} ${fouler.lastName}`);
            // 1.5% chance coach protests and gets ejected on any card
            if (chance(0.015)) applyCoachRed(state, ctx, victimSide);
          }
        }
      }
    }

  } else if (r < wShot + wFoul + wCorner) {
    state.corners[possessing]++;
    const cz = possessing === 'home' ? ZONE.homeRightCorner : ZONE.awayLeftCorner;
    pushEvent(state, ctx, { type: 'corner', side: possessing, ballPos: cz }, teamName);
    if (chance(0.45)) {
      const header = pickHeader(possessing, ctx, state);
      if (header) {
        const hz = possessing === 'home' ? ZONE.awayBox : ZONE.homeBox;
        pushEvent(state, ctx, { type: 'header', side: possessing, playerId: header.id, ballPos: hz },
          teamName, `${header.firstName} ${header.lastName}`);
        // heading quality influences shot chance on corners (base 0.35, +/- based on heading stat)
        const headerBonus = (header.stats.technical.heading - 10) / 100;
        if (chance(0.35 + headerBonus)) tryShot(state, ctx, possessing, opp, teamName, oppName, 0.85, hz, header.id);
      }
    }

  } else if (r < wShot + wFoul + wCorner + wOffside) {
    state.offsides[possessing]++;
    pushEvent(state, ctx, {
      type: 'offside', side: possessing,
      ballPos: possessing === 'home' ? ZONE.awayBox : ZONE.homeBox,
    }, teamName);

  } else if (r < wShot + wFoul + wCorner + wOffside + wKeyPass) {
    const passer = pickMidfielder(possessing, ctx, state) ?? pickAttacker(possessing, ctx, state);
    state.keyPasses[possessing]++;
    if (passer?.id) state.playerKeyPasses[passer.id] = (state.playerKeyPasses[passer.id] ?? 0) + 1;
    pushEvent(state, ctx, {
      type: 'keyPass', side: possessing, playerId: passer?.id,
      ballPos: possessing === 'home' ? ZONE.midfieldAway : ZONE.midfieldHome,
    }, teamName, passer ? `${passer.firstName} ${passer.lastName}` : undefined);
    // vision influences how often a key pass creates a real chance
    const visionBonus = passer ? (passer.stats.mental.vision - 10) / 100 : 0;
    if (chance(0.35 + visionBonus)) tryShot(state, ctx, possessing, opp, teamName, oppName, 1.0, undefined, passer?.id);

  } else if (r < wShot + wFoul + wCorner + wOffside + wKeyPass + wFreeKick) {
    const fkShooter = pickFreeKickTaker(possessing, ctx, state);
    state.freekicks[possessing]++;
    const fkZone = possessing === 'home' ? ZONE.awayAttack : ZONE.homeAttack;
    pushEvent(state, ctx, { type: 'freeKick', side: possessing, playerId: fkShooter?.id, ballPos: fkZone },
      teamName, fkShooter ? `${fkShooter.firstName} ${fkShooter.lastName}` : undefined);
    // longShots quality influences shot chance on free kicks
    const fkBonus = fkShooter ? (fkShooter.stats.technical.longShots - 10) / 100 : 0;
    if (chance(0.30 + fkBonus)) tryShot(state, ctx, possessing, opp, teamName, oppName, 0.75, fkZone, fkShooter?.id);

  } else if (r < wShot + wFoul + wCorner + wOffside + wKeyPass + wFreeKick + wDribble) {
    const dribbler = pickDribbler(possessing, ctx, state);
    state.dribbles[possessing]++;
    if (dribbler?.id) state.playerDribbles[dribbler.id] = (state.playerDribbles[dribbler.id] ?? 0) + 1;
    pushEvent(state, ctx, {
      type: 'dribble', side: possessing, playerId: dribbler?.id,
      ballPos: possessing === 'home' ? ZONE.awayAttack : ZONE.homeAttack,
    }, teamName, dribbler ? `${dribbler.firstName} ${dribbler.lastName}` : undefined);
    // dribbling quality influences how often a dribble creates a shot
    const dribBonus = dribbler ? (dribbler.stats.technical.dribbling - 10) / 100 : 0;
    if (chance(0.40 + dribBonus)) tryShot(state, ctx, possessing, opp, teamName, oppName, 1.05, undefined, dribbler?.id);

  } else if (r < total) {
    const defender = pickDefender(opp, ctx, state);
    state.clearances[opp]++;
    if (defender?.id) state.playerClearances[defender.id] = (state.playerClearances[defender.id] ?? 0) + 1;
    pushEvent(state, ctx, { type: 'clearance', side: opp, playerId: defender?.id, ballPos: ZONE.centre },
      oppName, defender ? `${defender.firstName} ${defender.lastName}` : undefined);

  } else {
    state.ball = possessing === 'home' ? ZONE.midfieldAway : ZONE.midfieldHome;
  }

  const last = state.events[state.events.length - 1];
  if (last?.ballPos) state.ball = last.ballPos;
  return state;
}

function applyInjury(state: MatchState, ctx: EngineCtx, side: 'home' | 'away', player: Player): void {
  if (!state.matchInjuries) state.matchInjuries = { home: [], away: [] };
  if (state.matchInjuries[side].includes(player.id)) return;
  state.matchInjuries[side].push(player.id);
  const teamName = side === 'home' ? ctx.home.team.name : ctx.away.team.name;
  pushEvent(state, ctx, { type: 'injury', side, playerId: player.id, ballPos: ZONE.centre },
    teamName, `${player.firstName} ${player.lastName}`);
  // Force substitution if possible
  const benchIds = side === 'home' ? ctx.home.ratings.bench : ctx.away.ratings.bench;
  const players = side === 'home' ? ctx.home.players : ctx.away.players;
  const subsUsed = side === 'home' ? state.homeSubs : state.awaySubs;
  const sub = benchIds.map((id) => players.get(id)).find((p): p is Player => !!p && !state.matchInjuries![side].includes(p.id));
  if (sub && subsUsed < state.rules.maxSubs) {
    if (side === 'home') {
      state.homeOnPitch = state.homeOnPitch.map((id) => id === player.id ? sub.id : id);
      state.homeAvailableBench = state.homeAvailableBench.filter((id) => id !== sub.id);
      state.homeSubs++;
    } else {
      state.awayOnPitch = state.awayOnPitch.map((id) => id === player.id ? sub.id : id);
      state.awayAvailableBench = state.awayAvailableBench.filter((id) => id !== sub.id);
      state.awaySubs++;
    }
    pushEvent(state, ctx, { type: 'substitution', side, playerId: sub.id, ballPos: ZONE.centre },
      teamName, `${sub.firstName} ${sub.lastName} ↔ ${player.firstName} ${player.lastName} (blessure)`);
  } else {
    // No sub available — player is removed
    if (side === 'home') state.homeOnPitch = state.homeOnPitch.filter((id) => id !== player.id);
    else state.awayOnPitch = state.awayOnPitch.filter((id) => id !== player.id);
  }
}

function applyRed(state: MatchState, ctx: EngineCtx, side: 'home' | 'away', player: Player): void {
  state.cards[side].red.push(player.id);
  if (side === 'home') state.homeOnPitch = state.homeOnPitch.filter((id) => id !== player.id);
  else state.awayOnPitch = state.awayOnPitch.filter((id) => id !== player.id);
  const teamName = side === 'home' ? ctx.home.team.name : ctx.away.team.name;
  pushEvent(state, ctx, { type: 'red', side, playerId: player.id, ballPos: ZONE.centre },
    teamName, `${player.firstName} ${player.lastName}`);
  // 8% chance coach gets ejected too after a player red
  if (chance(0.08)) applyCoachRed(state, ctx, side);
}

function applyCoachRed(state: MatchState, ctx: EngineCtx, side: 'home' | 'away'): void {
  if (!state.coachEjected) state.coachEjected = { home: false, away: false };
  if (state.coachEjected[side]) return; // already ejected
  state.coachEjected[side] = true;
  const teamName = side === 'home' ? ctx.home.team.name : ctx.away.team.name;
  pushEvent(state, ctx, { type: 'coachRed', side, ballPos: ZONE.centre }, teamName);
}
