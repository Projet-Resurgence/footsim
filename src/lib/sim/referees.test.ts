import { describe, expect, it } from 'vitest';
import { REFEREES, pickReferee, pickDistinctReferees, refereeTemperament } from './referees';

describe('REFEREES', () => {
  it('contains exactly 50 referees with unique names and bounded traits', () => {
    expect(REFEREES).toHaveLength(50);
    expect(new Set(REFEREES.map((r) => r.name)).size).toBe(50);
    for (const r of REFEREES) {
      expect(r.foulStrictness).toBeGreaterThanOrEqual(0.85);
      expect(r.foulStrictness).toBeLessThanOrEqual(1.25);
      expect(r.cardStrictness).toBeGreaterThanOrEqual(0.70);
      expect(r.cardStrictness).toBeLessThanOrEqual(1.50);
      expect(r.redTendency).toBeGreaterThanOrEqual(0.60);
      expect(r.redTendency).toBeLessThanOrEqual(1.80);
      expect(r.penaltyTendency).toBeGreaterThanOrEqual(0.70);
      expect(r.penaltyTendency).toBeLessThanOrEqual(1.40);
      expect(r.addedTimeBias).toBeGreaterThanOrEqual(-1);
      expect(r.addedTimeBias).toBeLessThanOrEqual(2);
      expect(refereeTemperament(r)).toBeTruthy();
    }
  });

  it('is deterministic across calls', () => {
    expect(pickReferee(42)).toBe(pickReferee(42));
    expect(pickReferee(42).name).toBe(REFEREES[42 % 50].name);
  });

  it('assigns all-distinct referees for a multiplex day', () => {
    for (const count of [4, 12, 24, 50]) {
      const day = pickDistinctReferees(count, 777);
      expect(day).toHaveLength(count);
      expect(new Set(day.map((r) => r.id)).size).toBe(count);
    }
    // deterministic
    expect(pickDistinctReferees(10, 5).map((r) => r.id)).toEqual(pickDistinctReferees(10, 5).map((r) => r.id));
    // different seed → (very likely) different order
    expect(pickDistinctReferees(50, 1).map((r) => r.id)).not.toEqual(pickDistinctReferees(50, 2).map((r) => r.id));
  });

  it('caps at 50 when asking for more', () => {
    expect(pickDistinctReferees(80, 9)).toHaveLength(50);
  });
});
