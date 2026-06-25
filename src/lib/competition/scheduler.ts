import type { CompMatch, CompGroup, Standing } from './types';

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Berger round-robin algorithm
// Returns rounds of [homeIdx, awayIdx] pairs
function roundRobin(n: number): [number, number][][] {
  const ghost = n % 2 !== 0 ? n : -1;
  const count = n % 2 === 0 ? n : n + 1;
  const teams = Array.from({ length: count }, (_, i) => i);
  const rounds: [number, number][][] = [];

  for (let r = 0; r < count - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < count / 2; i++) {
      const h = teams[i];
      const a = teams[count - 1 - i];
      if (h !== ghost && a !== ghost) {
        round.push([h, a]);
      }
    }
    rounds.push(round);
    // rotate all except index 0
    teams.splice(1, 0, teams.pop()!);
  }
  return rounds;
}

export function generateLeagueMatches(teamIds: string[], legs: 1 | 2): CompMatch[] {
  const rounds = roundRobin(teamIds.length);
  const matches: CompMatch[] = [];

  rounds.forEach((round, ri) => {
    round.forEach(([hi, ai]) => {
      matches.push({
        id: makeId(),
        homeTeamId: teamIds[hi],
        awayTeamId: teamIds[ai],
        round: ri + 1,
        phase: 'league',
        leg: 1,
        status: 'pending',
      });
    });
  });

  if (legs === 2) {
    const firstLegCount = rounds.length;
    rounds.forEach((round, ri) => {
      round.forEach(([hi, ai]) => {
        matches.push({
          id: makeId(),
          homeTeamId: teamIds[ai],
          awayTeamId: teamIds[hi],
          round: firstLegCount + ri + 1,
          phase: 'league',
          leg: 2,
          status: 'pending',
        });
      });
    });
  }

  return matches;
}

function bracketPhaseName(matchesInRound: number): string {
  if (matchesInRound === 1) return 'F';
  if (matchesInRound === 2) return 'SF';
  if (matchesInRound === 4) return 'QF';
  if (matchesInRound === 8) return 'R16';
  if (matchesInRound === 16) return 'R32';
  if (matchesInRound === 32) return 'R64';
  // Non-standard bracket size — use generic round label
  return `KO${matchesInRound}`;
}

export function generateCupBracket(
  teamIds: string[],
  legs: 1 | 2,
  thirdPlace: boolean,
  roundOffset = 1,
): CompMatch[] {
  const shuffled = shuffle(teamIds);
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(shuffled.length, 2))));
  const padded: (string | null)[] = [...shuffled];
  while (padded.length < bracketSize) padded.push(null); // byes

  const matches: CompMatch[] = [];
  // slot[i] holds the id of the match whose winner fills bracket position i
  let roundTeams: (string | null)[] = [...padded];
  let round = roundOffset;

  while (roundTeams.filter((t) => t !== null).length > 1) {
    const nextSlots: (string | null)[] = [];
    const phase = bracketPhaseName(roundTeams.filter((t) => t !== null).length / 2);

    for (let i = 0; i < roundTeams.length; i += 2) {
      const a = roundTeams[i];
      const b = roundTeams[i + 1];

      if (a === null && b === null) { nextSlots.push(null); continue; }

      // Bye: one team advances directly
      if (a === null) { nextSlots.push(b); continue; }
      if (b === null) { nextSlots.push(a); continue; }

      const matchId = makeId();

      matches.push({
        id: matchId,
        homeTeamId: a.startsWith('winner:') ? null : a,
        awayTeamId: b.startsWith('winner:') ? null : b,
        homeFromMatch: a.startsWith('winner:') ? a.slice(7) : undefined,
        awayFromMatch: b.startsWith('winner:') ? b.slice(7) : undefined,
        round,
        phase,
        leg: 1,
        status: 'pending',
      });

      if (legs === 2 && phase !== 'F') {
        const retId = makeId();
        matches.push({
          id: retId,
          homeTeamId: b.startsWith('winner:') ? null : b,
          awayTeamId: a.startsWith('winner:') ? null : a,
          homeFromMatch: b.startsWith('winner:') ? b.slice(7) : undefined,
          awayFromMatch: a.startsWith('winner:') ? a.slice(7) : undefined,
          round,
          phase,
          leg: 2,
          status: 'pending',
        });
      }

      nextSlots.push(`winner:${matchId}`);
    }

    roundTeams = nextSlots;
    round++;
  }

  if (thirdPlace) {
    // Find the two SF match ids
    const sfMatches = matches.filter((m) => m.phase === 'SF' && m.leg === 1);
    if (sfMatches.length === 2) {
      matches.push({
        id: makeId(),
        homeTeamId: null,
        awayTeamId: null,
        homeFromMatch: sfMatches[0].id,
        awayFromMatch: sfMatches[1].id,
        round: round - 1,
        phase: '3rd',
        leg: 1,
        status: 'pending',
      });
    }
  }

  return matches;
}

export function generateGroupsKnockout(
  teamIds: string[],
  groupsCount: number,
  qualifyPerGroup: number,
  legs: 1 | 2,
  thirdPlace: boolean,
): { matches: CompMatch[]; groups: CompGroup[] } {
  const shuffled = shuffle(teamIds);
  const groups: CompGroup[] = [];

  for (let g = 0; g < groupsCount; g++) {
    const start = Math.floor((g / groupsCount) * shuffled.length);
    const end = Math.floor(((g + 1) / groupsCount) * shuffled.length);
    groups.push({
      id: `group_${g}`,
      name: `Groupe ${String.fromCharCode(65 + g)}`,
      teamIds: shuffled.slice(start, end),
    });
  }

  const allGroupMatches: CompMatch[] = [];
  let maxGroupRound = 0;

  for (const group of groups) {
    const rounds = roundRobin(group.teamIds.length);
    maxGroupRound = Math.max(maxGroupRound, rounds.length);
    rounds.forEach((round, ri) => {
      round.forEach(([hi, ai]) => {
        allGroupMatches.push({
          id: makeId(),
          homeTeamId: group.teamIds[hi],
          awayTeamId: group.teamIds[ai],
          round: ri + 1,
          phase: 'group',
          groupId: group.id,
          leg: 1,
          status: 'pending',
        });
      });
    });
  }

  // Generate knockout bracket slots (teams TBD — filled after group stage)
  const qualifiedCount = groupsCount * qualifyPerGroup;
  const qualifiedPlaceholders = Array.from({ length: qualifiedCount }, (_, i) => `qualified:${i}`);
  const knockoutMatches = generateCupBracket(qualifiedPlaceholders, legs, thirdPlace, maxGroupRound + 1).map((m) => ({
    ...m,
    homeTeamId: m.homeTeamId?.startsWith('qualified:') ? null : m.homeTeamId,
    awayTeamId: m.awayTeamId?.startsWith('qualified:') ? null : m.awayTeamId,
  }));

  return { matches: [...allGroupMatches, ...knockoutMatches], groups };
}

/** Like generateGroupsKnockout but accepts pre-drawn groups. */
export function generateGroupsKnockoutFromGroups(
  groups: CompGroup[],
  qualifyPerGroup: number,
  legs: 1 | 2,
  thirdPlace: boolean,
  bestThirds = 0,
): { matches: CompMatch[]; groups: CompGroup[] } {
  const allGroupMatches: CompMatch[] = [];
  let maxGroupRound = 0;

  for (const group of groups) {
    const rounds = roundRobin(group.teamIds.length);
    maxGroupRound = Math.max(maxGroupRound, rounds.length);
    rounds.forEach((round, ri) => {
      round.forEach(([hi, ai]) => {
        allGroupMatches.push({
          id: makeId(),
          homeTeamId: group.teamIds[hi],
          awayTeamId: group.teamIds[ai],
          round: ri + 1,
          phase: 'group',
          groupId: group.id,
          leg: 1,
          status: 'pending',
        });
      });
    });
  }

  const qualifiedCount = groups.length * qualifyPerGroup + bestThirds;
  const qualifiedPlaceholders = Array.from({ length: qualifiedCount }, (_, i) => `qualified:${i}`);
  const knockoutMatches = generateCupBracket(qualifiedPlaceholders, legs, thirdPlace, maxGroupRound + 1).map((m) => ({
    ...m,
    homeTeamId: m.homeTeamId?.startsWith('qualified:') ? null : m.homeTeamId,
    awayTeamId: m.awayTeamId?.startsWith('qualified:') ? null : m.awayTeamId,
  }));

  return { matches: [...allGroupMatches, ...knockoutMatches], groups };
}

/**
 * LPM — Ligue Préliminaire Mondiale
 * Phase 1: 11 journées aléatoires (48 équipes, 24 matchs/journée, chaque équipe joue 1 fois/journée)
 * Phase 2 (barrages): 8 duels A/R entre places 25–40, générés avec slots TBD
 *   - leg 1 : round 12, leg 2 : round 13
 *   - séeding: 25v40, 26v39 … 32v33
 */
export function generateLPMMatches(teamIds: string[]): CompMatch[] {
  if (teamIds.length !== 48) throw new Error('LPM requiert exactement 48 équipes.');
  const matches: CompMatch[] = [];

  // Round-robin partiel: générer les 47 journées complètes, prendre les 11 premières.
  // Garantit qu'aucune paire ne se rencontre deux fois dans les 11 journées.
  const shuffledIds = shuffle([...teamIds]);
  const rrRounds = roundRobin(shuffledIds.length); // 47 journées pour 48 équipes

  for (let ri = 0; ri < 11; ri++) {
    const round = rrRounds[ri];
    for (const [hi, ai] of round) {
      matches.push({
        id: makeId(),
        homeTeamId: shuffledIds[hi],
        awayTeamId: shuffledIds[ai],
        round: ri + 1,
        phase: 'league',
        leg: 1,
        status: 'pending',
      });
    }
  }

  // Barrages: 8 duels aller (round 12) + retour (round 13), équipes TBD
  for (let i = 0; i < 8; i++) {
    const leg1Id = makeId();
    const leg2Id = makeId();
    matches.push({
      id: leg1Id,
      homeTeamId: null,
      awayTeamId: null,
      round: 12,
      phase: 'lpm_playoff',
      leg: 1,
      status: 'pending',
    });
    matches.push({
      id: leg2Id,
      homeTeamId: null,
      awayTeamId: null,
      // leg 2: home/away inversés (équipe 25-32 reçoit au retour)
      homeFromMatch: leg1Id,
      awayFromMatch: leg1Id,
      round: 13,
      phase: 'lpm_playoff',
      leg: 2,
      status: 'pending',
    });
  }

  return matches;
}

/**
 * Après J11: seed les barrages LPM avec les équipes classées 25–40.
 * Si hostTeamId est défini et l'hôte finit dans le top 24 → le 25ème prend sa place (direct qual).
 * Si l'hôte finit 25-40 → il est qualifié directement, le 41ème entre en barrage à sa place.
 * Si l'hôte finit 41-48 → qualifié directement, pas d'impact sur les barrages.
 * Retourne aussi la liste des équipes directement qualifiées (top 24 + hôte éventuel).
 */
export function seedLPMPlayoffs(
  matches: CompMatch[],
  sortedStandings: Standing[],
  hostTeamId?: string,
): CompMatch[] {
  const hostRank = hostTeamId
    ? sortedStandings.findIndex((s) => s.teamId === hostTeamId)
    : -1; // 0-indexed rank

  // Build the playoff zone (16 teams, indices 24–39), adjusting for host
  let playoffZone = sortedStandings.slice(24, 40).map((s) => s.teamId);

  if (hostTeamId && hostRank >= 0) {
    if (hostRank < 24) {
      // Host in top 24 → already directly qualified, 25th (index 24) stays, no change needed
      // But the 25th slot is freed: direct qualification, so playoffZone unchanged (25-40)
      // Actually no change: the host is already top 24, zone is still indices 24-39
    } else if (hostRank >= 24 && hostRank <= 39) {
      // Host in playoff zone → remove host, add 41st (index 40) at host's position
      const hostPosInZone = hostRank - 24;
      playoffZone = [
        ...playoffZone.slice(0, hostPosInZone),
        sortedStandings[40]?.teamId ?? '',
        ...playoffZone.slice(hostPosInZone + 1),
      ].filter(Boolean);
    }
    // hostRank >= 40: host in elimination zone → qualified directly, playoffZone unchanged
  }

  // zone[0]=25e…zone[15]=40e (adjusted); confrontation i vs (15-i)
  const zone = playoffZone;
  const pairs: [string, string][] = Array.from({ length: 8 }, (_, i) => [zone[i], zone[15 - i]]);

  const leg1Matches = matches.filter((m) => m.phase === 'lpm_playoff' && m.leg === 1)
    .sort((a, b) => a.round - b.round);

  return matches.map((m) => {
    if (m.phase !== 'lpm_playoff') return m;

    const idx = leg1Matches.findIndex((x) => x.id === m.id || x.id === m.homeFromMatch);
    if (idx === -1) return m;
    const [higher, lower] = pairs[idx]; // higher = 25-32 range (home at leg2), lower = 40-33 range

    if (m.leg === 1) {
      // leg 1: lower (40e…33e) reçoit à domicile
      return { ...m, homeTeamId: lower, awayTeamId: higher };
    } else {
      // leg 2: higher (25e…32e) reçoit à domicile
      return { ...m, homeTeamId: higher, awayTeamId: lower, homeFromMatch: undefined, awayFromMatch: undefined };
    }
  });
}

export function buildInitialStandings(teamIds: string[]): Record<string, Standing> {
  const s: Record<string, Standing> = {};
  for (const id of teamIds) {
    s[id] = { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
  }
  return s;
}

export function applyResultToStandings(
  standings: Record<string, Standing>,
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
): Record<string, Standing> {
  const s = { ...standings };
  s[homeId] = { ...s[homeId] };
  s[awayId] = { ...s[awayId] };

  s[homeId].played++;
  s[awayId].played++;
  s[homeId].goalsFor += homeGoals;
  s[homeId].goalsAgainst += awayGoals;
  s[awayId].goalsFor += awayGoals;
  s[awayId].goalsAgainst += homeGoals;

  if (homeGoals > awayGoals) {
    s[homeId].won++;
    s[homeId].points += 3;
    s[awayId].lost++;
  } else if (homeGoals < awayGoals) {
    s[awayId].won++;
    s[awayId].points += 3;
    s[homeId].lost++;
  } else {
    s[homeId].drawn++;
    s[awayId].drawn++;
    s[homeId].points++;
    s[awayId].points++;
  }

  return s;
}

export function sortStandings(standings: Standing[]): Standing[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.goalsFor - a.goalsFor;
  });
}

// Advance bracket: given a completed match, fill winner into dependent matches
export function advanceBracket(matches: CompMatch[], completedMatchId: string): CompMatch[] {
  const done = matches.find((m) => m.id === completedMatchId);
  if (!done?.result || done.homeTeamId === null || done.awayTeamId === null) return matches;

  const winnerId = done.result.home > done.result.away
    ? done.homeTeamId
    : done.result.away > done.result.home
    ? done.awayTeamId
    : done.result.penalties
    ? (done.result.penalties.home > done.result.penalties.away ? done.homeTeamId : done.awayTeamId)
    : done.homeTeamId; // tie without penalties shouldn't happen in knockout

  const loserId = winnerId === done.homeTeamId ? done.awayTeamId : done.homeTeamId;

  return matches.map((m) => {
    let updated = { ...m };
    if (m.homeFromMatch === completedMatchId) {
      updated.homeTeamId = m.phase === '3rd' ? loserId : winnerId;
    }
    if (m.awayFromMatch === completedMatchId) {
      updated.awayTeamId = m.phase === '3rd' ? loserId : winnerId;
    }
    return updated;
  });
}

/**
 * Apply corruption disqualification: force 3-0 walkover for the opponent on this match,
 * then set all remaining (pending) matches of the disqualified team to walkovers too.
 * Returns updated matches + list of modified match ids.
 */
export function applyCorruptionDisqualification(
  matches: CompMatch[],
  matchId: string,
  cheatingTeamId: string,
): CompMatch[] {
  return matches.map((m) => {
    if (m.id === matchId) {
      // Override result: cheater forfeits 0-3
      const cheaterIsHome = m.homeTeamId === cheatingTeamId;
      return {
        ...m,
        status: 'completed' as const,
        result: {
          home: cheaterIsHome ? 0 : 3,
          away: cheaterIsHome ? 3 : 0,
        },
      };
    }
    // All remaining pending matches involving cheater → walkover for opponent
    if (m.status === 'pending' && (m.homeTeamId === cheatingTeamId || m.awayTeamId === cheatingTeamId)) {
      const cheaterIsHome = m.homeTeamId === cheatingTeamId;
      return {
        ...m,
        status: 'completed' as const,
        result: {
          home: cheaterIsHome ? 0 : 3,
          away: cheaterIsHome ? 3 : 0,
        },
      };
    }
    return m;
  });
}

/** Deduct 3 points from a team's standing (corruption penalty). */
export function applyPointsPenalty(
  standings: Record<string, import('./types').Standing>,
  teamId: string,
  points = 3,
): Record<string, import('./types').Standing> {
  if (!standings[teamId]) return standings;
  return {
    ...standings,
    [teamId]: { ...standings[teamId], points: Math.max(0, standings[teamId].points - points) },
  };
}

/** True if all group-phase matches are done and knockout has no teams yet. */
export function needsKnockoutDraw(matches: import('./types').CompMatch[]): boolean {
  const groupMatches = matches.filter((m) => m.phase === 'group');
  const knockoutMatches = matches.filter((m) => m.phase !== 'group' && m.phase !== '3rd');
  if (groupMatches.length === 0) return false;
  const allGroupDone = groupMatches.every((m) => m.status === 'completed');
  const knockoutUnseeded = knockoutMatches.some((m) => m.homeTeamId === null && !m.homeFromMatch);
  return allGroupDone && knockoutUnseeded;
}

/**
 * Get qualified teams per rank across groups, for the knockout draw.
 * Returns array of arrays: qualifiers[0] = all group winners, qualifiers[1] = all runners-up, etc.
 */
export function getQualifiersByRank(
  groups: import('./types').CompGroup[],
  standings: Record<string, import('./types').Standing>,
  qualifyPerGroup: number,
): string[][] {
  const byRank: string[][] = Array.from({ length: qualifyPerGroup }, () => []);
  for (const group of groups) {
    const sorted = sortStandings(group.teamIds.map((id) => standings[id]).filter(Boolean));
    for (let rank = 0; rank < qualifyPerGroup && rank < sorted.length; rank++) {
      byRank[rank].push(sorted[rank].teamId);
    }
  }
  return byRank;
}

// After group stage completes, seed knockout bracket with group qualifiers + best thirds
export function seedKnockoutFromGroups(
  matches: CompMatch[],
  groups: CompGroup[],
  standings: Record<string, Standing>,
  qualifyPerGroup: number,
  bestThirds = 0,
): CompMatch[] {
  const qualifiers: string[] = [];
  const thirds: Standing[] = [];
  for (const group of groups) {
    const groupStandings = group.teamIds.map((id) => standings[id]).filter(Boolean);
    const sorted = sortStandings(groupStandings);
    qualifiers.push(...sorted.slice(0, qualifyPerGroup).map((s) => s.teamId));
    if (bestThirds > 0 && sorted[qualifyPerGroup]) {
      thirds.push(sorted[qualifyPerGroup]);
    }
  }
  if (bestThirds > 0) {
    const bestThirdTeams = sortStandings(thirds).slice(0, bestThirds).map((s) => s.teamId);
    qualifiers.push(...bestThirdTeams);
  }
  return seedKnockoutWithOrder(matches, qualifiers);
}

/** Seed knockout slots with a pre-determined draw order. */
export function seedKnockoutWithOrder(matches: CompMatch[], qualifiers: string[]): CompMatch[] {
  const knockoutFirstRound = matches
    .filter((m) => m.phase !== 'group' && m.phase !== '3rd')
    .sort((a, b) => a.round - b.round);

  const firstRound = knockoutFirstRound[0]?.round;
  const firstRoundMatches = knockoutFirstRound.filter((m) => m.round === firstRound);

  let qi = 0;
  return matches.map((m) => {
    if (!firstRoundMatches.some((fm) => fm.id === m.id)) return m;
    const updated = { ...m };
    if (updated.homeTeamId === null && qi < qualifiers.length) {
      updated.homeTeamId = qualifiers[qi++];
    }
    if (updated.awayTeamId === null && qi < qualifiers.length) {
      updated.awayTeamId = qualifiers[qi++];
    }
    return updated;
  });
}
