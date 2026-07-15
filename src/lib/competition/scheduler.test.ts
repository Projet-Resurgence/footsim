import { describe, expect, it } from 'vitest';
import { isMathematicallyEliminated } from './scheduler';
import type { CompMatch, CompGroup, Standing } from './types';

function standing(teamId: string, points: number, played = 3): Standing {
  return { teamId, played, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points };
}

function pendingMatch(id: string, home: string, away: string, phase = 'group'): CompMatch {
  return { id, homeTeamId: home, awayTeamId: away, round: 3, phase, leg: 1, status: 'pending' };
}

const groups: CompGroup[] = [
  { id: 'A', name: 'Groupe A', teamIds: ['a1', 'a2', 'a3', 'a4'] },
  { id: 'B', name: 'Groupe B', teamIds: ['b1', 'b2', 'b3', 'b4'] },
];

describe('isMathematicallyEliminated', () => {
  it('phase KO : jamais éliminé par le calcul', () => {
    expect(isMathematicallyEliminated({
      teamId: 'a1', phase: 'QF', matches: [], standings: { a1: standing('a1', 0) },
      groups, qualifyCount: 2,
    })).toBe(false);
  });

  it('groupe : compare DANS le groupe, pas au classement global', () => {
    // a3 a 3 pts, plus de match — dans son groupe a1(9) et a2(6) sont injoignables → éliminé
    // mais le groupe B a des scores énormes qui ne doivent PAS compter
    const standings = {
      a1: standing('a1', 9), a2: standing('a2', 6), a3: standing('a3', 3), a4: standing('a4', 0),
      b1: standing('b1', 9), b2: standing('b2', 9), b3: standing('b3', 9), b4: standing('b4', 9),
    };
    expect(isMathematicallyEliminated({
      teamId: 'a3', phase: 'group', matches: [], standings, groups, qualifyCount: 2,
    })).toBe(true);
    // a2 (6 pts) n'est PAS éliminé : seul a1 le dépasse, 1 injoignable < 2 places
    expect(isMathematicallyEliminated({
      teamId: 'a2', phase: 'group', matches: [], standings, groups, qualifyCount: 2,
    })).toBe(false);
  });

  it('match par match : un match restant garde l\'équipe en vie', () => {
    const standings = {
      a1: standing('a1', 9), a2: standing('a2', 5), a3: standing('a3', 3), a4: standing('a4', 0),
    };
    // a3 peut atteindre 6 > a2 (5) → pas éliminé tant qu'il lui reste un match
    expect(isMathematicallyEliminated({
      teamId: 'a3', phase: 'group',
      matches: [pendingMatch('m1', 'a3', 'a4')],
      standings, groups, qualifyCount: 2,
    })).toBe(false);
  });

  it('bestThirds : une place de plus reste atteignable', () => {
    const standings = {
      a1: standing('a1', 9), a2: standing('a2', 7), a3: standing('a3', 3), a4: standing('a4', 0),
    };
    // sans bestThirds : a1 et a2 injoignables → éliminé
    expect(isMathematicallyEliminated({
      teamId: 'a3', phase: 'group', matches: [], standings, groups, qualifyCount: 2,
    })).toBe(true);
    // avec bestThirds : la 3e place peut encore qualifier → pas éliminé
    expect(isMathematicallyEliminated({
      teamId: 'a3', phase: 'group', matches: [], standings, groups, qualifyCount: 2, bestThirds: 4,
    })).toBe(false);
  });

  it('moins de 3 matchs joués : jamais éliminé', () => {
    const standings = { a1: standing('a1', 9), a3: standing('a3', 0, 2) };
    expect(isMathematicallyEliminated({
      teamId: 'a3', phase: 'group', matches: [], standings, groups, qualifyCount: 1,
    })).toBe(false);
  });
});

import { isCompetitionFinished } from './scheduler';

function match(id: string, phase: string, status: 'pending' | 'completed', home: string | null = 'h', away: string | null = 'a'): CompMatch {
  return { id, homeTeamId: home, awayTeamId: away, round: 1, phase, leg: 1, status };
}

describe('isCompetitionFinished', () => {
  it('groups_knockout : poules finies + placeholders KO nuls → PAS terminée', () => {
    const matches = [
      match('g1', 'group', 'completed'),
      match('g2', 'group', 'completed'),
      match('sf', 'SF', 'pending', null, null),
      match('f', 'F', 'pending', null, null),
    ];
    expect(isCompetitionFinished('groups_knockout', matches)).toBe(false);
  });

  it('groups_knockout : finale jouée → terminée (bye 3e place nul exempté)', () => {
    const matches = [
      match('g1', 'group', 'completed'),
      match('f', 'F', 'completed'),
      match('t', '3rd', 'pending', null, null),
    ];
    expect(isCompetitionFinished('groups_knockout', matches)).toBe(true);
  });

  it('cup : finale en attente → pas terminée ; jouée → terminée', () => {
    expect(isCompetitionFinished('cup', [match('f', 'F', 'pending')])).toBe(false);
    expect(isCompetitionFinished('cup', [match('f', 'F', 'completed')])).toBe(true);
  });

  it('league / lpm : tous les matchs doivent être joués', () => {
    expect(isCompetitionFinished('league', [match('m1', 'league', 'completed'), match('m2', 'league', 'pending')])).toBe(false);
    expect(isCompetitionFinished('lpm', [match('m1', 'league', 'completed'), match('p1', 'lpm_playoff', 'pending', null, null)])).toBe(false);
    expect(isCompetitionFinished('lpm', [match('m1', 'league', 'completed'), match('p1', 'lpm_playoff', 'completed')])).toBe(true);
  });

  it('aucun match → pas terminée', () => {
    expect(isCompetitionFinished('cup', [])).toBe(false);
  });
});
