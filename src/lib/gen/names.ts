import type { Culture } from '@/lib/types';
import { pick } from '@/lib/rng';

const modules = import.meta.glob<{ default: { first: string[]; last: string[] } }>(
  '@/data/names/*.json',
  { eager: true },
);

const byCulture = new Map<Culture, { first: string[]; last: string[] }>();
for (const [path, mod] of Object.entries(modules)) {
  const culture = path.split('/').pop()!.replace('.json', '') as Culture;
  byCulture.set(culture, mod.default);
}

export function pickName(culture: Culture): { firstName: string; lastName: string } {
  const pool = byCulture.get(culture);
  if (!pool) throw new Error(`Missing names for culture ${culture}`);
  return { firstName: pick(pool.first), lastName: pick(pool.last) };
}

export function hasCulture(culture: Culture): boolean {
  return byCulture.has(culture);
}
