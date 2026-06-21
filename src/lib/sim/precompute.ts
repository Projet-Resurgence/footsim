import type { Formation, Player, TacticStyle, CustomTacticStyle } from '@/lib/types';
import type { Coach } from '@/lib/gen/coach';
import { computeCoachBonuses } from '@/lib/gen/coach';
import type { SideRatings, TacticMods } from './types';
import { pickXI } from './lineup';
import { moraleMult } from '@/lib/competition/morale';

function getTacticMods(style?: TacticStyle): TacticMods {
  switch (style) {
    case 'possession':      return { shotFreqMult: 0.88, foulRateMult: 1.00, midfieldMult: 1.12, attackMult: 1.00, defenseMult: 1.00 };
    case 'contre-attaque':  return { shotFreqMult: 1.08, foulRateMult: 1.00, midfieldMult: 0.92, attackMult: 1.10, defenseMult: 1.00 };
    case 'direct':          return { shotFreqMult: 1.18, foulRateMult: 1.00, midfieldMult: 1.00, attackMult: 1.00, defenseMult: 1.00 };
    case 'pressing':        return { shotFreqMult: 1.00, foulRateMult: 1.12, midfieldMult: 1.15, attackMult: 1.00, defenseMult: 1.00 };
    case 'ultra-defensif':  return { shotFreqMult: 0.65, foulRateMult: 1.05, midfieldMult: 0.85, attackMult: 0.75, defenseMult: 1.20 };
    case 'gegenpressing':   return { shotFreqMult: 1.10, foulRateMult: 1.20, midfieldMult: 1.18, attackMult: 1.05, defenseMult: 1.00 };
    case 'tiki-taka':       return { shotFreqMult: 0.82, foulRateMult: 0.90, midfieldMult: 1.20, attackMult: 0.95, defenseMult: 1.05 };
    case 'long-ball':       return { shotFreqMult: 1.15, foulRateMult: 1.05, midfieldMult: 0.80, attackMult: 1.15, defenseMult: 0.95 };
    case 'chaos':           return { shotFreqMult: 1.30, foulRateMult: 1.35, midfieldMult: 0.95, attackMult: 1.10, defenseMult: 0.90 };
    default:                return { shotFreqMult: 1.00, foulRateMult: 1.00, midfieldMult: 1.00, attackMult: 1.00, defenseMult: 1.00 };
  }
}

export function precomputeSide(
  roster: Player[],
  formation: Formation,
  customLineup?: string[],
  tacticStyle?: TacticStyle,
  coach?: Coach,
  matchSeed?: number,
  coachSuspended?: boolean,
  customTacticStyle?: CustomTacticStyle,
  morale?: number,
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

  const tacticMods = customTacticStyle ? customTacticStyle.mods : getTacticMods(tacticStyle);
  const coachB = (coach && !coachSuspended) ? computeCoachBonuses(coach, matchSeed) : null;
  const mm = moraleMult(morale ?? 50);

  const attack = (0.7 * meanAtt + 0.3 * meanAm) * tacticMods.attackMult * (coachB?.attackMult ?? 1) * mm;
  const midfield = (mid.length ? avg(mid.map((p) => p.overall)) : 50) * tacticMods.midfieldMult * (coachB?.midfieldMult ?? 1) * mm;
  const defense = ((def.length ? avg(def.map((p) => p.overall)) : 50) * 0.8 + (gk?.overall ?? 50) * 0.2) * tacticMods.defenseMult * (coachB?.defenseMult ?? 1) * mm;
  const gkRating = gk?.overall ?? 50;

  const mergedTacticMods: TacticMods = coachB ? {
    shotFreqMult: tacticMods.shotFreqMult * coachB.shotFreqMult,
    foulRateMult: tacticMods.foulRateMult * coachB.foulRateMult,
    midfieldMult: tacticMods.midfieldMult,
    attackMult: tacticMods.attackMult,
    defenseMult: tacticMods.defenseMult,
  } : tacticMods;

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
    tacticMods: mergedTacticMods,
  };
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
