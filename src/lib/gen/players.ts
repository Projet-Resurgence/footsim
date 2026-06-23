import type { Player, Position, Culture } from '@/lib/types';
import { clamp, gauss, triangular, chance, pick } from '@/lib/rng';
import { distributePositions, POSITION_BOOSTS } from './positions';
import { pickName, pickNameMixed, type CultureWeight } from './names';
import { computeOverall } from './overall';

// Position stat weights (mirrors overall.ts WEIGHTS) — used for weighted delta distribution
const POSITION_STAT_WEIGHTS: Record<Position, Record<string, number>> = {
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

export type GenerateOptions = {
  count: number;
  culture: Culture;
  cultures?: CultureWeight[];
  globalStrength: number;
};

export type RerateOptions = Omit<GenerateOptions, 'count'>;

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

function generatePlayerForPosition(pos: Position, opts: RerateOptions): Player {
  const mean = 6 + opts.globalStrength / 10;

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
}

export function generatePlayers(opts: GenerateOptions): Player[] {
  const positions = distributePositions(opts.count);
  return positions.map((pos) => generatePlayerForPosition(pos, opts));
}

export function reratePlayers(players: Player[], opts: RerateOptions & { previousStrength?: number }): Player[] {
  const targetMean = 6 + opts.globalStrength / 10;
  const baseMean = 6 + (opts.previousStrength ?? opts.globalStrength) / 10;
  const delta = targetMean - baseMean;
  if (Math.abs(delta) < 0.001) return players;

  return players.map((player) => {
    const posWeights = POSITION_STAT_WEIGHTS[player.position] ?? {};

    const flat: Record<string, number> = {
      ...player.stats.technical,
      ...player.stats.mental,
      ...player.stats.physical,
      ...(player.stats.goalkeeping ?? {}),
    };
    const statKeys = Object.keys(flat);
    const n = statKeys.length;

    // Total integer points to distribute (can be negative)
    const totalPoints = Math.round(delta * n);

    if (totalPoints === 0) {
      // Delta too small to produce any integer change — no-op for this player
      return player;
    }

    // Build priority order: sort stats by position weight desc, then by current value asc (boost weakest first among equals)
    const sorted = [...statKeys].sort((a, b) => {
      const wDiff = (posWeights[b] ?? 0) - (posWeights[a] ?? 0);
      if (wDiff !== 0) return wDiff;
      return flat[a] - flat[b];
    });

    // Distribute |totalPoints| points one-by-one along priority order, cycling if needed
    const newFlat = { ...flat };
    const sign = totalPoints > 0 ? 1 : -1;
    let remaining = Math.abs(totalPoints);
    let idx = 0;
    while (remaining > 0) {
      const k = sorted[idx % sorted.length];
      const cur = newFlat[k];
      const next = clamp(cur + sign, 1, 20);
      if (next !== cur) {
        newFlat[k] = next;
        remaining--;
      }
      idx++;
      // Safety: if all stats are clamped, break
      if (idx > sorted.length * 20) break;
    }

    const stats = {
      technical: Object.fromEntries(
        Object.keys(player.stats.technical).map((k) => [k, newFlat[k]])
      ) as typeof player.stats.technical,
      mental: Object.fromEntries(
        Object.keys(player.stats.mental).map((k) => [k, newFlat[k]])
      ) as typeof player.stats.mental,
      physical: Object.fromEntries(
        Object.keys(player.stats.physical).map((k) => [k, newFlat[k]])
      ) as typeof player.stats.physical,
      goalkeeping: player.stats.goalkeeping
        ? Object.fromEntries(
            Object.keys(player.stats.goalkeeping).map((k) => [k, newFlat[k]])
          ) as typeof player.stats.goalkeeping
        : null,
    };

    return {
      ...player,
      stats,
      overall: computeOverall({ position: player.position, stats }),
    };
  });
}
