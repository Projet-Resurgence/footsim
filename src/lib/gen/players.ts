import type { Player, Position, Culture } from '@/lib/types';
import { clamp, gauss, triangular, chance, pick } from '@/lib/rng';
import { distributePositions, POSITION_BOOSTS } from './positions';
import { pickName, pickNameMixed, type CultureWeight } from './names';
import { computeOverall } from './overall';

export type GenerateOptions = {
  count: number;
  culture: Culture;
  cultures?: CultureWeight[];
  globalStrength: number;
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
  stats: Record<string, Record<string, number>>,
  boosts: Partial<Record<string, number>>,
): void {
  for (const [path, delta] of Object.entries(boosts)) {
    if (delta == null) continue;
    const [g, k] = path.split('.');
    if (!stats[g]) continue;
    stats[g][k] = clamp(stats[g][k] + delta, 1, 20);
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
    const { firstName, lastName } = opts.cultures?.length
      ? pickNameMixed(opts.cultures)
      : pickName(opts.culture);

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

    applyBoosts(stats as unknown as Record<string, Record<string, number>>, POSITION_BOOSTS[pos]);

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
