# FootSim — Plan 2 : Équipes & Joueurs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement player generation (Web Worker, FM-style stats per culture and global strength), team CRUD with flag upload, roster persistence in `BJBellum/footsim-data`, dashboard team list and detail pages.

**Architecture:** Pure-function generator in `lib/gen/`, run inside a Web Worker so 5,000-player generation does not block the UI. Team metadata + roster persisted as two separate JSON files per team. Zustand `teams` store keeps in-memory list synced with GitHub. Flag upload uses a `<canvas>` resize to 150×150 PNG data URL.

**Tech Stack:** Web Workers (Vite native), uuid (`crypto.randomUUID`), Canvas 2D API, all wired through React + Zustand.

---

## File Structure (Plan 2)

```
src/
├── data/names/                  # 33 cultures
│   ├── francais.json
│   ├── anglais.json
│   └── … (one per culture in spec)
├── lib/
│   ├── types.ts                 # Player, Team, Position, Culture, Formation
│   ├── slug.ts                  # name → slug
│   ├── rng.ts                   # seeded gauss + triangular
│   ├── gen/
│   │   ├── names.ts
│   │   ├── positions.ts         # distribution + boosts table
│   │   ├── overall.ts           # weighted overall per position
│   │   ├── players.ts           # main generator
│   │   ├── players.test.ts
│   │   └── worker.ts            # Web Worker entry
│   └── github/
│       ├── store.ts             # high-level team CRUD on top of api.ts
│       └── store.test.ts
├── stores/teams.ts              # Zustand teams cache
├── components/team/
│   ├── FlagUpload.tsx
│   ├── TeamCard.tsx
│   └── RosterTable.tsx
└── pages/dashboard/
    ├── Teams.tsx
    ├── TeamNew.tsx
    └── TeamDetail.tsx
```

---

## Task 1 : Types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
export type Culture =
  | 'francais' | 'anglais' | 'allemand' | 'italien' | 'espagnol' | 'portugais'
  | 'grec' | 'hongrois' | 'tcheque' | 'polonais' | 'russe' | 'ukrainien'
  | 'suedois' | 'neerlandais' | 'roumain' | 'serbe' | 'croate' | 'turc'
  | 'arabe' | 'japonais' | 'coreen' | 'chinois' | 'vietnamien' | 'thai'
  | 'indonesien' | 'persan' | 'indien' | 'israelien'
  | 'bresilien' | 'argentin' | 'mexicain' | 'anglo-americain' | 'quebecois';

export const CULTURES: Culture[] = [
  'francais','anglais','allemand','italien','espagnol','portugais',
  'grec','hongrois','tcheque','polonais','russe','ukrainien',
  'suedois','neerlandais','roumain','serbe','croate','turc',
  'arabe','japonais','coreen','chinois','vietnamien','thai',
  'indonesien','persan','indien','israelien',
  'bresilien','argentin','mexicain','anglo-americain','quebecois',
];

export const CULTURE_LABEL: Record<Culture, string> = {
  francais: 'Français', anglais: 'Anglais', allemand: 'Allemand', italien: 'Italien',
  espagnol: 'Espagnol', portugais: 'Portugais', grec: 'Grec', hongrois: 'Hongrois',
  tcheque: 'Tchèque', polonais: 'Polonais', russe: 'Russe', ukrainien: 'Ukrainien',
  suedois: 'Suédois', neerlandais: 'Néerlandais', roumain: 'Roumain', serbe: 'Serbe',
  croate: 'Croate', turc: 'Turc',
  arabe: 'Arabe', japonais: 'Japonais', coreen: 'Coréen', chinois: 'Chinois',
  vietnamien: 'Vietnamien', thai: 'Thaï', indonesien: 'Indonésien', persan: 'Persan',
  indien: 'Indien', israelien: 'Israélien',
  bresilien: 'Brésilien', argentin: 'Argentin', mexicain: 'Mexicain',
  'anglo-americain': 'Anglo-américain', quebecois: 'Québécois',
};

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';

export const POSITIONS: Position[] = ['GK','CB','LB','RB','DM','CM','AM','LM','RM','LW','RW','ST'];

export type Formation = '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1';

export type TechnicalStats = {
  passing: number; crossing: number; dribbling: number; finishing: number;
  firstTouch: number; heading: number; longShots: number;
  tackling: number; marking: number;
};
export type MentalStats = {
  vision: number; decisions: number; composure: number; anticipation: number;
  offTheBall: number; aggression: number; workRate: number;
};
export type PhysicalStats = {
  pace: number; acceleration: number; strength: number; stamina: number;
  agility: number; balance: number; jumping: number;
};
export type GoalkeepingStats = {
  reflexes: number; handling: number; aerial: number;
  oneOnOne: number; kicking: number; throwing: number;
};

export type PlayerStats = {
  technical: TechnicalStats;
  mental: MentalStats;
  physical: PhysicalStats;
  goalkeeping: GoalkeepingStats | null;
};

export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  position: Position;
  altPositions: Position[];
  preferredFoot: 'left' | 'right' | 'both';
  stats: PlayerStats;
  overall: number;
};

export type Team = {
  id: string;
  slug: string;
  name: string;
  flag: string; // data URL PNG 150x150
  culture: Culture;
  globalStrength: number;
  createdAt: string;
  createdBy: string;
  playerCount: number;
  formation: Formation;
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(types): Player, Team, Culture, Position, Formation"
```

---

## Task 2 : Slug + RNG helpers

**Files:**
- Create: `src/lib/slug.ts`, `src/lib/rng.ts`

- [ ] **Step 1: Create `src/lib/slug.ts`**

```ts
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'equipe';
}
```

- [ ] **Step 2: Create `src/lib/rng.ts`**

```ts
export function gauss(mean: number, sd: number): number {
  // Box-Muller
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

export function triangular(min: number, mode: number, max: number): number {
  const u = Math.random();
  const c = (mode - min) / (max - min);
  return u < c
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function chance(p: number): boolean {
  return Math.random() < p;
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(lib): slugify, gauss, triangular, pick, chance helpers"
```

---

## Task 3 : Names data (33 cultures)

**Files:**
- Create: `src/data/names/{culture}.json` × 33
- Create: `src/lib/gen/names.ts`

Each file has shape:
```json
{ "first": ["...", "..."], "last": ["...", "..."] }
```
Aim ~80 first + 80 last per culture (smaller is fine to start, we can extend later). Names should be realistic, common surnames + first names from the actual culture.

For brevity in this plan, only `francais.json` is shown in full. The others follow the same structure. Use any reliable open list of real-world common names per culture (Wikipedia common surnames, FM data exports, etc.). All 33 files MUST exist before the generator runs.

- [ ] **Step 1: Create `src/data/names/francais.json`** (example)

```json
{
  "first": ["Lucas","Hugo","Mathéo","Léo","Louis","Adam","Raphaël","Arthur","Liam","Nathan","Gabriel","Jules","Tom","Théo","Maxime","Antoine","Paul","Clément","Alexandre","Romain","Quentin","Julien","Florian","Pierre","Nicolas","Vincent","Sébastien","Olivier","Damien","Mathieu","Benjamin","Thomas","Yannick","Cédric","Fabien","Mickaël","Stéphane","Bastien","Adrien","Loïc","Hervé","Bruno","Gaël","Yann","Tristan","Émilien","Corentin","Sylvain","Alexis","Maxence","Etienne","Aurélien","Frédéric","Christophe","David","Anthony","Jonathan","Mathis","Enzo","Lilian","Tanguy","Erwan","Killian","Valentin","Rémi","Guillaume","Charles","Henri","Édouard","Augustin","Joachim","Camille","Rayan","Wassim","Idriss","Karim","Mehdi","Amine","Yacine","Sofiane","Younès"],
  "last": ["Martin","Bernard","Dubois","Thomas","Robert","Richard","Petit","Durand","Leroy","Moreau","Simon","Laurent","Lefèvre","Michel","Garcia","David","Bertrand","Roux","Vincent","Fournier","Morel","Girard","André","Lefèbvre","Mercier","Dupont","Lambert","Bonnet","François","Martinez","Legrand","Garnier","Faure","Rousseau","Blanc","Guérin","Muller","Henry","Roussel","Nicolas","Perrin","Morin","Mathieu","Clément","Gauthier","Dumont","Lopez","Fontaine","Chevalier","Robin","Masson","Sanchez","Gérard","Nguyen","Boyer","Denis","Lemaire","Duval","Joly","Gautier","Roger","Roche","Roy","Noël","Meyer","Lucas","Meunier","Jean","Perez","Marchand","Dufour","Blanchard","Marie","Barbier","Brun","Dumas","Brunet","Schmitt","Leroux","Colin","Fernandez"]
}
```

- [ ] **Step 2: Create the remaining 32 JSON files**

Identical shape, real names per culture. Files:

`anglais.json, allemand.json, italien.json, espagnol.json, portugais.json, grec.json, hongrois.json, tcheque.json, polonais.json, russe.json, ukrainien.json, suedois.json, neerlandais.json, roumain.json, serbe.json, croate.json, turc.json, arabe.json, japonais.json, coreen.json, chinois.json, vietnamien.json, thai.json, indonesien.json, persan.json, indien.json, israelien.json, bresilien.json, argentin.json, mexicain.json, anglo-americain.json, quebecois.json`

- [ ] **Step 3: Create `src/lib/gen/names.ts`**

```ts
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
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(names): name pools for 33 cultures + picker"
```

---

## Task 4 : Position distribution + boosts + overall weights

**Files:**
- Create: `src/lib/gen/positions.ts`, `src/lib/gen/overall.ts`

- [ ] **Step 1: Create `src/lib/gen/positions.ts`**

```ts
import type { Position } from '@/lib/types';

// Counts per 100 players. Sum == 100.
const DIST: Array<[Position, number]> = [
  ['GK', 8],
  ['CB', 18], ['LB', 7], ['RB', 7],
  ['DM', 8], ['CM', 14], ['AM', 6], ['LM', 3], ['RM', 4],
  ['LW', 6], ['RW', 6], ['ST', 13],
];

export function distributePositions(total: number): Position[] {
  const out: Position[] = [];
  for (const [pos, share] of DIST) {
    const n = Math.round((share / 100) * total);
    for (let i = 0; i < n; i++) out.push(pos);
  }
  // Pad/truncate to exact total
  while (out.length < total) out.push('CM');
  while (out.length > total) out.pop();
  // Shuffle (Fisher-Yates)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type StatKey =
  | 'technical.passing' | 'technical.crossing' | 'technical.dribbling'
  | 'technical.finishing' | 'technical.firstTouch' | 'technical.heading'
  | 'technical.longShots' | 'technical.tackling' | 'technical.marking'
  | 'mental.vision' | 'mental.decisions' | 'mental.composure' | 'mental.anticipation'
  | 'mental.offTheBall' | 'mental.aggression' | 'mental.workRate'
  | 'physical.pace' | 'physical.acceleration' | 'physical.strength' | 'physical.stamina'
  | 'physical.agility' | 'physical.balance' | 'physical.jumping'
  | 'goalkeeping.reflexes' | 'goalkeeping.handling' | 'goalkeeping.aerial'
  | 'goalkeeping.oneOnOne' | 'goalkeeping.kicking' | 'goalkeeping.throwing';

export const POSITION_BOOSTS: Record<Position, Partial<Record<StatKey, number>>> = {
  GK: {
    'goalkeeping.reflexes': 5, 'goalkeeping.handling': 5, 'goalkeeping.aerial': 4,
    'goalkeeping.oneOnOne': 4, 'goalkeeping.kicking': 3, 'goalkeeping.throwing': 3,
    'technical.passing': -2, 'technical.finishing': -3,
  },
  CB: {
    'technical.tackling': 4, 'technical.marking': 4, 'technical.heading': 3,
    'physical.strength': 3, 'physical.jumping': 3,
    'physical.pace': -1, 'technical.dribbling': -1,
  },
  LB: {
    'technical.tackling': 3, 'technical.marking': 2,
    'physical.pace': 3, 'physical.stamina': 3, 'technical.crossing': 2,
  },
  RB: {
    'technical.tackling': 3, 'technical.marking': 2,
    'physical.pace': 3, 'physical.stamina': 3, 'technical.crossing': 2,
  },
  DM: {
    'technical.tackling': 3, 'technical.marking': 2,
    'mental.decisions': 2, 'mental.anticipation': 2, 'mental.workRate': 2,
  },
  CM: {
    'technical.passing': 3, 'mental.vision': 3,
    'mental.decisions': 2, 'physical.stamina': 2,
  },
  AM: {
    'mental.vision': 3, 'technical.dribbling': 3,
    'technical.longShots': 2, 'mental.decisions': 2,
  },
  LM: {
    'physical.stamina': 2, 'technical.crossing': 3,
    'physical.pace': 2, 'technical.passing': 2,
  },
  RM: {
    'physical.stamina': 2, 'technical.crossing': 3,
    'physical.pace': 2, 'technical.passing': 2,
  },
  LW: {
    'physical.pace': 4, 'technical.dribbling': 3,
    'technical.crossing': 3, 'physical.acceleration': 3,
  },
  RW: {
    'physical.pace': 4, 'technical.dribbling': 3,
    'technical.crossing': 3, 'physical.acceleration': 3,
  },
  ST: {
    'technical.finishing': 5, 'mental.composure': 3,
    'mental.offTheBall': 3, 'technical.heading': 2,
  },
};
```

- [ ] **Step 2: Create `src/lib/gen/overall.ts`**

```ts
import type { Player, Position, PlayerStats } from '@/lib/types';

type Weights = Partial<Record<keyof PlayerStats['technical']
  | keyof PlayerStats['mental']
  | keyof PlayerStats['physical']
  | keyof NonNullable<PlayerStats['goalkeeping']>, number>>;

const WEIGHTS: Record<Position, Weights> = {
  GK: { reflexes: 5, handling: 4, oneOnOne: 3, aerial: 3, kicking: 2, throwing: 2, anticipation: 2, decisions: 2, composure: 2, jumping: 2, agility: 2 },
  CB: { tackling: 4, marking: 4, heading: 3, strength: 3, jumping: 3, anticipation: 3, decisions: 3, composure: 2, pace: 2, passing: 1 },
  LB: { tackling: 3, marking: 2, crossing: 3, pace: 3, stamina: 3, anticipation: 2, decisions: 2, workRate: 2, dribbling: 1 },
  RB: { tackling: 3, marking: 2, crossing: 3, pace: 3, stamina: 3, anticipation: 2, decisions: 2, workRate: 2, dribbling: 1 },
  DM: { tackling: 4, marking: 3, decisions: 3, anticipation: 3, workRate: 3, passing: 2, composure: 2, stamina: 2 },
  CM: { passing: 4, vision: 3, decisions: 3, stamina: 2, dribbling: 1, tackling: 1, workRate: 2, firstTouch: 2 },
  AM: { vision: 4, dribbling: 3, longShots: 3, passing: 2, decisions: 2, composure: 2, firstTouch: 2 },
  LM: { crossing: 3, stamina: 3, pace: 2, passing: 2, dribbling: 2, workRate: 2 },
  RM: { crossing: 3, stamina: 3, pace: 2, passing: 2, dribbling: 2, workRate: 2 },
  LW: { pace: 4, dribbling: 4, crossing: 3, acceleration: 3, finishing: 2, agility: 2 },
  RW: { pace: 4, dribbling: 4, crossing: 3, acceleration: 3, finishing: 2, agility: 2 },
  ST: { finishing: 5, composure: 3, offTheBall: 3, heading: 2, pace: 2, dribbling: 1, strength: 2 },
};

function flatStats(s: PlayerStats): Record<string, number> {
  return {
    ...s.technical,
    ...s.mental,
    ...s.physical,
    ...(s.goalkeeping ?? {}),
  };
}

export function computeOverall(player: Pick<Player, 'position' | 'stats'>): number {
  const w = WEIGHTS[player.position];
  const flat = flatStats(player.stats);
  let sum = 0;
  let denom = 0;
  for (const [key, weight] of Object.entries(w)) {
    const v = flat[key];
    if (v == null) continue;
    sum += v * weight!;
    denom += weight!;
  }
  if (denom === 0) return 1;
  // Stats are in 1..20 → map to 1..100
  return Math.round((sum / denom) * 5);
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(gen): position distribution, boosts table, overall weights"
```

---

## Task 5 : Player generator + tests

**Files:**
- Create: `src/lib/gen/players.ts`, `src/lib/gen/players.test.ts`

- [ ] **Step 1: Write failing test `src/lib/gen/players.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { generatePlayers } from './players';

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
    expect(mean(high.map((p) => p.overall))).toBeGreaterThan(mean(low.map((p) => p.overall)));
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/gen/players.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/gen/players.ts`**

```ts
import type { Player, Position, Culture } from '@/lib/types';
import { clamp, gauss, triangular, chance, pick } from '@/lib/rng';
import { distributePositions, POSITION_BOOSTS } from './positions';
import { pickName } from './names';
import { computeOverall } from './overall';

export type GenerateOptions = {
  count: number;
  culture: Culture;
  globalStrength: number; // 1..100
};

const POSITION_FAMILIES: Record<Position, Position[]> = {
  GK: [],
  CB: ['LB', 'RB', 'DM'],
  LB: ['CB', 'LM'],
  RB: ['CB', 'RM'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM'],
  AM: ['CM', 'LW', 'RW'],
  LM: ['LW', 'LB'],
  RM: ['RW', 'RB'],
  LW: ['LM', 'AM', 'ST'],
  RW: ['RM', 'AM', 'ST'],
  ST: ['AM', 'LW', 'RW'],
};

function sampleStat(mean: number): number {
  return clamp(Math.round(gauss(mean, 3)), 1, 20);
}

function applyBoosts(
  stats: Record<string, number>,
  boosts: Partial<Record<string, number>>,
): void {
  for (const [path, delta] of Object.entries(boosts)) {
    if (delta == null) continue;
    const [g, k] = path.split('.');
    const target = stats as Record<string, Record<string, number>>;
    if (!target[g]) continue;
    target[g][k] = clamp(target[g][k] + delta, 1, 20);
  }
}

function rollFoot(): 'left' | 'right' | 'both' {
  const r = Math.random();
  if (r < 0.78) return 'right';
  if (r < 0.96) return 'left';
  return 'both';
}

function rollAltPositions(primary: Position): Position[] {
  if (!chance(0.3)) return [];
  const family = POSITION_FAMILIES[primary];
  if (family.length === 0) return [];
  const n = chance(0.3) ? 2 : 1;
  const out: Position[] = [];
  for (let i = 0; i < n; i++) {
    const cand = pick(family);
    if (!out.includes(cand)) out.push(cand);
  }
  return out;
}

export function generatePlayers(opts: GenerateOptions): Player[] {
  const positions = distributePositions(opts.count);
  const mean = 6 + opts.globalStrength / 10;

  return positions.map((pos) => {
    const { firstName, lastName } = pickName(opts.culture);

    const stats = {
      technical: {
        passing: sampleStat(mean), crossing: sampleStat(mean), dribbling: sampleStat(mean),
        finishing: sampleStat(mean), firstTouch: sampleStat(mean), heading: sampleStat(mean),
        longShots: sampleStat(mean), tackling: sampleStat(mean), marking: sampleStat(mean),
      },
      mental: {
        vision: sampleStat(mean), decisions: sampleStat(mean), composure: sampleStat(mean),
        anticipation: sampleStat(mean), offTheBall: sampleStat(mean),
        aggression: sampleStat(mean), workRate: sampleStat(mean),
      },
      physical: {
        pace: sampleStat(mean), acceleration: sampleStat(mean), strength: sampleStat(mean),
        stamina: sampleStat(mean), agility: sampleStat(mean), balance: sampleStat(mean),
        jumping: sampleStat(mean),
      },
      goalkeeping:
        pos === 'GK'
          ? {
              reflexes: sampleStat(mean), handling: sampleStat(mean), aerial: sampleStat(mean),
              oneOnOne: sampleStat(mean), kicking: sampleStat(mean), throwing: sampleStat(mean),
            }
          : null,
    };

    applyBoosts(stats as unknown as Record<string, number>, POSITION_BOOSTS[pos]);

    const player: Player = {
      id: crypto.randomUUID(),
      firstName,
      lastName,
      age: Math.round(triangular(16, 25, 38)),
      position: pos,
      altPositions: rollAltPositions(pos),
      preferredFoot: rollFoot(),
      stats,
      overall: 0,
    };
    player.overall = computeOverall(player);
    return player;
  });
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/gen/players.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(gen): player generator with FM-style stats"
```

---

## Task 6 : Web Worker entry

**Files:**
- Create: `src/lib/gen/worker.ts`

- [ ] **Step 1: Create `src/lib/gen/worker.ts`**

```ts
import { generatePlayers, type GenerateOptions } from './players';
import type { Player } from '@/lib/types';

type Request = { id: number; opts: GenerateOptions };
type Progress = { type: 'progress'; id: number; done: number; total: number };
type Done = { type: 'done'; id: number; players: Player[] };
type ErrorMsg = { type: 'error'; id: number; message: string };

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, opts } = ev.data;
  try {
    const total = opts.count;
    const chunkSize = Math.max(50, Math.floor(total / 20));
    const players: Player[] = [];
    let done = 0;
    while (done < total) {
      const next = Math.min(chunkSize, total - done);
      players.push(...generatePlayers({ ...opts, count: next }));
      done += next;
      const progress: Progress = { type: 'progress', id, done, total };
      (self as unknown as Worker).postMessage(progress);
    }
    const msg: Done = { type: 'done', id, players };
    (self as unknown as Worker).postMessage(msg);
  } catch (err) {
    const msg: ErrorMsg = { type: 'error', id, message: String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(gen): Web Worker entry with chunked progress"
```

---

## Task 7 : GitHub teams store + tests

**Files:**
- Create: `src/lib/github/store.ts`, `src/lib/github/store.test.ts`

- [ ] **Step 1: Write failing test `src/lib/github/store.test.ts`**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    discordClientId: 'x', discordRedirectUri: 'x',
    dataRepo: 'BJBellum/footsim-data', dataBranch: 'main',
    adminDiscordId: 'ADMIN',
  },
}));

const reads = new Map<string, { data: unknown; sha: string } | null>();
const writes: Array<{ path: string; data: unknown; sha?: string; message: string }> = [];
const lists = new Map<string, string[]>();

vi.mock('./api', () => ({
  readJson: vi.fn(async (path: string) => reads.get(path) ?? null),
  writeJson: vi.fn(async ({ path, data, sha, message }) => {
    writes.push({ path, data, sha, message });
    reads.set(path, { data, sha: 'newsha-' + writes.length });
    return { sha: 'newsha-' + writes.length };
  }),
  listDir: vi.fn(async (path: string) => lists.get(path) ?? []),
}));

import { saveTeamWithRoster, listTeams, loadTeam } from './store';
import type { Team, Player } from '@/lib/types';

beforeEach(() => {
  reads.clear();
  writes.length = 0;
  lists.clear();
});

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  id: 'tid', slug: 'fr', name: 'France', flag: 'data:image/png;base64,xx',
  culture: 'francais', globalStrength: 70, createdAt: '2026-04-29',
  createdBy: 'ADMIN', playerCount: 1, formation: '4-3-3',
  ...overrides,
});

const makePlayer = (id = 'p1'): Player => ({
  id, firstName: 'A', lastName: 'B', age: 24, position: 'CM',
  altPositions: [], preferredFoot: 'right',
  stats: {
    technical: { passing: 10, crossing: 10, dribbling: 10, finishing: 10, firstTouch: 10, heading: 10, longShots: 10, tackling: 10, marking: 10 },
    mental: { vision: 10, decisions: 10, composure: 10, anticipation: 10, offTheBall: 10, aggression: 10, workRate: 10 },
    physical: { pace: 10, acceleration: 10, strength: 10, stamina: 10, agility: 10, balance: 10, jumping: 10 },
    goalkeeping: null,
  },
  overall: 50,
});

describe('saveTeamWithRoster', () => {
  it('writes team.json and players.json under data/teams/{slug}', async () => {
    const team = makeTeam();
    const players = [makePlayer()];
    await saveTeamWithRoster(team, players, 'tok');
    expect(writes.map((w) => w.path)).toEqual([
      'data/teams/fr/team.json',
      'data/teams/fr/players.json',
    ]);
    expect(writes[0].data).toEqual(team);
    expect(writes[1].data).toEqual(players);
  });

  it('reuses sha when file exists for update', async () => {
    reads.set('data/teams/fr/team.json', { data: makeTeam(), sha: 'oldsha' });
    reads.set('data/teams/fr/players.json', { data: [], sha: 'oldroster' });
    await saveTeamWithRoster(makeTeam({ name: 'Updated' }), [makePlayer()], 'tok');
    expect(writes[0].sha).toBe('oldsha');
    expect(writes[1].sha).toBe('oldroster');
  });
});

describe('listTeams', () => {
  it('returns team metadata for each subdir', async () => {
    lists.set('data/teams', ['fr', 'de']);
    reads.set('data/teams/fr/team.json', { data: makeTeam({ slug: 'fr', name: 'France' }), sha: 'a' });
    reads.set('data/teams/de/team.json', { data: makeTeam({ slug: 'de', name: 'Allemagne' }), sha: 'b' });
    const teams = await listTeams('tok');
    expect(teams.map((t) => t.slug).sort()).toEqual(['de', 'fr']);
  });
});

describe('loadTeam', () => {
  it('returns null when team.json is missing', async () => {
    expect(await loadTeam('missing', 'tok')).toBeNull();
  });
  it('returns team + players when both exist', async () => {
    reads.set('data/teams/fr/team.json', { data: makeTeam(), sha: 'a' });
    reads.set('data/teams/fr/players.json', { data: [makePlayer()], sha: 'b' });
    const out = await loadTeam('fr', 'tok');
    expect(out?.team.slug).toBe('fr');
    expect(out?.players).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/github/store.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/github/store.ts`**

```ts
import type { Player, Team } from '@/lib/types';
import { readJson, writeJson, listDir } from './api';

const TEAM_PATH = (slug: string) => `data/teams/${slug}/team.json`;
const ROSTER_PATH = (slug: string) => `data/teams/${slug}/players.json`;

export async function saveTeamWithRoster(
  team: Team,
  players: Player[],
  token: string,
): Promise<void> {
  const existingTeam = await readJson<Team>(TEAM_PATH(team.slug), token);
  const existingRoster = await readJson<Player[]>(ROSTER_PATH(team.slug), token);
  await writeJson({
    path: TEAM_PATH(team.slug),
    token,
    data: team,
    message: existingTeam
      ? `chore(teams): update ${team.slug}`
      : `feat(teams): create ${team.slug}`,
    sha: existingTeam?.sha,
  });
  await writeJson({
    path: ROSTER_PATH(team.slug),
    token,
    data: players,
    message: `feat(teams/${team.slug}): write ${players.length} players`,
    sha: existingRoster?.sha,
  });
}

export async function loadTeam(
  slug: string,
  token: string,
): Promise<{ team: Team; players: Player[] } | null> {
  const team = await readJson<Team>(TEAM_PATH(slug), token);
  if (!team) return null;
  const roster = await readJson<Player[]>(ROSTER_PATH(slug), token);
  return { team: team.data, players: roster?.data ?? [] };
}

export async function listTeams(token: string): Promise<Team[]> {
  const slugs = await listDir('data/teams', token);
  const out: Team[] = [];
  for (const slug of slugs) {
    const t = await readJson<Team>(TEAM_PATH(slug), token);
    if (t) out.push(t.data);
  }
  return out;
}

export async function deleteTeamSoft(
  slug: string,
  token: string,
  reason: string,
): Promise<void> {
  // We don't actually remove the files (no DELETE in our minimal API),
  // but we mark the team as archived so the UI can hide it.
  const team = await readJson<Team & { archived?: true }>(TEAM_PATH(slug), token);
  if (!team) return;
  await writeJson({
    path: TEAM_PATH(slug),
    token,
    data: { ...team.data, archived: true },
    message: `chore(teams): archive ${slug} (${reason})`,
    sha: team.sha,
  });
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/github/store.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(github): high-level team CRUD store"
```

---

## Task 8 : Teams Zustand store

**Files:**
- Create: `src/stores/teams.ts`

- [ ] **Step 1: Create `src/stores/teams.ts`**

```ts
import { create } from 'zustand';
import type { Player, Team } from '@/lib/types';
import { listTeams, loadTeam, saveTeamWithRoster } from '@/lib/github/store';

type State = {
  teams: Team[];
  loading: boolean;
  error: string | null;
  refresh: (token: string) => Promise<void>;
  saveTeam: (team: Team, players: Player[], token: string) => Promise<void>;
  fetchTeam: (slug: string, token: string) => Promise<{ team: Team; players: Player[] } | null>;
};

export const useTeams = create<State>((set, get) => ({
  teams: [],
  loading: false,
  error: null,
  async refresh(token) {
    set({ loading: true, error: null });
    try {
      const teams = await listTeams(token);
      set({ teams, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },
  async saveTeam(team, players, token) {
    await saveTeamWithRoster(team, players, token);
    const next = [...get().teams.filter((t) => t.slug !== team.slug), team];
    set({ teams: next });
  },
  async fetchTeam(slug, token) {
    return loadTeam(slug, token);
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(stores): teams cache with refresh + saveTeam + fetchTeam"
```

---

## Task 9 : FlagUpload component

**Files:**
- Create: `src/components/team/FlagUpload.tsx`

- [ ] **Step 1: Create `src/components/team/FlagUpload.tsx`**

```tsx
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';

type Props = {
  value: string | null;
  onChange: (dataUrl: string) => void;
};

const SIZE = 150;

async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non supporté');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  return canvas.toDataURL('image/png');
}

export function FlagUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    try {
      const url = await fileToResizedDataUrl(file);
      onChange(url);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-[150px] w-[150px] items-center justify-center overflow-hidden rounded-md border border-border bg-bg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) pick(file);
        }}
      >
        {value ? (
          <img src={value} alt="Drapeau" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted">Glisse une image ici</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {value ? 'Remplacer' : 'Choisir une image'}
        </Button>
        {value ? (
          <Button variant="ghost" size="sm" onClick={() => onChange('')}>
            Effacer
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pick(file);
            e.target.value = '';
          }}
        />
        <p className="max-w-[200px] text-xs text-muted">
          Auto-redimensionné à 150×150 PNG.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(team): flag upload with auto-resize 150x150"
```

---

## Task 10 : TeamCard + Teams listing page

**Files:**
- Create: `src/components/team/TeamCard.tsx`, `src/pages/dashboard/Teams.tsx`
- Modify: `src/router.tsx`

- [ ] **Step 1: Create `src/components/team/TeamCard.tsx`**

```tsx
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Team } from '@/lib/types';
import { CULTURE_LABEL } from '@/lib/types';

export function TeamCard({ team }: { team: Team }) {
  return (
    <Link to={`/dashboard/teams/${team.slug}`}>
      <motion.div
        whileHover={{ y: -4 }}
        className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-subtle-sm transition-shadow hover:shadow-subtle-md"
      >
        <div className="flex items-center gap-4">
          {team.flag ? (
            <img src={team.flag} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-md bg-border" />
          )}
          <div className="min-w-0">
            <div className="truncate font-display text-xl">{team.name}</div>
            <div className="text-xs text-muted">{CULTURE_LABEL[team.culture]}</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Force</span>
          <span className="font-medium text-accent">{team.globalStrength}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Joueurs</span>
          <span className="font-medium">{team.playerCount}</span>
        </div>
      </motion.div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `src/pages/dashboard/Teams.tsx`**

```tsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { TeamCard } from '@/components/team/TeamCard';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';

export default function Teams() {
  const teams = useTeams((s) => s.teams);
  const loading = useTeams((s) => s.loading);
  const error = useTeams((s) => s.error);
  const refresh = useTeams((s) => s.refresh);
  const pat = useCredentials((s) => s.githubPat);

  useEffect(() => {
    if (pat) refresh(pat);
  }, [pat, refresh]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Équipes</h1>
        <Link to="/dashboard/teams/new">
          <Button>+ Nouvelle équipe</Button>
        </Link>
      </div>

      {!pat ? (
        <p className="text-muted">
          Configure ton token GitHub dans <Link to="/dashboard/settings" className="text-accent underline">Réglages</Link> pour charger les équipes.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-muted">
          <Spinner /> Chargement…
        </div>
      ) : error ? (
        <p className="text-danger">{error}</p>
      ) : teams.length === 0 ? (
        <p className="text-muted">Aucune équipe pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <TeamCard key={t.slug} team={t} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire route in `src/router.tsx`**

Add import and route. Open `src/router.tsx` and update:

```tsx
import Teams from '@/pages/dashboard/Teams';
```

Inside the dashboard children array, after the index route, add:

```tsx
{ path: 'teams', element: <Teams /> },
```

(See full file in Task 13 for the complete updated router.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(team): TeamCard component and teams listing page"
```

---

## Task 11 : TeamNew page (creation flow with worker)

**Files:**
- Create: `src/pages/dashboard/TeamNew.tsx`

- [ ] **Step 1: Create `src/pages/dashboard/TeamNew.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { FlagUpload } from '@/components/team/FlagUpload';
import { CULTURES, CULTURE_LABEL, type Culture, type Player, type Team } from '@/lib/types';
import { slugify } from '@/lib/slug';
import { useCredentials } from '@/stores/credentials';
import { useSession } from '@/stores/session';
import { useTeams } from '@/stores/teams';

const COUNTS = [100, 200, 500, 1000, 2000, 3000, 4000, 5000];

export default function TeamNew() {
  const pat = useCredentials((s) => s.githubPat);
  const session = useSession((s) => s.session);
  const saveTeam = useTeams((s) => s.saveTeam);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [flag, setFlag] = useState<string | null>(null);
  const [culture, setCulture] = useState<Culture>('francais');
  const [strength, setStrength] = useState(60);
  const [count, setCount] = useState(500);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!pat) {
      toast('error', 'Token GitHub manquant.');
      return;
    }
    if (!name.trim() || !flag) {
      toast('error', 'Nom et drapeau requis.');
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: count });

    const players = await runWorker({ count, culture, globalStrength: strength }, (p) =>
      setProgress({ done: p.done, total: p.total }),
    );

    const slug = slugify(name);
    const team: Team = {
      id: crypto.randomUUID(),
      slug,
      name: name.trim(),
      flag,
      culture,
      globalStrength: strength,
      createdAt: new Date().toISOString(),
      createdBy: session?.id ?? 'unknown',
      playerCount: players.length,
      formation: '4-3-3',
    };

    try {
      await saveTeam(team, players, pat);
      toast('success', `${team.name} créée avec ${players.length} joueurs.`);
      navigate(`/dashboard/teams/${slug}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="font-display text-4xl">Nouvelle équipe</h1>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-6">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nom du pays</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="République du Sud" />
        </label>

        <div className="block text-sm">
          <span className="mb-1 block text-muted">Drapeau</span>
          <FlagUpload value={flag} onChange={(v) => setFlag(v || null)} />
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Culture des noms</span>
          <select
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={culture}
            onChange={(e) => setCulture(e.target.value as Culture)}
          >
            {CULTURES.map((c) => (
              <option key={c} value={c}>{CULTURE_LABEL[c]}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">
            Force globale : <span className="text-text">{strength}</span>
          </span>
          <input
            type="range"
            min={1}
            max={100}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full accent-[--accent]"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nombre de joueurs</span>
          <select
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {COUNTS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={generate} disabled={busy} size="lg">
          {busy ? <Spinner className="mr-2" /> : null}
          {busy ? 'Génération…' : 'Générer l’équipe'}
        </Button>
        {progress ? (
          <span className="text-sm text-muted">
            {progress.done} / {progress.total}
          </span>
        ) : null}
      </div>

      {progress ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function runWorker(
  opts: { count: number; culture: Culture; globalStrength: number },
  onProgress: (p: { done: number; total: number }) => void,
): Promise<Player[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('@/lib/gen/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data as
        | { type: 'progress'; done: number; total: number }
        | { type: 'done'; players: Player[] }
        | { type: 'error'; message: string };
      if (data.type === 'progress') onProgress({ done: data.done, total: data.total });
      else if (data.type === 'done') {
        worker.terminate();
        resolve(data.players);
      } else if (data.type === 'error') {
        worker.terminate();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ id: 1, opts });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(team): create-team page with worker progress and persistence"
```

---

## Task 12 : RosterTable + TeamDetail page

**Files:**
- Create: `src/components/team/RosterTable.tsx`, `src/pages/dashboard/TeamDetail.tsx`

- [ ] **Step 1: Create `src/components/team/RosterTable.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { Player, Position } from '@/lib/types';
import { POSITIONS } from '@/lib/types';

type SortKey = 'overall' | 'age' | 'lastName' | 'position';

export function RosterTable({ players }: { players: Player[] }) {
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('overall');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const base = filter === 'ALL' ? players : players.filter((p) => p.position === filter);
    return [...base].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [players, filter, sort, dir]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Position | 'ALL')}
        >
          <option value="ALL">Tous postes</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className="text-sm text-muted">{rows.length} joueurs</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-muted">
            <tr>
              {(['lastName', 'position', 'age', 'overall'] as SortKey[]).map((k) => (
                <th
                  key={k}
                  className="cursor-pointer px-4 py-2 font-medium"
                  onClick={() => {
                    if (sort === k) setDir(dir === 'asc' ? 'desc' : 'asc');
                    else { setSort(k); setDir(k === 'overall' ? 'desc' : 'asc'); }
                  }}
                >
                  {k === 'lastName' ? 'Nom' : k === 'position' ? 'Poste' : k === 'age' ? 'Âge' : 'Overall'}
                  {sort === k ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th className="px-4 py-2 font-medium">Pied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2">{p.firstName} {p.lastName}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-border/40 px-2 py-0.5 text-xs">{p.position}</span>
                  {p.altPositions.length ? (
                    <span className="ml-2 text-xs text-muted">{p.altPositions.join(', ')}</span>
                  ) : null}
                </td>
                <td className="px-4 py-2">{p.age}</td>
                <td className="px-4 py-2 font-medium">{p.overall}</td>
                <td className="px-4 py-2 text-muted">
                  {p.preferredFoot === 'right' ? 'D' : p.preferredFoot === 'left' ? 'G' : 'D/G'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/dashboard/TeamDetail.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { RosterTable } from '@/components/team/RosterTable';
import type { Player, Team } from '@/lib/types';
import { CULTURE_LABEL } from '@/lib/types';
import { useCredentials } from '@/stores/credentials';
import { useTeams } from '@/stores/teams';

const ADD_COUNTS = [100, 200, 500, 1000];

export default function TeamDetail() {
  const { slug = '' } = useParams();
  const pat = useCredentials((s) => s.githubPat);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const saveTeam = useTeams((s) => s.saveTeam);
  const navigate = useNavigate();

  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!pat) return;
    setLoading(true);
    fetchTeam(slug, pat)
      .then((res) => {
        if (!res) toast('error', 'Équipe introuvable.');
        setData(res);
      })
      .catch((err) => toast('error', String(err)))
      .finally(() => setLoading(false));
  }, [slug, pat, fetchTeam]);

  async function addPlayers(extra: number) {
    if (!data || !pat) return;
    setAdding(true);
    try {
      const { generatePlayers } = await import('@/lib/gen/players');
      const newPlayers = generatePlayers({
        count: extra,
        culture: data.team.culture,
        globalStrength: data.team.globalStrength,
      });
      const merged = [...data.players, ...newPlayers];
      const team = { ...data.team, playerCount: merged.length };
      await saveTeam(team, merged, pat);
      setData({ team, players: merged });
      toast('success', `+${extra} joueurs.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Spinner /> Chargement…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <p className="text-danger">Équipe introuvable.</p>
        <Button variant="ghost" onClick={() => navigate('/dashboard/teams')}>Retour</Button>
      </div>
    );
  }

  const { team, players } = data;
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-6">
        <img
          src={team.flag}
          alt=""
          className="h-24 w-24 rounded-lg border border-border object-cover"
        />
        <div className="space-y-1">
          <h1 className="font-display text-4xl">{team.name}</h1>
          <p className="text-sm text-muted">
            {CULTURE_LABEL[team.culture]} · Force {team.globalStrength} · {team.playerCount} joueurs · Formation {team.formation}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Roster</h2>
          <div className="flex items-center gap-2">
            {ADD_COUNTS.map((n) => (
              <Button
                key={n}
                variant="ghost"
                size="sm"
                onClick={() => addPlayers(n)}
                disabled={adding}
              >
                + {n}
              </Button>
            ))}
            {adding ? <Spinner /> : null}
          </div>
        </div>
        <RosterTable players={players} />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(team): roster table + team detail page with add-players"
```

---

## Task 13 : Wire all team routes

**Files:**
- Modify: `src/router.tsx`

- [ ] **Step 1: Replace `src/router.tsx`**

```tsx
import { createBrowserRouter } from 'react-router-dom';
import Home from '@/pages/Home';
import Callback from '@/pages/auth/Callback';
import NoAccess from '@/pages/NoAccess';
import Dashboard from '@/pages/dashboard/Dashboard';
import Settings from '@/pages/dashboard/Settings';
import Teams from '@/pages/dashboard/Teams';
import TeamNew from '@/pages/dashboard/TeamNew';
import TeamDetail from '@/pages/dashboard/TeamDetail';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RequireAdmin } from '@/components/auth/RequireAdmin';

export const router = createBrowserRouter(
  [
    { path: '/', element: <Home /> },
    { path: '/auth/callback', element: <Callback /> },
    { path: '/no-access', element: <NoAccess /> },
    {
      path: '/dashboard',
      element: (
        <RequireAdmin>
          <DashboardLayout />
        </RequireAdmin>
      ),
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'teams', element: <Teams /> },
        { path: 'teams/new', element: <TeamNew /> },
        { path: 'teams/:slug', element: <TeamDetail /> },
        { path: 'settings', element: <Settings /> },
      ],
    },
  ],
  { basename: '/footsim' },
);
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(routing): wire teams listing, creation, and detail routes"
```

---

## Task 14 : Dashboard overview cards

**Files:**
- Modify: `src/pages/dashboard/Dashboard.tsx`

- [ ] **Step 1: Replace `src/pages/dashboard/Dashboard.tsx`**

```tsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';

export default function Dashboard() {
  const teams = useTeams((s) => s.teams);
  const loading = useTeams((s) => s.loading);
  const refresh = useTeams((s) => s.refresh);
  const pat = useCredentials((s) => s.githubPat);

  useEffect(() => {
    if (pat) refresh(pat);
  }, [pat, refresh]);

  const totalPlayers = teams.reduce((sum, t) => sum + t.playerCount, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 font-display text-4xl">Vue d’ensemble</h1>
        <p className="text-muted">Bienvenue dans FootSim.</p>
      </div>

      {!pat ? (
        <p className="text-muted">
          Configure ton token GitHub dans{' '}
          <Link to="/dashboard/settings" className="text-accent underline">Réglages</Link>.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card label="Équipes" value={loading ? <Spinner /> : teams.length} />
          <Card label="Joueurs" value={loading ? <Spinner /> : totalPlayers.toLocaleString('fr-FR')} />
          <Card
            label="Action rapide"
            value={
              <Link to="/dashboard/teams/new">
                <Button size="sm">Créer une équipe</Button>
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="mb-2 text-sm text-muted">{label}</div>
      <div className="font-display text-3xl">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(dashboard): overview cards with team and player counts"
```

---

## Task 15 : Final verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: 0 errors. Note: bundle size will grow with name JSON files (~few hundred KB additional).

- [ ] **Step 3: Smoke (manual)**

Run `npm run dev`, log in via Discord (admin account), set GitHub PAT in Settings, create a team with 100 players, verify team appears in `BJBellum/footsim-data/data/teams/{slug}/`. Stop server.

- [ ] **Step 4: Final commit if any**

```bash
git status
```

Clean tree expected.

---

## Self-Review Notes

- Spec sections 5 (Data Model — Team, Player, Position, Formation), 6 (Player Generation — pipeline, position counts, age curve, base stats, position boosts, GK gating, alt positions, overall, web worker, "add more later"), 7 (GitHub Persistence — read/write/list with sha) are all implemented.
- Spec sections 9.1 (Routes — Home/auth/no-access/dashboard/teams/new/:slug/settings) covered.
- Match-related routes (`/match`, `/match/:id`) intentionally deferred to Plan 3.
- No placeholders. All file paths absolute, all code complete. Commit messages templated per spec.
- Cross-task type consistency: `Player`, `Team`, `Position`, `Culture`, `Formation` all defined once in `lib/types.ts` and re-imported. `generatePlayers` signature stable across tasks 5, 6, 11, 12.
