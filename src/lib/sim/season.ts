import type { Player, Division, LeagueClub, SeasonState, DivisionSeason, MatchSlot, StandingsRow, MatchResult } from '@/lib/types';
import { precomputeSide } from './precompute';
import { initialState, tick, type EngineCtx } from './engine';
import { DEFAULT_RULES } from './types';

// ─── Round-robin schedule builder ───────────────────────────────────────────

/** Generate double round-robin schedule for a division (2×(n-1) match days). */
export function buildRoundRobin(division: Division): DivisionSeason {
  const clubs = division.clubs;
  const n = clubs.length;
  if (n < 2) {
    return {
      divisionId: division.id,
      schedule: [],
      results: {},
      table: clubs.map((c) => ({ clubId: c.id, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 })),
    };
  }

  // Standard round-robin using circle algorithm
  function buildHalf(teams: LeagueClub[]): MatchSlot[][] {
    const list = teams.length % 2 === 1 ? [...teams, null] : [...teams];
    const m = list.length;
    const days: MatchSlot[][] = [];
    const fixed = list[0];
    const rotating = list.slice(1);

    for (let round = 0; round < m - 1; round++) {
      const day: MatchSlot[] = [];
      const circle = [fixed, ...rotating];
      for (let i = 0; i < m / 2; i++) {
        const home = circle[i];
        const away = circle[m - 1 - i];
        if (home && away) {
          day.push({ id: crypto.randomUUID(), homeClubId: home.id, awayClubId: away.id, played: false });
        }
      }
      days.push(day);
      // rotate
      rotating.unshift(rotating.pop()!);
    }
    return days;
  }

  const firstLeg = buildHalf(clubs);
  // Second leg: swap home/away
  const secondLeg = firstLeg.map((day) =>
    day.map((slot) => ({
      id: crypto.randomUUID(),
      homeClubId: slot.awayClubId,
      awayClubId: slot.homeClubId,
      played: false,
    })),
  );

  const schedule = [...firstLeg, ...secondLeg];
  const table: StandingsRow[] = clubs.map((c) => ({ clubId: c.id, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }));

  return { divisionId: division.id, schedule, results: {}, table };
}

// ─── Single-match instant simulation ────────────────────────────────────────

function simulateMatch(
  homeClub: LeagueClub,
  awayClub: LeagueClub,
  allPlayers: Player[],
): MatchResult {
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

  function clubPlayers(club: LeagueClub): Player[] {
    return club.playerIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
  }

  const homePlayers = clubPlayers(homeClub);
  const awayPlayers = clubPlayers(awayClub);

  const homeRatings = precomputeSide(homePlayers, homeClub.formation, undefined, homeClub.tactics?.style);
  const awayRatings = precomputeSide(awayPlayers, awayClub.formation, undefined, awayClub.tactics?.style);

  // Build minimal Team objects required by engine
  const homeTeam = { id: homeClub.id, name: homeClub.name, slug: homeClub.slug } as any;
  const awayTeam = { id: awayClub.id, name: awayClub.name, slug: awayClub.slug } as any;

  const ctx: EngineCtx = {
    home: { team: homeTeam, players: new Map(homePlayers.map((p) => [p.id, p])), ratings: homeRatings },
    away: { team: awayTeam, players: new Map(awayPlayers.map((p) => [p.id, p])), ratings: awayRatings },
    eventCounter: { v: 0 },
  };

  const matchId = crypto.randomUUID();
  const state = initialState(matchId, 'instant', DEFAULT_RULES);
  state.homeOnPitch = [...homeRatings.lineup];
  state.awayOnPitch = [...awayRatings.lineup];

  // Instant loop — auto-resume halftimes
  while (state.status !== 'fulltime') {
    tick(state, ctx);
    if (state.status === 'halftime' || state.status === 'extraTimeHalfTime') {
      tick(state, ctx); // force resume
    }
  }

  return { homeGoals: state.score.home, awayGoals: state.score.away };
}

// ─── Update standings ────────────────────────────────────────────────────────

function applyResult(table: StandingsRow[], slot: MatchSlot, result: MatchResult): StandingsRow[] {
  return table.map((row) => {
    if (row.clubId === slot.homeClubId) {
      const w = result.homeGoals > result.awayGoals ? 1 : 0;
      const d = result.homeGoals === result.awayGoals ? 1 : 0;
      const l = result.homeGoals < result.awayGoals ? 1 : 0;
      return { ...row, pts: row.pts + w * 3 + d, w: row.w + w, d: row.d + d, l: row.l + l, gf: row.gf + result.homeGoals, ga: row.ga + result.awayGoals };
    }
    if (row.clubId === slot.awayClubId) {
      const w = result.awayGoals > result.homeGoals ? 1 : 0;
      const d = result.homeGoals === result.awayGoals ? 1 : 0;
      const l = result.awayGoals < result.homeGoals ? 1 : 0;
      return { ...row, pts: row.pts + w * 3 + d, w: row.w + w, d: row.d + d, l: row.l + l, gf: row.gf + result.awayGoals, ga: row.ga + result.homeGoals };
    }
    return row;
  });
}

function sortTable(table: StandingsRow[]): StandingsRow[] {
  return [...table].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });
}

// ─── Simulate one match day across all divisions ─────────────────────────────

export async function simulateDay(
  season: SeasonState,
  dayIndex: number,
  allPlayers: Player[],
  divisions: Division[],
): Promise<SeasonState> {
  const clubMap = new Map<string, LeagueClub>(
    divisions.flatMap((d) => d.clubs.map((c) => [c.id, c])),
  );

  const updatedDivisionSeasons = season.divisionSeasons.map((ds) => {
    const day = ds.schedule[dayIndex];
    if (!day) return ds;

    let { results, table } = ds;
    const updatedDay = day.map((slot) => {
      if (slot.played) return slot;
      const home = clubMap.get(slot.homeClubId);
      const away = clubMap.get(slot.awayClubId);
      if (!home || !away) return slot;

      const result = simulateMatch(home, away, allPlayers);
      results = { ...results, [slot.id]: result };
      table = applyResult(table, slot, result);
      return { ...slot, played: true };
    });

    const updatedSchedule = ds.schedule.map((d, i) => (i === dayIndex ? updatedDay : d));

    return {
      ...ds,
      schedule: updatedSchedule,
      results,
      table: sortTable(table),
    };
  });

  return {
    ...season,
    status: 'running',
    currentDay: dayIndex + 1,
    divisionSeasons: updatedDivisionSeasons,
  };
}
