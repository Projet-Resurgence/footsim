import { describe, expect, it } from 'vitest';
import type { CustomTacticStyle, Formation, Player, Position, TacticStyle } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';
import {
  computeMatchupAdjustment,
  customStyleProfile,
  formationProfile,
  styleProfile,
  FORMATION_MATCHUP,
  FORMATION_PROFILE_DESC,
  FORMATION_PROFILE_LABEL,
  STYLE_MATCHUP,
  STYLE_PROFILE_DESC,
  STYLE_PROFILE_LABEL,
} from './matchup';
import type { FormationProfile, StyleProfile } from './matchup';
import { getTacticMods } from './precompute';
import { pickXI } from './lineup';

const ALL_FORMATIONS: Formation[] = [
  '4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2', '4-1-4-1', '3-4-3', '4-3-2-1',
  '4-5-1', '4-4-1-1', '3-4-1-2', '5-4-1', '3-6-1',
  '4-1-2-1-2', '3-4-2-1', '4-2-2-2', '4-2-4',
];

const ALL_STYLES = Object.keys(TACTIC_STYLE_LABEL) as TacticStyle[];

const FORMATION_PROFILES: FormationProfile[] = ['high-press', 'balanced', 'midfield-heavy', 'defensive-block', 'wide-attack'];
const STYLE_PROFILES: StyleProfile[] = ['possession-build', 'direct-attack', 'high-intensity', 'defensive', 'chaos', 'wide-play'];

describe('formationProfile', () => {
  it('classifies every formation into a known profile', () => {
    for (const f of ALL_FORMATIONS) {
      expect(FORMATION_PROFILES).toContain(formationProfile(f));
    }
  });

  it('classifies the new formations coherently', () => {
    expect(formationProfile('4-1-2-1-2')).toBe('midfield-heavy');
    expect(formationProfile('4-2-2-2')).toBe('midfield-heavy');
    expect(formationProfile('3-4-2-1')).toBe('high-press');
    expect(formationProfile('4-2-4')).toBe('wide-attack');
    expect(formationProfile('3-4-3')).toBe('wide-attack');
  });
});

describe('FORMATION_MATCHUP', () => {
  it('is a complete matrix with neutral diagonal and bounded values', () => {
    for (const a of FORMATION_PROFILES) {
      for (const b of FORMATION_PROFILES) {
        const cell = FORMATION_MATCHUP[a][b];
        expect(cell).toHaveLength(3);
        for (const v of cell) {
          expect(v).toBeGreaterThanOrEqual(0.85);
          expect(v).toBeLessThanOrEqual(1.15);
        }
        if (a === b) expect(cell).toEqual([1.0, 1.0, 1.0]);
      }
    }
  });

  it('has a label and description for every profile', () => {
    for (const p of FORMATION_PROFILES) {
      expect(FORMATION_PROFILE_LABEL[p]).toBeTruthy();
      expect(FORMATION_PROFILE_DESC[p]).toBeTruthy();
    }
  });
});

describe('styleProfile', () => {
  it('classifies every predefined style into a known profile', () => {
    for (const s of ALL_STYLES) {
      expect(STYLE_PROFILES).toContain(styleProfile(s));
    }
  });

  it('classifies the new styles coherently', () => {
    expect(styleProfile('ailes')).toBe('wide-play');
    expect(styleProfile('bloc-median')).toBe('defensive');
    expect(styleProfile('football-total')).toBe('possession-build');
  });
});

describe('STYLE_MATCHUP', () => {
  it('is a complete matrix with neutral diagonal and bounded values', () => {
    for (const a of STYLE_PROFILES) {
      for (const b of STYLE_PROFILES) {
        const cell = STYLE_MATCHUP[a][b];
        expect(cell).toHaveLength(3);
        for (const v of cell) {
          expect(v).toBeGreaterThanOrEqual(0.85);
          expect(v).toBeLessThanOrEqual(1.15);
        }
        if (a === b) expect(cell).toEqual([1.0, 1.0, 1.0]);
      }
    }
  });

  it('has a label and description for every profile', () => {
    for (const p of STYLE_PROFILES) {
      expect(STYLE_PROFILE_LABEL[p]).toBeTruthy();
      expect(STYLE_PROFILE_DESC[p]).toBeTruthy();
    }
  });
});

describe('getTacticMods', () => {
  it('returns bounded mods for every predefined style', () => {
    for (const s of ALL_STYLES) {
      const mods = getTacticMods(s);
      for (const v of Object.values(mods)) {
        expect(v).toBeGreaterThanOrEqual(0.5);
        expect(v).toBeLessThanOrEqual(1.5);
      }
    }
  });
});

describe('customStyleProfile', () => {
  it('returns null for neutral sliders', () => {
    expect(customStyleProfile({ shotFreqMult: 1, foulRateMult: 1, midfieldMult: 1, attackMult: 1, defenseMult: 1 })).toBeNull();
  });

  it('detects a defensive custom style', () => {
    expect(customStyleProfile({ shotFreqMult: 0.9, foulRateMult: 1, midfieldMult: 1, attackMult: 0.9, defenseMult: 1.2 })).toBe('defensive');
  });

  it('classifies every predefined style mods into a profile (no drift)', () => {
    // The slider-based detector should recognize the engine's own predefined styles
    for (const s of ALL_STYLES) {
      const detected = customStyleProfile(getTacticMods(s));
      expect(detected, `style ${s}`).not.toBeNull();
    }
  });
});

describe('computeMatchupAdjustment', () => {
  it('is neutral for identical setups', () => {
    const adj = computeMatchupAdjustment('4-4-2', '4-4-2', 'possession', undefined, 'possession', undefined);
    expect(adj.attackMult).toBeCloseTo(1.0);
    expect(adj.defenseMult).toBeCloseTo(1.0);
    expect(adj.midfieldMult).toBeCloseTo(1.0);
  });

  it('does not crash with a neutral custom style vs a named style (regression)', () => {
    const neutral: CustomTacticStyle = {
      id: 'x', name: 'Neutre',
      mods: { shotFreqMult: 1, foulRateMult: 1, midfieldMult: 1, attackMult: 1, defenseMult: 1 },
    };
    const adj = computeMatchupAdjustment('4-3-3', '4-4-2', undefined, neutral, 'gegenpressing', undefined);
    for (const v of Object.values(adj)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0.5);
      expect(v).toBeLessThan(1.5);
    }
  });

  it('gives the styled side an edge over a style-less side', () => {
    const withStyle = computeMatchupAdjustment('4-4-2', '4-4-2', 'possession', undefined, undefined, undefined);
    const without = computeMatchupAdjustment('4-4-2', '4-4-2', undefined, undefined, 'possession', undefined);
    expect(withStyle.midfieldMult).toBeGreaterThan(without.midfieldMult);
  });

  it('stays bounded for every formation/style pairing', () => {
    for (const fa of ALL_FORMATIONS) {
      for (const sa of ALL_STYLES) {
        const adj = computeMatchupAdjustment(fa, '4-4-2', sa, undefined, 'chaos', undefined);
        for (const v of Object.values(adj)) {
          expect(v).toBeGreaterThan(0.7);
          expect(v).toBeLessThan(1.35);
        }
      }
    }
  });
});

describe('pickXI with new formations', () => {
  const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];

  function makeRoster(): Player[] {
    const roster: Player[] = [];
    let id = 0;
    for (const pos of POSITIONS) {
      for (let i = 0; i < 3; i++) {
        roster.push({
          id: `p${id++}`, firstName: 'Test', lastName: `${pos}${i}`, age: 25,
          position: pos, altPositions: [], preferredFoot: 'right',
          stats: { technical: {}, mental: {}, physical: {}, goalkeeping: null } as Player['stats'],
          overall: 60 + i,
        });
      }
    }
    return roster;
  }

  it('fills 11 players with exactly one GK for every formation', () => {
    const roster = makeRoster();
    for (const f of ALL_FORMATIONS) {
      const { lineup } = pickXI(roster, f);
      expect(lineup, `formation ${f}`).toHaveLength(11);
      expect(lineup.filter((p) => p.position === 'GK'), `formation ${f}`).toHaveLength(1);
    }
  });
});
