import type { Formation, Player, Position } from '@/lib/types';

const SLOTS: Record<Formation, Position[]> = {
  '4-3-3':   ['GK','LB','CB','CB','RB','CM','CM','CM','LW','ST','RW'],
  '4-4-2':   ['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'],
  '3-5-2':   ['GK','CB','CB','CB','LM','DM','CM','CM','RM','ST','ST'],
  '4-2-3-1': ['GK','LB','CB','CB','RB','DM','DM','LW','AM','RW','ST'],
  '5-3-2':   ['GK','LB','CB','CB','CB','RB','CM','DM','CM','ST','ST'],
  '4-1-4-1': ['GK','LB','CB','CB','RB','DM','LM','CM','CM','RM','ST'],
  '3-4-3':   ['GK','CB','CB','CB','LM','CM','CM','RM','LW','ST','RW'],
  '4-3-2-1': ['GK','LB','CB','CB','RB','CM','CM','CM','AM','AM','ST'],
  '4-5-1':   ['GK','LB','CB','CB','RB','LM','CM','DM','CM','RM','ST'],
  '4-4-1-1': ['GK','LB','CB','CB','RB','LM','CM','CM','RM','AM','ST'],
  '3-4-1-2': ['GK','CB','CB','CB','LM','CM','CM','RM','AM','ST','ST'],
  '5-4-1':   ['GK','LB','CB','CB','CB','RB','LM','CM','CM','RM','ST'],
  '3-6-1':   ['GK','CB','CB','CB','LM','DM','CM','CM','DM','RM','ST'],
};

export function pickXI(roster: Player[], formation: Formation): { lineup: Player[]; bench: Player[] } {
  const slots = SLOTS[formation];
  const remaining = [...roster];
  const lineup: Player[] = [];

  for (const slot of slots) {
    const idx = bestForSlot(remaining, slot);
    if (idx >= 0) {
      lineup.push(remaining.splice(idx, 1)[0]);
    }
  }

  while (lineup.length < 11 && remaining.length) {
    remaining.sort((a, b) => b.overall - a.overall);
    lineup.push(remaining.shift()!);
  }

  return { lineup, bench: remaining };
}

function bestForSlot(pool: Player[], slot: Position): number {
  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    let score = p.overall;
    if (p.position === slot) score += 25;
    else if (p.altPositions.includes(slot)) score += 10;
    else if (sameFamily(p.position, slot)) score += 3;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function sameFamily(a: Position, b: Position): boolean {
  const fams: Position[][] = [
    ['GK'],
    ['CB'],
    ['LB','RB'],
    ['DM','CM'],
    ['AM','CM'],
    ['LM','RM','LW','RW'],
    ['ST'],
  ];
  for (const f of fams) if (f.includes(a) && f.includes(b)) return true;
  return false;
}
