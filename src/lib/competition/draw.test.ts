import { describe, it, expect } from 'vitest';
import {
  buildPots, conductDraw, conductCupDraw, buildKnockoutPots, conductKnockoutDraw,
  teamContinentsOf,
} from './draw';
import { buildBracketFromPairs, padWithByes, generateCupBracket } from './scheduler';
import type { Team, Continent } from '@/lib/types';

function mkTeam(id: string, strength: number, continent?: Continent): Team {
  return {
    id,
    slug: id,
    name: id.toUpperCase(),
    flag: '',
    culture: 'francais',
    continents: continent ? [continent] : undefined,
    globalStrength: strength,
    createdAt: '',
    createdBy: '',
    ownerId: '',
    playerCount: 23,
    formation: '4-4-2',
  } as Team;
}

describe('buildPots', () => {
  const teams = Array.from({ length: 16 }, (_, i) => mkTeam(`t${i}`, 100 - i));

  it('splits 16 teams into 4 pots of 4 by strength', () => {
    const pots = buildPots(teams);
    expect(pots).toHaveLength(4);
    expect(pots.map((p) => p.teamIds.length)).toEqual([4, 4, 4, 4]);
    // strongest 4 in pot 1
    expect(new Set(pots[0].teamIds)).toEqual(new Set(['t0', 't1', 't2', 't3']));
  });

  it('forces host into pot 1', () => {
    const pots = buildPots(teams, 't15');
    expect(pots[0].teamIds).toContain('t15');
    expect(pots[0].teamIds).toHaveLength(4);
  });

  it('sorts by CMF points when method=cmf', () => {
    const cmf: Record<string, number> = {};
    teams.forEach((t, i) => { cmf[t.id] = i; }); // reversed order
    const pots = buildPots(teams, undefined, 'cmf', cmf);
    expect(new Set(pots[0].teamIds)).toEqual(new Set(['t15', 't14', 't13', 't12']));
  });

  it('spreads each continent across pots when method=continent', () => {
    const conts: Continent[] = ['europe', 'afrique', 'asie', 'amerique'];
    const contTeams = Array.from({ length: 16 }, (_, i) => mkTeam(`c${i}`, 100 - i, conts[Math.floor(i / 4)]));
    const pots = buildPots(contTeams, undefined, 'continent');
    for (const pot of pots) {
      const potConts = pot.teamIds.map((id) => teamContinentsOf(contTeams.find((t) => t.id === id))[0]);
      expect(new Set(potConts).size).toBe(4); // one team of each continent per pot
    }
  });
});

describe('conductDraw', () => {
  it('assigns one team per pot per group', () => {
    const teams = Array.from({ length: 16 }, (_, i) => mkTeam(`t${i}`, 100 - i));
    const pots = buildPots(teams);
    const result = conductDraw(pots, 4);
    const groups = Object.values(result.groups);
    expect(groups).toHaveLength(4);
    for (const g of groups) expect(g).toHaveLength(4);
    expect(result.order).toHaveLength(16);
  });

  it('places host in group_0', () => {
    const teams = Array.from({ length: 16 }, (_, i) => mkTeam(`t${i}`, 100 - i));
    const pots = buildPots(teams, 't5');
    const result = conductDraw(pots, 4, { hostTeamId: 't5' });
    expect(result.groups['group_0']).toContain('t5');
  });

  it('avoids same-continent duplicates when achievable', () => {
    const conts: Continent[] = ['europe', 'afrique', 'asie', 'amerique'];
    const teams = Array.from({ length: 16 }, (_, i) => mkTeam(`t${i}`, 100 - i, conts[i % 4]));
    const continents: Record<string, Continent[]> = {};
    for (const t of teams) continents[t.id] = t.continents!;
    const pots = buildPots(teams, undefined, 'continent');
    const result = conductDraw(pots, 4, { avoidSameContinent: true, continents });
    for (const g of Object.values(result.groups)) {
      const gConts = g.map((id) => continents[id][0]);
      expect(new Set(gConts).size).toBe(4);
    }
  });
});

describe('conductCupDraw', () => {
  it('pairs all teams for a power-of-2 count', () => {
    const teams = Array.from({ length: 8 }, (_, i) => mkTeam(`t${i}`, 100 - i));
    const result = conductCupDraw(buildPots(teams));
    const pairs = Object.values(result.groups);
    expect(pairs).toHaveLength(4);
    for (const p of pairs) expect(p).toHaveLength(2);
  });

  it('gives byes to top-pot teams for non-power-of-2 counts', () => {
    const teams = Array.from({ length: 12 }, (_, i) => mkTeam(`t${i}`, 100 - i));
    const result = conductCupDraw(buildPots(teams));
    const pairs = Object.values(result.groups);
    expect(pairs).toHaveLength(8); // bracket 16 → 8 slots
    const byes = pairs.filter((p) => p.length === 1);
    expect(byes).toHaveLength(4);
    expect(pairs.flat()).toHaveLength(12); // everyone drawn exactly once
  });
});

describe('conductKnockoutDraw', () => {
  const byRank = [
    ['w0', 'w1', 'w2', 'w3'], // winners of groups A-D
    ['r0', 'r1', 'r2', 'r3'], // runners-up of groups A-D
  ];

  it('protected: never pairs winner and runner-up of the same group', () => {
    for (let i = 0; i < 20; i++) {
      const result = conductKnockoutDraw(buildKnockoutPots(byRank), byRank, 'protected');
      for (const pair of Object.values(result.groups)) {
        expect(pair).toHaveLength(2);
        const wIdx = byRank[0].indexOf(pair[0]);
        const rIdx = byRank[1].indexOf(pair[1]);
        if (wIdx !== -1 && rIdx !== -1) expect(wIdx).not.toBe(rIdx);
      }
    }
  });

  it('seeded: fixed 1A-2B pattern', () => {
    const result = conductKnockoutDraw(buildKnockoutPots(byRank), byRank, 'seeded');
    const pairs = Object.values(result.groups);
    expect(pairs).toEqual([['w0', 'r1'], ['w2', 'r3'], ['w1', 'r0'], ['w3', 'r2']]);
  });

  it('includes best thirds in the pairs (12 qualifiers → 16 bracket with 4 byes)', () => {
    const ranks = [
      ['w0', 'w1', 'w2', 'w3'],
      ['r0', 'r1', 'r2', 'r3'],
      ['t0', 't1', 't2', 't3'], // best thirds
    ];
    const result = conductKnockoutDraw(buildKnockoutPots(ranks), ranks, 'protected');
    const pairs = Object.values(result.groups);
    const drawn = pairs.flat();
    expect(drawn).toHaveLength(12);
    expect(new Set(drawn).size).toBe(12); // thirds ARE drawn, no duplicates
    expect(pairs.filter((p) => p.length === 1)).toHaveLength(4); // byes
    // byes go to group winners
    for (const p of pairs.filter((x) => x.length === 1)) {
      expect(ranks[0]).toContain(p[0]);
    }
  });

  it('random: draws everyone exactly once', () => {
    const result = conductKnockoutDraw(buildKnockoutPots(byRank), byRank, 'random');
    const drawn = Object.values(result.groups).flat();
    expect(new Set(drawn).size).toBe(8);
  });
});

describe('padWithByes / bracket generation', () => {
  it('padWithByes keeps power-of-2 counts untouched', () => {
    expect(padWithByes(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('padWithByes spreads byes and gives them to first teams', () => {
    const slots = padWithByes(['a', 'b', 'c', 'd', 'e', 'f']); // 6 → 8
    expect(slots).toHaveLength(8);
    expect(slots.filter((s) => s === null)).toHaveLength(2);
    // 'a' and 'b' get the byes
    const byePartners = [];
    for (let i = 0; i < slots.length; i += 2) {
      if (slots[i + 1] === null) byePartners.push(slots[i]);
      if (slots[i] === null) byePartners.push(slots[i + 1]);
    }
    expect(new Set(byePartners)).toEqual(new Set(['a', 'b']));
  });

  it('buildBracketFromPairs preserves ceremony pair order', () => {
    const pairs = [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']];
    const matches = buildBracketFromPairs(pairs, 1, false);
    const first = matches.filter((m) => m.phase === 'SF' || m.phase === 'QF');
    const sf = matches.filter((m) => m.round === 1);
    expect(sf).toHaveLength(4);
    expect(sf.map((m) => [m.homeTeamId, m.awayTeamId])).toEqual(pairs);
    expect(first.length).toBeGreaterThan(0);
  });

  it('buildBracketFromPairs advances byes directly (no dead TBD slots)', () => {
    // 12 qualifiers: 4 byes + 4 matches → QF has 8 participants, all slots sourced
    const pairs: string[][] = [
      ['b0'], ['m0', 'm1'], ['b1'], ['m2', 'm3'],
      ['b2'], ['m4', 'm5'], ['b3'], ['m6', 'm7'],
    ];
    const matches = buildBracketFromPairs(pairs, 1, false);
    const r1 = matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(4); // byes create no match
    const r2 = matches.filter((m) => m.round === 2);
    expect(r2).toHaveLength(4);
    // every round-2 slot is either a direct team (bye) or sourced from a match
    for (const m of r2) {
      expect(m.homeTeamId !== null || m.homeFromMatch).toBeTruthy();
      expect(m.awayTeamId !== null || m.awayFromMatch).toBeTruthy();
    }
    // the 4 byes appear directly in round 2
    const r2Teams = r2.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean);
    expect(new Set(r2Teams)).toEqual(new Set(['b0', 'b1', 'b2', 'b3']));
    // final exists
    expect(matches.some((m) => m.phase === 'F')).toBe(true);
  });

  it('generateCupBracket produces no null-null dead pairs for 12 teams', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const matches = generateCupBracket(ids, 1, false);
    // 16-bracket: round 1 = 4 real matches, round 2 = 4 QF, then SF, F
    const r2 = matches.filter((m) => m.round === 2);
    expect(r2).toHaveLength(4);
    for (const m of r2) {
      expect(m.homeTeamId !== null || m.homeFromMatch).toBeTruthy();
      expect(m.awayTeamId !== null || m.awayFromMatch).toBeTruthy();
    }
    expect(matches.filter((m) => m.phase === 'F')).toHaveLength(1);
  });

  it('generateCupBracket with legs=2 creates return legs except the final', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `t${i}`);
    const matches = generateCupBracket(ids, 2, false);
    expect(matches.filter((m) => m.phase === 'QF')).toHaveLength(8); // 4 ties × 2 legs
    expect(matches.filter((m) => m.phase === 'SF')).toHaveLength(4);
    expect(matches.filter((m) => m.phase === 'F')).toHaveLength(1);
  });
});
