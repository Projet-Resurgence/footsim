import { describe, expect, it } from 'vitest';
import { computeOverall } from './overall';
import { generatePlayers, reratePlayers } from './players';

describe('generatePlayers', () => {
  it('produces the requested number of players', () => {
    const out = generatePlayers({ count: 100, culture: 'francais', globalStrength: 60 });
    expect(out).toHaveLength(100);
  });

  it('all stats are in [1,20], age in [16,38], overall in [1,100]', () => {
    const out = generatePlayers({ count: 200, culture: 'francais', globalStrength: 50 });
    for (const p of out) {
      expect(p.age).toBeGreaterThanOrEqual(16);
      expect(p.age).toBeLessThanOrEqual(38);
      expect(p.overall).toBeGreaterThanOrEqual(1);
      expect(p.overall).toBeLessThanOrEqual(100);
      const flat = [
        ...Object.values(p.stats.technical),
        ...Object.values(p.stats.mental),
        ...Object.values(p.stats.physical),
        ...(p.stats.goalkeeping ? Object.values(p.stats.goalkeeping) : []),
      ];
      for (const v of flat) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(20);
      }
    }
  });

  it('only GKs have goalkeeping stats', () => {
    const out = generatePlayers({ count: 300, culture: 'francais', globalStrength: 50 });
    for (const p of out) {
      if (p.position === 'GK') expect(p.stats.goalkeeping).not.toBeNull();
      else expect(p.stats.goalkeeping).toBeNull();
    }
  });

  it('higher globalStrength yields higher mean overall', () => {
    const low = generatePlayers({ count: 300, culture: 'francais', globalStrength: 20 });
    const high = generatePlayers({ count: 300, culture: 'francais', globalStrength: 90 });
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(high.map((p) => p.overall))).toBeGreaterThan(
      mean(low.map((p) => p.overall)),
    );
  });

  it('rerates players without changing identity or position-specific overall rules', () => {
    const original = generatePlayers({ count: 120, culture: 'francais', globalStrength: 45 });
    const rerated = reratePlayers(original, { culture: 'francais', globalStrength: 85 });

    expect(rerated).toHaveLength(original.length);

    for (let i = 0; i < original.length; i++) {
      expect(rerated[i].id).toBe(original[i].id);
      expect(rerated[i].firstName).toBe(original[i].firstName);
      expect(rerated[i].lastName).toBe(original[i].lastName);
      expect(rerated[i].age).toBe(original[i].age);
      expect(rerated[i].position).toBe(original[i].position);
      expect(rerated[i].preferredFoot).toBe(original[i].preferredFoot);
      expect(rerated[i].altPositions).toEqual(original[i].altPositions);
      expect(rerated[i].overall).toBe(computeOverall(rerated[i]));

      if (rerated[i].position === 'GK') expect(rerated[i].stats.goalkeeping).not.toBeNull();
      else expect(rerated[i].stats.goalkeeping).toBeNull();
    }
  });
});
