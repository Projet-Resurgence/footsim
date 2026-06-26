import type { MatchState, MatchInput } from '@/lib/sim/types';
import type { Team, Player } from '@/lib/types';
import type { CompetitionKind, CompetitionScope, CompetitionImportance, GoalEvent, CardEvent } from '@/lib/competition/types';
import { readJson, writeJson, deleteFile } from './api';

// ─── CMF match point formula ─────────────────────────────────────────────────
// Base: W=3, D=1, L=0  ×  scope multiplier  ×  kind multiplier  ×  importance multiplier  ×  opp factor  ×  size multiplier
// Opp factor = sqrt(oppStrength / 50) clamped [0.5, 2.0]
// Size multiplier = based on participant count (more teams = higher stakes)

const SCOPE_MATCH_MULT: Record<CompetitionScope, number> = {
  internationale: 1.5,
  continentale: 1.3,
  regionale: 1.0,
  autre: 0.8,
};
const KIND_MATCH_MULT: Record<CompetitionKind, number> = {
  officielle: 1.5,
  amicale: 0.8,
};
const IMPORTANCE_MATCH_MULT: Record<CompetitionImportance, number> = {
  mineur: 0.4,
  regional: 0.6,
  tournoi: 0.8,
  prestige: 1.1,
  continental: 1.4,
  mondial: 2.0,
};

export function participantSizeMult(count: number | undefined): number {
  if (!count) return 1.00;
  if (count <= 2) return 0.20;
  if (count <= 4) return 0.40;
  if (count <= 8) return 0.80;
  if (count <= 16) return 1.20;
  if (count <= 32) return 1.50;
  return 2.00;
}

function goalDiffBonus(scoreFor: number, scoreAgainst: number): number {
  const gap = scoreFor - scoreAgainst;
  if (gap >= 4) return 1.0;
  if (gap >= 2) return 0.5;
  if (gap >= 1) return 0;
  const loss = -gap;
  if (loss >= 5) return -2.0;
  if (loss >= 3) return -1.0;
  if (loss >= 2) return -0.5;
  return 0;
}

export function calcCmfMatchPoints(opts: {
  scoreFor: number;
  scoreAgainst: number;
  opponentStrength: number;
  compKind?: CompetitionKind;
  compScope?: CompetitionScope;
  compImportance?: CompetitionImportance;
  participantCount?: number;
}): number {
  const base = opts.scoreFor > opts.scoreAgainst ? 3 : opts.scoreFor === opts.scoreAgainst ? 1 : -1;
  const scope = SCOPE_MATCH_MULT[opts.compScope ?? 'autre'];
  const kind = KIND_MATCH_MULT[opts.compKind ?? 'amicale'];
  const importance = IMPORTANCE_MATCH_MULT[opts.compImportance ?? 'tournoi'];
  const oppFactor = Math.min(2.5, Math.max(0.4, Math.pow(opts.opponentStrength / 50, 0.75)));
  const sizeMult = participantSizeMult(opts.participantCount);
  const bonus = goalDiffBonus(opts.scoreFor, opts.scoreAgainst);
  return Math.round((base * scope * kind * importance * oppFactor * sizeMult + bonus) * 10) / 10;
}

export type StoredMatch = {
  id: string;
  playedAt: string;
  speed: MatchState['speed'];
  home: SideResult;
  away: SideResult;
  events: MatchState['events'];
  finalScore: { home: number; away: number };
};

export type SideResult = {
  teamId: string;
  teamSlug: string;
  teamName: string;
  formation: string;
  lineup: string[];
  score: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;
  yellows: string[];
  reds: string[];
  possession: number;
};

export type RecentMatchSummary = {
  matchId: string;
  playedAt: string;
  opponentSlug: string;
  opponentName: string;
  homeAway: 'home' | 'away';
  /** Team IDs for reliable side identification */
  homeTeamId?: string;
  awayTeamId?: string;
  scoreFor: number;
  scoreAgainst: number;
  /** CMF ranking points earned/lost for this match */
  cmfPoints?: number;
  /** Opponent globalStrength at time of match (for display) */
  opponentStrength?: number;
  compKind?: import('@/lib/competition/types').CompetitionKind;
  compScope?: import('@/lib/competition/types').CompetitionScope;
  compImportance?: import('@/lib/competition/types').CompetitionImportance;
  participantCount?: number;
  /** Goal scorers for this team in this match */
  scorers?: import('@/lib/competition/types').GoalEvent[];
  /** Cards (yellow/red) for this team in this match */
  cards?: import('@/lib/competition/types').CardEvent[];
};

const MATCH_PATH = (id: string) => `data/matches/${id}.json`;
const TEAM_PATH = (slug: string) => `data/teams/${slug}/team.json`;

export type SaveMatchMeta = {
  compKind?: CompetitionKind;
  compScope?: CompetitionScope;
  compImportance?: CompetitionImportance;
  homeStrength?: number;
  awayStrength?: number;
  participantCount?: number;
};

export async function saveMatch(
  input: MatchInput,
  state: MatchState,
  token: string,
  meta?: SaveMatchMeta,
): Promise<void> {
  const stored: StoredMatch = {
    id: state.matchId,
    playedAt: new Date().toISOString(),
    speed: state.speed,
    home: buildSide(input.home.team, input.home.formation, input.home.players.map((p) => p.id), state, 'home'),
    away: buildSide(input.away.team, input.away.formation, input.away.players.map((p) => p.id), state, 'away'),
    events: state.events,
    finalScore: state.score,
  };

  const existing = await readJson<StoredMatch>(MATCH_PATH(state.matchId), token);
  await writeJson({
    path: MATCH_PATH(state.matchId),
    token,
    data: stored,
    message: `feat(matches): record ${input.home.team.slug} vs ${input.away.team.slug} (${state.score.home}-${state.score.away})`,
    sha: existing?.sha,
  });

  const homeCmf = calcCmfMatchPoints({
    scoreFor: state.score.home,
    scoreAgainst: state.score.away,
    opponentStrength: meta?.awayStrength ?? 50,
    compKind: meta?.compKind,
    compScope: meta?.compScope,
    compImportance: meta?.compImportance,
    participantCount: meta?.participantCount,
  });
  const awayCmf = calcCmfMatchPoints({
    scoreFor: state.score.away,
    scoreAgainst: state.score.home,
    opponentStrength: meta?.homeStrength ?? 50,
    compKind: meta?.compKind,
    compScope: meta?.compScope,
    compImportance: meta?.compImportance,
    participantCount: meta?.participantCount,
  });

  const allPlayers = [...input.home.players, ...input.away.players];
  const homeEvents = extractGoalsAndCards(state.events, 'home', allPlayers);
  const awayEvents = extractGoalsAndCards(state.events, 'away', allPlayers);

  await Promise.all([
    appendRecent(input.home.team, {
      matchId: state.matchId,
      playedAt: stored.playedAt,
      opponentSlug: input.away.team.slug,
      opponentName: input.away.team.name,
      homeTeamId: input.home.team.id,
      awayTeamId: input.away.team.id,
      homeAway: 'home',
      scoreFor: state.score.home,
      scoreAgainst: state.score.away,
      cmfPoints: homeCmf,
      opponentStrength: meta?.awayStrength,
      compKind: meta?.compKind,
      compScope: meta?.compScope,
      compImportance: meta?.compImportance,
      participantCount: meta?.participantCount,
      scorers: homeEvents.goals.length ? homeEvents.goals : undefined,
      cards: homeEvents.cards.length ? homeEvents.cards : undefined,
    }, token),
    appendRecent(input.away.team, {
      matchId: state.matchId,
      playedAt: stored.playedAt,
      opponentSlug: input.home.team.slug,
      opponentName: input.home.team.name,
      homeTeamId: input.home.team.id,
      awayTeamId: input.away.team.id,
      homeAway: 'away',
      scoreFor: state.score.away,
      scoreAgainst: state.score.home,
      cmfPoints: awayCmf,
      opponentStrength: meta?.homeStrength,
      compKind: meta?.compKind,
      compScope: meta?.compScope,
      compImportance: meta?.compImportance,
      participantCount: meta?.participantCount,
      scorers: awayEvents.goals.length ? awayEvents.goals : undefined,
      cards: awayEvents.cards.length ? awayEvents.cards : undefined,
    }, token),
  ]);

  // Persist coach suspension: set if ejected this match, clear if was suspended (served)
  const homeEjected = state.coachEjected?.home ?? false;
  const awayEjected = state.coachEjected?.away ?? false;
  if (homeEjected || input.home.team.coachSuspended) {
    await updateCoachSuspension(input.home.team, homeEjected, token);
  }
  if (awayEjected || input.away.team.coachSuspended) {
    await updateCoachSuspension(input.away.team, awayEjected, token);
  }
}

async function updateCoachSuspension(team: Team, suspended: boolean, token: string): Promise<void> {
  const path = TEAM_PATH(team.slug);
  const existing = await readJson<Team & { sha?: string }>(path, token);
  if (!existing) return;
  await writeJson({
    path,
    token,
    data: { ...existing, coachSuspended: suspended },
    message: `fix(coach): ${suspended ? 'suspend' : 'reinstate'} coach for ${team.slug}`,
    sha: existing.sha,
  });
}

export function extractGoalsAndCards(
  events: MatchState['events'],
  side: 'home' | 'away',
  allPlayers: Player[],
): { goals: GoalEvent[]; cards: CardEvent[] } {
  const playerMap = new Map(allPlayers.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const goals: GoalEvent[] = [];
  const cards: CardEvent[] = [];
  for (const ev of events) {
    if (ev.side !== side) continue;
    if (ev.type === 'goal' && ev.playerId) {
      goals.push({
        minute: ev.minute,
        playerId: ev.playerId,
        playerName: playerMap.get(ev.playerId) ?? '?',
        assistId: ev.assistId,
        assistName: ev.assistId ? (playerMap.get(ev.assistId) ?? undefined) : undefined,
      });
    } else if ((ev.type === 'yellow' || ev.type === 'red') && ev.playerId) {
      cards.push({
        minute: ev.minute,
        playerId: ev.playerId,
        playerName: playerMap.get(ev.playerId) ?? '?',
        type: ev.type,
      });
    }
  }
  return { goals, cards };
}

function buildSide(
  team: Team,
  formation: string,
  lineup: string[],
  state: MatchState,
  side: 'home' | 'away',
): SideResult {
  const onPitch = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  return {
    teamId: team.id,
    teamSlug: team.slug,
    teamName: team.name,
    formation,
    lineup: onPitch.length ? onPitch : lineup,
    score: state.score[side],
    shots: state.shots[side],
    shotsOnTarget: state.shotsOnTarget[side],
    fouls: state.fouls[side],
    yellows: state.cards[side].yellow,
    reds: state.cards[side].red,
    possession: state.possession[side],
  };
}

// Serialize writes per team slug to prevent concurrent SHA conflicts
const appendQueues = new Map<string, Promise<void>>();

function appendRecent(team: Team, summary: RecentMatchSummary, token: string): Promise<void> {
  const prev = appendQueues.get(team.slug) ?? Promise.resolve();
  const next = prev.then(() => doAppendRecent(team, summary, token)).catch(() => doAppendRecent(team, summary, token));
  // Store only the chain tail so the map doesn't grow forever
  appendQueues.set(team.slug, next.then(() => {}, () => {}));
  return next;
}

async function doAppendRecent(team: Team, summary: RecentMatchSummary, token: string): Promise<void> {
  type TeamWithRecent = Team & { recentMatches?: RecentMatchSummary[] };
  for (let attempt = 0; attempt < 4; attempt++) {
    const existing = await readJson<TeamWithRecent>(TEAM_PATH(team.slug), token);
    if (!existing) return;
    const recent = existing.data.recentMatches ?? [];
    if (recent.some((r) => r.matchId === summary.matchId && r.homeAway === summary.homeAway)) return;
    const next = [summary, ...recent].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    const updated: TeamWithRecent = { ...existing.data, recentMatches: next };
    try {
      await writeJson({
        path: TEAM_PATH(team.slug),
        token,
        data: updated,
        message: `chore(teams/${team.slug}): append recent match`,
        sha: existing.sha,
      });
      return;
    } catch (err) {
      const msg = String(err);
      if ((msg.includes('409') || msg.includes('422')) && attempt < 3) continue;
      throw err;
    }
  }
}

/**
 * Resync recentMatches for all teams in a competition from stored match files.
 * Overwrites existing entries for matches found — adds missing ones, ignores already-present ones.
 * Used to fix competitions completed before recentMatches tracking existed.
 */
export async function resyncCompetitionMatchHistory(
  comp: import('@/lib/competition/types').Competition,
  token: string,
  meta?: { compKind?: CompetitionKind; compScope?: CompetitionScope; compImportance?: CompetitionImportance; teamStrengths?: Record<string, number> },
): Promise<{ synced: number; skipped: number }> {
  const compKind = meta?.compKind ?? comp.kind;
  const compScope = meta?.compScope ?? comp.scope;
  const compImportance = meta?.compImportance ?? comp.importance;
  const snapshot = comp.teamSnapshot ?? {};

  const completedMatches = comp.matches.filter(
    (m) => m.status === 'completed' && m.result != null && m.homeTeamId && m.awayTeamId,
  );

  const bySlug = new Map<string, RecentMatchSummary[]>();

  for (const m of completedMatches) {
    const homeId = m.homeTeamId!;
    const awayId = m.awayTeamId!;
    const homeSnap = snapshot[homeId];
    const awaySnap = snapshot[awayId];
    const homeSlug = homeSnap?.slug ?? homeId;
    const awaySlug = awaySnap?.slug ?? awayId;
    const homeName = homeSnap?.name ?? homeId;
    const awayName = awaySnap?.name ?? awayId;
    const homeStrength = (meta?.teamStrengths?.[homeId] ?? homeSnap?.globalStrength) ?? 50;
    const awayStrength = (meta?.teamStrengths?.[awayId] ?? awaySnap?.globalStrength) ?? 50;
    const playedAt = m.simulatedAt ?? comp.createdAt ?? new Date().toISOString();
    const scoreHome = m.result!.home;
    const scoreAway = m.result!.away;

    // Extract scorers/cards from matchSummary embedded in CompMatch (no file fetch needed)
    const homeGoals = m.matchSummary?.homeGoals ?? [];
    const awayGoals = m.matchSummary?.awayGoals ?? [];
    const homeCards = m.matchSummary?.homeCards ?? [];
    const awayCards = m.matchSummary?.awayCards ?? [];
    // Fallback: load stored match file if summary absent
    if (homeGoals.length === 0 && awayGoals.length === 0 && (scoreHome > 0 || scoreAway > 0)) {
      const stored = await readJson<StoredMatch>(MATCH_PATH(m.id), token);
      if (stored) {
        const he = extractGoalsAndCards(stored.data.events, 'home', []);
        const ae = extractGoalsAndCards(stored.data.events, 'away', []);
        homeGoals.push(...he.goals); homeCards.push(...he.cards);
        awayGoals.push(...ae.goals); awayCards.push(...ae.cards);
      }
    }
    const homeEvents = { goals: homeGoals, cards: homeCards };
    const awayEvents = { goals: awayGoals, cards: awayCards };

    const participantCount = comp.teamIds?.length;
    const homeSummary: RecentMatchSummary = {
      matchId: m.id, playedAt,
      opponentSlug: awaySlug, opponentName: awayName,
      homeTeamId: homeId, awayTeamId: awayId,
      homeAway: 'home', scoreFor: scoreHome, scoreAgainst: scoreAway,
      opponentStrength: awayStrength, compKind, compScope, compImportance, participantCount,
      cmfPoints: calcCmfMatchPoints({ scoreFor: scoreHome, scoreAgainst: scoreAway, opponentStrength: awayStrength, compKind, compScope, compImportance, participantCount }),
      scorers: homeEvents.goals.length ? homeEvents.goals : undefined,
      cards: homeEvents.cards.length ? homeEvents.cards : undefined,
    };
    const awaySummary: RecentMatchSummary = {
      matchId: m.id, playedAt,
      opponentSlug: homeSlug, opponentName: homeName,
      homeTeamId: homeId, awayTeamId: awayId,
      homeAway: 'away', scoreFor: scoreAway, scoreAgainst: scoreHome,
      opponentStrength: homeStrength, compKind, compScope, compImportance, participantCount,
      cmfPoints: calcCmfMatchPoints({ scoreFor: scoreAway, scoreAgainst: scoreHome, opponentStrength: homeStrength, compKind, compScope, compImportance, participantCount }),
      scorers: awayEvents.goals.length ? awayEvents.goals : undefined,
      cards: awayEvents.cards.length ? awayEvents.cards : undefined,
    };

    const hl = bySlug.get(homeSlug) ?? []; hl.push(homeSummary); bySlug.set(homeSlug, hl);
    const al = bySlug.get(awaySlug) ?? []; al.push(awaySummary); bySlug.set(awaySlug, al);
  }

  if (bySlug.size === 0) return { synced: 0, skipped: completedMatches.length };

  let synced = 0;
  for (const [slug, newSummaries] of bySlug.entries()) {
    for (let attempt = 0; attempt < 5; attempt++) {
      type TW = Team & { recentMatches?: RecentMatchSummary[] };
      const existing = await readJson<TW>(TEAM_PATH(slug), token);
      if (!existing) break;
      const prev = existing.data.recentMatches ?? [];
      const matchIds = new Set(newSummaries.map((s) => s.matchId));
      const kept = prev.filter((r) => !matchIds.has(r.matchId));
      const sorted = [...newSummaries].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
      const next = [...sorted, ...kept].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
      try {
        await writeJson({
          path: TEAM_PATH(slug), token,
          data: { ...existing.data, recentMatches: next } as TW,
          message: `chore(teams/${slug}): resync match history from ${comp.name}`,
          sha: existing.sha,
        });
        synced++;
        break;
      } catch (err) {
        const msg = String(err);
        if ((msg.includes('409') || msg.includes('422')) && attempt < 4) continue;
        throw err;
      }
    }
  }

  return { synced, skipped: 0 };
}

/**
 * Delete stored match files for a competition sequentially (each needs its SHA fetched first).
 * Skips matches with no matchFileId or files that don't exist (404).
 */
export async function deleteCompetitionMatchFiles(
  matchFileIds: string[],
  token: string,
): Promise<{ deleted: number; skipped: number }> {
  let deleted = 0;
  let skipped = 0;
  for (const fileId of matchFileIds) {
    const path = MATCH_PATH(fileId);
    const existing = await readJson<StoredMatch>(path, token);
    if (!existing) { skipped++; continue; }
    await deleteFile(path, existing.sha, token, `chore(matches): delete ${fileId}`);
    deleted++;
  }
  return { deleted, skipped };
}
