import type { Continent, Team } from '@/lib/types';

export type Pot = {
  number: 1 | 2 | 3 | 4;
  teamIds: string[];
};

/** Méthode de répartition des chapeaux (tirage de groupes) */
export type PotMethod = 'overall' | 'cmf' | 'continent';

export const POT_METHOD_LABEL: Record<PotMethod, string> = {
  overall: 'Force globale',
  cmf: 'Classement CMF',
  continent: 'Continents équilibrés',
};

export const POT_METHOD_DESC: Record<PotMethod, string> = {
  overall: 'Chapeaux par force globale décroissante.',
  cmf: 'Chapeaux selon les points du classement CMF officiel.',
  continent: 'Chaque continent est réparti sur tous les chapeaux (limite les doublons par groupe).',
};

/** Méthode du tirage de phase finale */
export type KnockoutDrawMethod = 'protected' | 'seeded' | 'random';

export const KNOCKOUT_METHOD_LABEL: Record<KnockoutDrawMethod, string> = {
  protected: 'Protégé (groupes séparés)',
  seeded: 'Têtes de série (1er A vs 2e B)',
  random: 'Aléatoire intégral',
};

export const KNOCKOUT_METHOD_DESC: Record<KnockoutDrawMethod, string> = {
  protected: 'Un 1er affronte un 2e d\'un AUTRE groupe. Les meilleurs 3es complètent le tableau sans re-croiser leur groupe.',
  seeded: 'Appariement fixe façon Coupe du Monde : 1er du groupe A contre 2e du groupe B, etc. Pas de hasard.',
  random: 'Tous les qualifiés sont mélangés — deux équipes du même groupe peuvent se recroiser immédiatement.',
};

export type DrawResult = {
  pots: Pot[];
  /** ordered list of drawn teamIds (for animated reveal) */
  order: string[];
  /** groupId → teamIds assigned */
  groups: Record<string, string[]>;
};

/** Continents d'une équipe (nouveau champ multi + fallback legacy). */
export function teamContinentsOf(t: Team | undefined): Continent[] {
  if (!t) return [];
  return t.continents ?? (t.continent ? [t.continent] : []);
}

function sharesContinent(a: Continent[], b: Continent[]): boolean {
  return a.some((c) => b.includes(c));
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
 * Assign teams to up to 4 pots (descending strength within the chosen method).
 * - overall: globalStrength desc (ties shuffled)
 * - cmf: cmfPoints desc (fallback globalStrength for teams without ranking)
 * - continent: teams of each continent are dealt across pots so each pot mixes
 *   continents as much as possible (within a continent, strongest first)
 * If hostTeamId is provided, the host is forced into pot 1 regardless of method.
 */
export function buildPots(
  teams: Team[],
  hostTeamId?: string,
  method: PotMethod = 'overall',
  cmfPoints?: Record<string, number>,
): Pot[] {
  const host = hostTeamId ? teams.find((t) => t.id === hostTeamId) : undefined;
  const others = host ? teams.filter((t) => t.id !== hostTeamId) : [...teams];

  const total = teams.length;
  const potCount = Math.min(4, total);
  const pots: Pot[] = Array.from({ length: potCount }, (_, i) => ({
    number: (i + 1) as 1 | 2 | 3 | 4,
    teamIds: [],
  }));

  // Host always goes to pot 1 first
  if (host) pots[0].teamIds.push(host.id);

  const score = (t: Team) =>
    method === 'cmf' ? (cmfPoints?.[t.id] ?? -1) : t.globalStrength;

  const byScore = [...others]
    .map((t) => ({ t, r: Math.random() }))
    .sort((a, b) => score(b.t) - score(a.t) || b.t.globalStrength - a.t.globalStrength || a.r - b.r)
    .map(({ t }) => t);

  const capacity = (idx: number) => {
    // even split of ALL teams over pots — earlier pots absorb the remainder
    const base = Math.floor(total / potCount);
    const extra = idx < total % potCount ? 1 : 0;
    return base + extra;
  };

  if (method === 'continent') {
    // Bucket by primary continent, strongest first inside each bucket,
    // then deal bucket by bucket: each continent spreads over successive pots.
    const buckets = new Map<string, Team[]>();
    for (const t of byScore) {
      const key = teamContinentsOf(t)[0] ?? 'autre';
      const arr = buckets.get(key) ?? [];
      arr.push(t);
      buckets.set(key, arr);
    }
    // Biggest continents first so their overflow lands evenly
    const ordered = [...buckets.values()].sort((a, b) => b.length - a.length);
    for (const bucket of ordered) {
      let potIdx = 0;
      for (const team of bucket) {
        // next pot with room, starting where this continent left off
        let placed = false;
        for (let k = 0; k < potCount; k++) {
          const idx = (potIdx + k) % potCount;
          if (pots[idx].teamIds.length < capacity(idx)) {
            pots[idx].teamIds.push(team.id);
            potIdx = (idx + 1) % potCount;
            placed = true;
            break;
          }
        }
        if (!placed) pots[potCount - 1].teamIds.push(team.id);
      }
    }
    return pots;
  }

  // overall / cmf: fill pots in order of score
  for (const team of byScore) {
    let placed = false;
    for (let idx = 0; idx < potCount; idx++) {
      if (pots[idx].teamIds.length < capacity(idx)) {
        pots[idx].teamIds.push(team.id);
        placed = true;
        break;
      }
    }
    if (!placed) pots[potCount - 1].teamIds.push(team.id);
  }

  return pots;
}

export type GroupDrawOptions = {
  hostTeamId?: string;
  /** éviter deux équipes du même continent dans un groupe (best effort) */
  avoidSameContinent?: boolean;
  /** teamId → continents, requis pour avoidSameContinent */
  continents?: Record<string, Continent[]>;
};

/** Nombre de doublons continentaux dans un tirage (pour scorer les tentatives). */
function continentClashes(
  groups: Record<string, string[]>,
  continents: Record<string, Continent[]>,
): number {
  let clashes = 0;
  for (const tids of Object.values(groups)) {
    for (let i = 0; i < tids.length; i++) {
      for (let j = i + 1; j < tids.length; j++) {
        if (sharesContinent(continents[tids[i]] ?? [], continents[tids[j]] ?? [])) clashes++;
      }
    }
  }
  return clashes;
}

function attemptDraw(
  pots: Pot[],
  groupCount: number,
  opts: GroupDrawOptions,
): DrawResult {
  const shuffledPots = pots.map((p) => ({ ...p, teamIds: rng(p.teamIds) }));
  const groups: Record<string, string[]> = {};
  for (let g = 0; g < groupCount; g++) groups[`group_${g}`] = [];
  const order: string[] = [];
  const conts = opts.continents ?? {};

  // Host goes into group_0 first, removed from its pot before draw
  if (opts.hostTeamId) {
    for (const pot of shuffledPots) {
      const idx = pot.teamIds.indexOf(opts.hostTeamId);
      if (idx !== -1) {
        pot.teamIds.splice(idx, 1);
        groups['group_0'].push(opts.hostTeamId);
        order.push(opts.hostTeamId);
        break;
      }
    }
  }

  const groupConts = (gKey: string): Continent[] =>
    groups[gKey].flatMap((tid) => conts[tid] ?? []);

  for (const pot of shuffledPots) {
    const potTeams = [...pot.teamIds];
    while (potTeams.length > 0) {
      const team = potTeams.splice(Math.floor(Math.random() * potTeams.length), 1)[0];
      // candidate groups: smallest first
      const minSize = Math.min(...Object.values(groups).map((g) => g.length));
      const smallest = Object.keys(groups).filter((k) => groups[k].length === minSize);
      let target: string | undefined;
      if (opts.avoidSameContinent) {
        const tc = conts[team] ?? [];
        const clean = smallest.filter((k) => !sharesContinent(tc, groupConts(k)));
        target = clean.length > 0
          ? clean[Math.floor(Math.random() * clean.length)]
          : undefined;
      }
      if (!target) target = smallest[Math.floor(Math.random() * smallest.length)];
      groups[target].push(team);
      order.push(team);
    }
  }

  return { pots: shuffledPots, order, groups };
}

/**
 * Draw teams from pots into groups. One team per pot per group (when possible).
 * With avoidSameContinent, several attempts are made and the draw with the
 * fewest same-continent duplicates is kept (0 if achievable).
 */
export function conductDraw(
  pots: Pot[],
  groupCount: number,
  optsOrHost?: GroupDrawOptions | string,
): DrawResult {
  const opts: GroupDrawOptions = typeof optsOrHost === 'string'
    ? { hostTeamId: optsOrHost }
    : (optsOrHost ?? {});

  if (!opts.avoidSameContinent || !opts.continents) {
    return attemptDraw(pots, groupCount, opts);
  }

  let best: DrawResult | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < 60; i++) {
    const attempt = attemptDraw(pots, groupCount, opts);
    const score = continentClashes(attempt.groups, opts.continents);
    if (score < bestScore) {
      bestScore = score;
      best = attempt;
      if (score === 0) break;
    }
  }
  return best!;
}

/**
 * Cup draw (direct knockout from creation): pot-seeded pairs.
 * Top-pot teams face bottom-pot teams; byes (non-power-of-2 counts) go to the
 * strongest pot in draw order. Pair order = final bracket order.
 */
export function conductCupDraw(pots: Pot[]): DrawResult {
  const ordered = pots.flatMap((p) => rng(p.teamIds)); // pot order, random within pot
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(ordered.length, 2))));
  const byes = bracketSize - ordered.length;
  const byeTeams = ordered.slice(0, byes);
  const rest = ordered.slice(byes);

  const matchPairs: [string, string | null][] = [];
  for (let i = 0; i < rest.length / 2; i++) {
    matchPairs.push([rest[i], rest[rest.length - 1 - i] ?? null]); // strongest vs weakest
  }

  // interleave bye pairs evenly across the bracket
  const pairCount = bracketSize / 2;
  const byePairIdx = new Set(
    Array.from({ length: byes }, (_, i) => Math.floor((i * pairCount) / Math.max(byes, 1))),
  );
  const pairs: [string, string | null][] = [];
  let bi = 0;
  let mi = 0;
  for (let p = 0; p < pairCount; p++) {
    if (byes > 0 && byePairIdx.has(p) && bi < byeTeams.length) {
      pairs.push([byeTeams[bi++], null]);
    } else if (mi < matchPairs.length) {
      pairs.push(matchPairs[mi++]);
    }
  }

  const groups: Record<string, string[]> = {};
  const order: string[] = [];
  pairs.forEach((pair, i) => {
    const key = `ko_${String(i).padStart(2, '0')}`;
    groups[key] = pair.filter((t): t is string => !!t);
    order.push(...groups[key]);
  });
  return { pots, order, groups };
}

/** True if teamCount is even (required for group stage). */
export function isEvenTeamCount(count: number): boolean {
  return count % 2 === 0;
}

/**
 * Build pots for knockout draw from qualifier ranks.
 * Pot 1 = group winners, pot 2 = runners-up, pot 3 = best thirds, etc.
 */
export function buildKnockoutPots(qualifiersByRank: string[][]): Pot[] {
  return qualifiersByRank.slice(0, 4).map((teamIds, i) => ({
    number: (i + 1) as 1 | 2 | 3 | 4,
    teamIds,
  }));
}

/** groupIndex of a team inside qualifiersByRank (same index = same group). */
function groupIndexOf(teamId: string, qualifiersByRank: string[][]): number {
  for (const rank of qualifiersByRank) {
    const idx = rank.indexOf(teamId);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Pair a list of "seeds" with a pool avoiding same-group clashes (backtracking, fallback allowed). */
function pairAvoidingGroups(
  seeds: string[],
  pool: string[],
  qualifiersByRank: string[][],
): [string, string | null][] {
  const shuffledPool = rng(pool);
  const assignment: (string | null)[] = new Array(seeds.length).fill(null);

  function assign(i: number, available: string[], strict: boolean): boolean {
    if (i === seeds.length) return true;
    if (available.length === 0) {
      // more seeds than pool → remaining seeds get byes
      for (let k = i; k < seeds.length; k++) assignment[k] = null;
      return true;
    }
    const seedGroup = groupIndexOf(seeds[i], qualifiersByRank);
    for (let j = 0; j < available.length; j++) {
      if (strict && groupIndexOf(available[j], qualifiersByRank) === seedGroup) continue;
      assignment[i] = available[j];
      if (assign(i + 1, [...available.slice(0, j), ...available.slice(j + 1)], strict)) return true;
    }
    return false;
  }

  // Full backtracking without clashes first; if impossible, allow same-group pairs.
  if (!assign(0, shuffledPool, true)) assign(0, shuffledPool, false);
  return seeds.map((s, i) => [s, assignment[i]]);
}

/**
 * Draw for knockout.
 * - protected: each group winner faces a runner-up from a DIFFERENT group;
 *   extra qualifiers (best thirds, ranks 3/4) fill the remaining pairs while
 *   avoiding same-group clashes when possible.
 * - seeded: fixed World-Cup-style pattern (1A vs 2B, 1B vs 2A, …), no randomness.
 * - random: full shuffle of every qualifier.
 * Returns order (animated reveal) + pairs as "groups" with up to 2 teams each
 * (a single-team pair = bye/exempt).
 */
/** Interleave bye pairs evenly among match pairs so byes spread across the bracket. */
function interleaveByes(
  byeTeams: string[],
  matchPairs: [string, string | null][],
): [string, string | null][] {
  if (byeTeams.length === 0) return matchPairs;
  const pairCount = byeTeams.length + matchPairs.length;
  const byePairIdx = new Set(
    byeTeams.map((_, i) => Math.floor((i * pairCount) / byeTeams.length)),
  );
  const pairs: [string, string | null][] = [];
  let bi = 0;
  let mi = 0;
  for (let p = 0; p < pairCount; p++) {
    if (byePairIdx.has(p) && bi < byeTeams.length) pairs.push([byeTeams[bi++], null]);
    else if (mi < matchPairs.length) pairs.push(matchPairs[mi++]);
    else pairs.push([byeTeams[bi++], null]);
  }
  return pairs;
}

export function conductKnockoutDraw(
  pots: Pot[],
  qualifiersByRank?: string[][],
  method: KnockoutDrawMethod = 'protected',
): DrawResult {
  const all = pots.flatMap((p) => p.teamIds);
  const ranks = qualifiersByRank ?? pots.map((p) => p.teamIds);
  const total = all.length;
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(total, 2))));
  const byes = bracketSize - total;

  const toResult = (pairs: [string, string | null][]): DrawResult => {
    const groups: Record<string, string[]> = {};
    const order: string[] = [];
    pairs.forEach((pair, i) => {
      const key = `ko_${String(i).padStart(2, '0')}`;
      groups[key] = pair.filter((t): t is string => !!t);
      order.push(...groups[key]);
    });
    return { pots, order, groups };
  };

  if (method === 'random' || ranks.length < 2 || (ranks[0]?.length ?? 0) < 2) {
    const shuffled = rng(all);
    const byeTeams = shuffled.slice(0, byes);
    const rest = shuffled.slice(byes);
    const matchPairs: [string, string | null][] = [];
    for (let i = 0; i < rest.length; i += 2) {
      matchPairs.push([rest[i], rest[i + 1] ?? null]);
    }
    return toResult(interleaveByes(byeTeams, matchPairs));
  }

  const winners = [...ranks[0]];
  const runnersUp = [...(ranks[1] ?? [])];
  const rest = ranks.slice(2).flat();

  // Fixed pattern: groups paired (A,B), (C,D)… → 1A-2B, 1C-2D, …, then 1B-2A, 1D-2C, …
  // Requires an even group count, no extra qualifiers and no byes; otherwise protected.
  if (method === 'seeded' && byes === 0 && winners.length % 2 === 0
    && winners.length === runnersUp.length && rest.length === 0) {
    const top: [string, string | null][] = [];
    const bottom: [string, string | null][] = [];
    for (let i = 0; i < winners.length; i += 2) {
      top.push([winners[i], runnersUp[i + 1]]);
      bottom.push([winners[i + 1], runnersUp[i]]);
    }
    return toResult([...top, ...bottom]);
  }

  // protected — byes go to the best-ranked qualifiers (group winners first),
  // remaining seeds face a pool from a different group whenever possible.
  const priority = [...winners, ...runnersUp, ...rest];
  const byeTeams = priority.slice(0, byes);
  const remaining = priority.slice(byes);
  const seeds = remaining.slice(0, remaining.length / 2);
  const pool = remaining.slice(remaining.length / 2);
  const matchPairs = pairAvoidingGroups(seeds, pool, ranks);
  return toResult(interleaveByes(byeTeams, matchPairs));
}

export const POT_COLORS: Record<1 | 2 | 3 | 4, string> = {
  1: 'var(--accent)',
  2: '#e8c547',
  3: '#a78bfa',
  4: '#f87171',
};
