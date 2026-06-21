/** Morale system — per-team value 1–100 tracked across a competition. */

export const MORALE_DEFAULT = 50;

function clamp(n: number, lo = 1, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

/**
 * Update morale for both sides after a match result.
 * Win: +5 to +9 (bigger wins give more).
 * Draw: ±0 to +1.
 * Loss: -4 to -8 (bigger losses hurt more).
 * Effect is intentionally small — morale is a flavour modifier, not a game-decider.
 */
export function updateMorale(
  current: Record<string, number>,
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
): Record<string, number> {
  const next = { ...current };
  if (!(homeId in next)) next[homeId] = MORALE_DEFAULT;
  if (!(awayId in next)) next[awayId] = MORALE_DEFAULT;

  const diff = homeGoals - awayGoals;

  if (diff > 0) {
    // Home wins
    const bonus = Math.min(9, 5 + Math.floor(diff / 2));
    const malus = Math.min(8, 4 + Math.floor(diff / 2));
    next[homeId] = clamp(next[homeId] + bonus);
    next[awayId] = clamp(next[awayId] - malus);
  } else if (diff < 0) {
    // Away wins
    const bonus = Math.min(9, 5 + Math.floor(-diff / 2));
    const malus = Math.min(8, 4 + Math.floor(-diff / 2));
    next[awayId] = clamp(next[awayId] + bonus);
    next[homeId] = clamp(next[homeId] - malus);
  } else {
    // Draw — slight bump for both
    next[homeId] = clamp(next[homeId] + 1);
    next[awayId] = clamp(next[awayId] + 1);
  }

  return next;
}

/**
 * Init morale map for a new competition (all teams start at 50).
 */
export function initMorale(teamIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of teamIds) out[id] = MORALE_DEFAULT;
  return out;
}

/**
 * Translate morale (1–100) to a small multiplier for attack/defense/midfield.
 * Range: 0.95–1.05 (max ±5% — won't decide matches).
 */
export function moraleMult(morale: number): number {
  return 1 + ((morale - 50) / 50) * 0.05;
}

export function moraleLabel(morale: number): { text: string; color: string } {
  if (morale >= 85) return { text: 'Excellent', color: 'text-green-400' };
  if (morale >= 70) return { text: 'Bon', color: 'text-green-300' };
  if (morale >= 55) return { text: 'Correct', color: 'text-muted' };
  if (morale >= 40) return { text: 'Fragile', color: 'text-warning' };
  if (morale >= 25) return { text: 'Bas', color: 'text-orange-400' };
  return { text: 'En crise', color: 'text-danger' };
}
