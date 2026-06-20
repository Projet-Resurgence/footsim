import type { Team } from '@/lib/types';

export type Pot = {
  number: 1 | 2 | 3 | 4;
  teamIds: string[];
};

export type DrawResult = {
  pots: Pot[];
  /** ordered list of drawn teamIds (for animated reveal) */
  order: string[];
  /** groupId → teamIds assigned */
  groups: Record<string, string[]>;
};

/** Assign teams to up to 4 pots by globalStrength (descending). Ties broken randomly. */
export function buildPots(teams: Team[]): Pot[] {
  const sorted = [...teams]
    .map((t) => ({ t, r: Math.random() }))
    .sort((a, b) => b.t.globalStrength - a.t.globalStrength || a.r - b.r)
    .map(({ t }) => t);
  const total = sorted.length;
  // distribute as evenly as possible across min(4, ...) pots
  const potCount = Math.min(4, total);
  const pots: Pot[] = Array.from({ length: potCount }, (_, i) => ({
    number: (i + 1) as 1 | 2 | 3 | 4,
    teamIds: [],
  }));

  sorted.forEach((team, i) => {
    const potIdx = Math.floor((i / total) * potCount);
    pots[Math.min(potIdx, potCount - 1)].teamIds.push(team.id);
  });

  return pots;
}

function rng<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draw teams from pots into groups.
 * Rule: one team per pot per group (when possible).
 * Returns draw result with animated reveal order (pot 1 first, then 2...).
 */
export function conductDraw(pots: Pot[], groupCount: number): DrawResult {
  const shuffledPots = pots.map((p) => ({ ...p, teamIds: rng(p.teamIds) }));
  const groups: Record<string, string[]> = {};
  for (let g = 0; g < groupCount; g++) {
    groups[`group_${g}`] = [];
  }

  const order: string[] = [];

  for (const pot of shuffledPots) {
    const potTeams = [...pot.teamIds];
    // sort groups by current size asc so we fill evenly
    const groupKeys = Object.keys(groups).sort(
      (a, b) => groups[a].length - groups[b].length,
    );
    for (const gKey of groupKeys) {
      if (potTeams.length === 0) break;
      // pick random team from remaining pot
      const idx = Math.floor(Math.random() * potTeams.length);
      const [team] = potTeams.splice(idx, 1);
      groups[gKey].push(team);
      order.push(team);
    }
    // any leftover (uneven) go to groups with least teams
    for (const team of potTeams) {
      const gKey = Object.keys(groups).sort(
        (a, b) => groups[a].length - groups[b].length,
      )[0];
      groups[gKey].push(team);
      order.push(team);
    }
  }

  return { pots: shuffledPots, order, groups };
}

/** True if teamCount is even (required for group stage). */
export function isEvenTeamCount(count: number): boolean {
  return count % 2 === 0;
}

/**
 * Build pots for knockout draw from qualifier ranks.
 * Each pot = one rank: pot 1 = group winners, pot 2 = runners-up, etc.
 * The draw pairs them: winner of group A vs runner-up of another group, etc.
 */
export function buildKnockoutPots(qualifiersByRank: string[][]): Pot[] {
  return qualifiersByRank.slice(0, 4).map((teamIds, i) => ({
    number: (i + 1) as 1 | 2 | 3 | 4,
    teamIds,
  }));
}

/**
 * Draw for knockout: each pot-1 team (group winner) faces a pot-2 team (runner-up)
 * from a DIFFERENT group. No same-group clash guaranteed.
 * qualifiersByRank[i] lists teams in rank order matching group order.
 * Returns order (animated reveal) + pairs as "groups" with 2 teams each.
 */
export function conductKnockoutDraw(
  pots: Pot[],
  qualifiersByRank?: string[][],
): DrawResult {
  // Build group index map: teamId → groupIndex (position in its rank array)
  // pot 1 = winners (index 0..N-1), pot 2 = runners-up (same index = same group)
  const groupCount = pots[0]?.teamIds.length ?? 0;

  if (pots.length < 2 || !qualifiersByRank || qualifiersByRank.length < 2) {
    // Fallback: just shuffle all and pair sequentially
    const all = pots.flatMap((p) => rng(p.teamIds));
    const groups: Record<string, string[]> = {};
    const order: string[] = [];
    for (let i = 0; i < all.length; i += 2) {
      const key = `ko_${i / 2}`;
      groups[key] = [all[i], all[i + 1]].filter(Boolean);
      order.push(...groups[key]);
    }
    return { pots, order, groups };
  }

  // winners[i] = group i winner, runnersUp[i] = group i runner-up
  const winners = [...qualifiersByRank[0]];
  const runnersUp = [...qualifiersByRank[1]];

  // Shuffle runners-up, then match each winner with a runner-up from a different group
  // using backtracking if needed
  const shuffledRU = rng(runnersUp);
  const assignment: string[] = new Array(groupCount).fill('');

  const rankWinners = qualifiersByRank!;
  function assign(wi: number, available: string[]): boolean {
    if (wi === groupCount) return true;
    const winner = winners[wi];
    const winnerGroupIdx = rankWinners[0].indexOf(winner);
    for (let j = 0; j < available.length; j++) {
      const ru = available[j];
      const ruGroupIdx = rankWinners[1].indexOf(ru);
      if (ruGroupIdx !== winnerGroupIdx) {
        assignment[wi] = ru;
        const next = [...available.slice(0, j), ...available.slice(j + 1)];
        if (assign(wi + 1, next)) return true;
      }
    }
    // No valid assignment without same-group clash — allow same group as fallback
    if (available.length > 0) {
      assignment[wi] = available[0];
      return assign(wi + 1, available.slice(1));
    }
    return false;
  }

  assign(0, shuffledRU);

  const groups: Record<string, string[]> = {};
  const order: string[] = [];
  for (let i = 0; i < groupCount; i++) {
    const key = `ko_${i}`;
    groups[key] = [winners[i], assignment[i]].filter(Boolean);
    order.push(winners[i]);
    if (assignment[i]) order.push(assignment[i]);
  }

  return { pots, order, groups };
}

export const POT_COLORS: Record<1 | 2 | 3 | 4, string> = {
  1: 'var(--accent)',
  2: '#e8c547',
  3: '#a78bfa',
  4: '#f87171',
};
