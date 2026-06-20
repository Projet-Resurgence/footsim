import type { Culture } from '@/lib/types';
import { pick } from '@/lib/rng';

const modules = import.meta.glob<{ default: Record<string, string[]> }>(
  '@/data/names/*.json',
  { eager: true },
);

const byCulture = new Map<Culture, { first: string[]; last: string[] }>();
for (const [path, mod] of Object.entries(modules)) {
  const culture = path.split('/').pop()!.replace('.json', '') as Culture;
  const d = mod.default;
  byCulture.set(culture, {
    first: d.first ?? d.firstNames ?? [],
    last: d.last ?? d.lastNames ?? [],
  });
}

export function pickName(culture: Culture): { firstName: string; lastName: string } {
  const pool = byCulture.get(culture);
  if (!pool) throw new Error(`Missing names for culture ${culture}`);
  return { firstName: pick(pool.first), lastName: pick(pool.last) };
}

export function hasCulture(culture: Culture): boolean {
  return byCulture.has(culture);
}

export type CultureWeight = { culture: Culture; weight: number };

export function pickNameMixed(weights: CultureWeight[]): { firstName: string; lastName: string } {
  const total = weights.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return pickName(weights[0]?.culture ?? 'francais');
  let r = Math.random() * total;
  for (const cw of weights) {
    r -= cw.weight;
    if (r <= 0) return pickName(cw.culture);
  }
  return pickName(weights[weights.length - 1].culture);
}
