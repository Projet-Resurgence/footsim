import type { Player, Position, Team } from '@/lib/types';
import type { MatchState } from '@/lib/sim/types';
import type { PlayerCompStats } from './types';

function clamp(n: number, lo: number, hi: number) { return n < lo ? lo : n > hi ? hi : n; }

function isDefensive(pos: Position): boolean {
  return ['GK', 'CB', 'LB', 'RB', 'DM'].includes(pos);
}

function computeMatchRating(
  player: Player,
  side: 'home' | 'away',
  state: MatchState,
  playerGoals: number,
  playerAssists: number,
  playerYellows: number,
  playerReds: number,
  isSub: boolean,
): number {
  const opp: 'home' | 'away' = side === 'home' ? 'away' : 'home';
  const conceded = state.score[opp];
  const playerSaves = state.playerSaves?.[player.id] ?? 0;
  const playerKeyPasses = state.playerKeyPasses?.[player.id] ?? 0;
  const playerDribbles = state.playerDribbles?.[player.id] ?? 0;
  const playerClearances = state.playerClearances?.[player.id] ?? 0;

  let rating = 6.0;

  rating += playerGoals * 1.5;
  rating += playerAssists * 1.0;
  rating -= playerYellows * 0.5;
  rating -= playerReds * 1.5;

  if (player.position === 'GK') {
    rating += playerSaves * 0.3;
    if (conceded === 0) rating += 0.8;
    if (conceded >= 3) rating -= 0.6;
  } else if (isDefensive(player.position)) {
    rating += playerClearances * 0.15;
    if (conceded === 0) rating += 0.4;
    if (conceded >= 3) rating -= 0.3;
  } else {
    rating += playerKeyPasses * 0.2;
    rating += playerDribbles * 0.1;
  }

  if (isSub) rating -= 0.3;

  return clamp(Math.round(rating * 10) / 10, 1, 10);
}

export function computeAvgRating(matchRatings: number[]): number {
  if (matchRatings.length === 0) return 0;
  const sum = matchRatings.reduce((a, b) => a + b, 0);
  return Math.round((sum / matchRatings.length) * 10) / 10;
}

export type MotmResult = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  rating: number;
};

export function computeMotm(
  state: MatchState,
  home: { team: Team; players: Player[] },
  away: { team: Team; players: Player[] },
): MotmResult | null {
  // Determine winner side — MOTM must be from the winning team (draw: no restriction)
  const hs = state.score.home;
  const as_ = state.score.away;
  let winnerSide: 'home' | 'away' | null = null;
  if (hs > as_) winnerSide = 'home';
  else if (as_ > hs) winnerSide = 'away';
  else if (state.penaltyScore) {
    winnerSide = state.penaltyScore.home > state.penaltyScore.away ? 'home' : 'away';
  }

  const homeMap = new Map(home.players.map((p) => [p.id, p]));
  const awayMap = new Map(away.players.map((p) => [p.id, p]));

  const matchGoals = new Map<string, number>();
  const matchAssists = new Map<string, number>();
  const matchYellows = new Map<string, number>();
  const matchReds = new Map<string, number>();
  const inc = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);

  const events = state.events;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type === 'goal' && ev.playerId) {
      inc(matchGoals, ev.playerId);
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const prior = events[j];
        if (prior.type === 'keyPass' && prior.side === ev.side && prior.playerId) {
          inc(matchAssists, prior.playerId);
          break;
        }
        if (prior.type === 'goal') break;
      }
    }
    if (ev.type === 'yellow' && ev.playerId) inc(matchYellows, ev.playerId);
    if (ev.type === 'red' && ev.playerId) inc(matchReds, ev.playerId);
  }

  const subEventIds = new Set(
    state.events.filter((e) => e.type === 'substitution' && e.playerId).map((e) => e.playerId!),
  );

  function participatedIds(side: 'home' | 'away'): Set<string> {
    const initial = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
    const ids = new Set(initial);
    for (const ev of state.events) {
      if (ev.type === 'substitution' && ev.side === side && ev.playerId) ids.add(ev.playerId);
    }
    return ids;
  }

  let best: MotmResult | null = null;

  for (const [side, sideData] of [['home', home], ['away', away]] as const) {
    // Skip loser side when there is a clear winner
    if (winnerSide && side !== winnerSide) continue;
    const sideMap = side === 'home' ? homeMap : awayMap;
    const ids = participatedIds(side);
    for (const pid of ids) {
      const playerData = sideMap.get(pid);
      if (!playerData) continue;
      const isSub = subEventIds.has(pid) && !state.homeOnPitch.includes(pid) && !state.awayOnPitch.includes(pid)
        ? false
        : subEventIds.has(pid);
      const rating = computeMatchRating(
        playerData,
        side,
        state,
        matchGoals.get(pid) ?? 0,
        matchAssists.get(pid) ?? 0,
        matchYellows.get(pid) ?? 0,
        matchReds.get(pid) ?? 0,
        isSub,
      );
      if (!best || rating > best.rating || (rating === best.rating && (matchGoals.get(pid) ?? 0) > (matchGoals.get(best.playerId) ?? 0))) {
        best = {
          playerId: pid,
          playerName: `${playerData.firstName} ${playerData.lastName}`,
          teamId: sideData.team.id,
          teamName: sideData.team.name,
          rating,
        };
      }
    }
  }

  return best;
}

export function accumulateMatchStats(
  prev: Record<string, PlayerCompStats>,
  state: MatchState,
  home: { team: Team; players: Player[] },
  away: { team: Team; players: Player[] },
): Record<string, PlayerCompStats> {
  const stats: Record<string, PlayerCompStats> = {};
  for (const [k, v] of Object.entries(prev)) {
    stats[k] = { ...v, matchRatings: [...(v.matchRatings ?? [])], motmCount: v.motmCount ?? 0 };
  }

  const homeMap = new Map(home.players.map((p) => [p.id, p]));
  const awayMap = new Map(away.players.map((p) => [p.id, p]));

  function resolvePlayer(id: string): [Player, Team, 'home' | 'away'] | null {
    const hp = homeMap.get(id);
    if (hp) return [hp, home.team, 'home'];
    const ap = awayMap.get(id);
    if (ap) return [ap, away.team, 'away'];
    return null;
  }

  function ensure(p: Player, team: Team): PlayerCompStats {
    if (!stats[p.id]) {
      stats[p.id] = {
        playerId: p.id,
        playerName: `${p.firstName} ${p.lastName}`,
        teamId: team.id,
        teamName: team.name,
        overall: p.overall,
        position: p.position,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        saves: 0,
        yellowCards: 0,
        redCards: 0,
        matchRatings: [],
        avgRating: 0,
        motmCount: 0,
      };
    }
    return stats[p.id];
  }

  // Per-player counters for this match
  const matchGoals = new Map<string, number>();
  const matchAssists = new Map<string, number>();
  const matchYellows = new Map<string, number>();
  const matchReds = new Map<string, number>();

  const inc = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);

  const events = state.events;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    if (ev.type === 'goal' && ev.playerId) {
      const r = resolvePlayer(ev.playerId);
      if (r) { ensure(r[0], r[1]).goals++; inc(matchGoals, ev.playerId); }

      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const prior = events[j];
        if (prior.type === 'keyPass' && prior.side === ev.side && prior.playerId) {
          const ra = resolvePlayer(prior.playerId);
          if (ra) { ensure(ra[0], ra[1]).assists++; inc(matchAssists, prior.playerId); }
          break;
        }
        if (prior.type === 'goal') break;
      }
    }

    if (ev.type === 'yellow' && ev.playerId) {
      const r = resolvePlayer(ev.playerId);
      if (r) { ensure(r[0], r[1]).yellowCards++; inc(matchYellows, ev.playerId); }
    }

    if (ev.type === 'red' && ev.playerId) {
      const r = resolvePlayer(ev.playerId);
      if (r) { ensure(r[0], r[1]).redCards++; inc(matchReds, ev.playerId); }
    }
  }

  // Clean sheets
  function findGk(players: Map<string, Player>, onPitch: string[]): Player | undefined {
    for (const id of onPitch) {
      const p = players.get(id);
      if (p?.position === 'GK') return p;
    }
    return undefined;
  }
  if (state.score.away === 0) {
    const gk = findGk(homeMap, state.homeOnPitch);
    if (gk) ensure(gk, home.team).cleanSheets++;
  }
  if (state.score.home === 0) {
    const gk = findGk(awayMap, state.awayOnPitch);
    if (gk) ensure(gk, away.team).cleanSheets++;
  }

  // Accumulate saves per GK from playerSaves map
  for (const [pid, saveCount] of Object.entries(state.playerSaves)) {
    const r = resolvePlayer(pid);
    if (r) ensure(r[0], r[1]).saves = (ensure(r[0], r[1]).saves ?? 0) + saveCount;
  }

  // Collect all participants: starters (lineup) + subs (players who entered)
  const subEventIds = new Set(
    state.events.filter((e) => e.type === 'substitution' && e.playerId).map((e) => e.playerId!),
  );

  function participatedIds(side: 'home' | 'away'): Set<string> {
    const initial = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
    // homeOnPitch/awayOnPitch at end contains current players; subs who entered are in sub events
    const ids = new Set(initial);
    for (const ev of state.events) {
      if (ev.type === 'substitution' && ev.side === side && ev.playerId) ids.add(ev.playerId);
    }
    return ids;
  }

  for (const [side, sideData] of [['home', home], ['away', away]] as const) {
    const ids = participatedIds(side);
    for (const pid of ids) {
      const playerData = side === 'home' ? homeMap.get(pid) : awayMap.get(pid);
      if (!playerData) continue;
      const entry = ensure(playerData, sideData.team);
      const isSub = subEventIds.has(pid) && !state.homeOnPitch.includes(pid) && !state.awayOnPitch.includes(pid)
        ? false // entered as sub and still on pitch
        : subEventIds.has(pid);
      const rating = computeMatchRating(
        playerData,
        side,
        state,
        matchGoals.get(pid) ?? 0,
        matchAssists.get(pid) ?? 0,
        matchYellows.get(pid) ?? 0,
        matchReds.get(pid) ?? 0,
        isSub,
      );
      entry.matchRatings.push(rating);
      entry.avgRating = computeAvgRating(entry.matchRatings);
    }
  }

  // Increment motmCount for the best rated player this match
  const motm = computeMotm(state, home, away);
  if (motm && stats[motm.playerId]) {
    stats[motm.playerId].motmCount = (stats[motm.playerId].motmCount ?? 0) + 1;
  }

  return stats;
}

export function computeAwards(
  playerStats: Record<string, PlayerCompStats>,
): { topScorer: string | null; topAssister: string | null; bestGK: string | null; bestPlayer: string | null } {
  const all = Object.values(playerStats).filter((p) => p.matchRatings.length > 0);
  if (all.length === 0) return { topScorer: null, topAssister: null, bestGK: null, bestPlayer: null };

  const byGoals = [...all].sort((a, b) => b.goals - a.goals || b.avgRating - a.avgRating);
  const topScorer = byGoals[0]?.goals > 0 ? byGoals[0].playerId : null;

  const byAssists = [...all].sort((a, b) => b.assists - a.assists || b.avgRating - a.avgRating);
  const topAssister = byAssists[0]?.assists > 0 ? byAssists[0].playerId : null;

  // bestGK = GK position, ranked by saves then cleanSheets then avgRating
  const gks = all.filter((p) => p.position === 'GK');
  const byGK = [...gks].sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0) || b.cleanSheets - a.cleanSheets || b.avgRating - a.avgRating);
  const bestGK = byGK[0]?.playerId ?? null;

  const byRating = [...all]
    .filter((p) => p.matchRatings.length >= 1)
    .sort((a, b) => b.avgRating - a.avgRating || b.goals - a.goals);
  const bestPlayer = byRating[0]?.playerId ?? null;

  return { topScorer, topAssister, bestGK, bestPlayer };
}
