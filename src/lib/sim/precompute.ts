import type { Formation, Player, TacticStyle } from '@/lib/types';
import type { SideRatings, TacticMods } from './types';
import { pickXI } from './lineup';

function getTacticMods(style?: TacticStyle): TacticMods {
  switch (style) {
    case 'possession':      return { shotFreqMult: 0.88, foulRateMult: 1.00, midfieldMult: 1.12, attackMult: 1.00 };
    case 'contre-attaque':  return { shotFreqMult: 1.08, foulRateMult: 1.00, midfieldMult: 0.92, attackMult: 1.10 };
    case 'direct':          return { shotFreqMult: 1.18, foulRateMult: 1.00, midfieldMult: 1.00, attackMult: 1.00 };
    case 'pressing':        return { shotFreqMult: 1.00, foulRateMult: 1.12, midfieldMult: 1.15, attackMult: 1.00 };
    default:                return { shotFreqMult: 1.00, foulRateMult: 1.00, midfieldMult: 1.00, attackMult: 1.00 };
  }
}

export function precomputeSide(
  roster: Player[],
  formation: Formation,
  customLineup?: string[],
  tacticStyle?: TacticStyle,
): SideRatings {
  let lineup: Player[];
  let bench: Player[];

  if (customLineup && customLineup.length === 11) {
    const playerMap = new Map(roster.map((p) => [p.id, p]));
    const starters = customLineup.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
    if (starters.length === 11) {
      lineup = starters;
      bench = roster
        .filter((p) => !customLineup.includes(p.id))
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 12);
    } else {
      ({ lineup, bench } = pickXI(roster, formation));
      bench = bench.sort((a, b) => b.overall - a.overall).slice(0, 12);
    }
  } else {
    ({ lineup, bench } = pickXI(roster, formation));
    bench = bench.sort((a, b) => b.overall - a.overall).slice(0, 12);
  }

  const gk = lineup.find((p) => p.position === 'GK');
  const def = lineup.filter((p) => ['CB', 'LB', 'RB'].includes(p.position));
  const mid = lineup.filter((p) => ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.position));
  const att = lineup.filter((p) => ['LW', 'RW', 'ST'].includes(p.position));

  const top3Att = [...att].sort((a, b) => b.overall - a.overall).slice(0, 3);
  const am = mid.filter((p) => p.position === 'AM');

  const meanAtt = top3Att.length ? avg(top3Att.map((p) => p.overall)) : 50;
  const meanAm = am.length ? avg(am.map((p) => p.overall)) : meanAtt;

  const tacticMods = getTacticMods(tacticStyle);

  const attack = (0.7 * meanAtt + 0.3 * meanAm) * tacticMods.attackMult;
  const midfield = (mid.length ? avg(mid.map((p) => p.overall)) : 50) * tacticMods.midfieldMult;
  const defense = (def.length ? avg(def.map((p) => p.overall)) : 50) * 0.8 + (gk?.overall ?? 50) * 0.2;
  const gkRating = gk?.overall ?? 50;

  return {
    attack,
    midfield,
    defense,
    gk: gkRating,
    formation,
    lineup: lineup.map((p) => p.id),
    bench: bench.map((p) => p.id),
    yellow: new Set(),
    red: new Set(),
    tacticMods,
  };
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
