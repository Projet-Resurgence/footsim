import type { Formation, Player, PlannedSub, Position, TacticStyle, CustomTacticStyle } from '@/lib/types';
import type { Coach } from '@/lib/gen/coach';
import { computeCoachBonuses } from '@/lib/gen/coach';
import type { SideRatings, TacticMods } from './types';
import { pickXI } from './lineup';
import { moraleMult } from '@/lib/competition/morale';

export function getTacticMods(style?: TacticStyle): TacticMods {
  switch (style) {
    case 'possession':      return { shotFreqMult: 0.88, foulRateMult: 1.00, midfieldMult: 1.12, attackMult: 1.00, defenseMult: 1.00 };
    case 'contre-attaque':  return { shotFreqMult: 1.08, foulRateMult: 1.00, midfieldMult: 0.92, attackMult: 1.10, defenseMult: 1.00 };
    case 'direct':          return { shotFreqMult: 1.18, foulRateMult: 1.00, midfieldMult: 1.00, attackMult: 1.00, defenseMult: 1.00 };
    case 'pressing':        return { shotFreqMult: 1.00, foulRateMult: 1.12, midfieldMult: 1.15, attackMult: 1.00, defenseMult: 1.00 };
    case 'ultra-defensif':  return { shotFreqMult: 0.65, foulRateMult: 1.05, midfieldMult: 0.85, attackMult: 0.80, defenseMult: 1.20 };
    case 'gegenpressing':   return { shotFreqMult: 1.10, foulRateMult: 1.20, midfieldMult: 1.18, attackMult: 1.05, defenseMult: 1.00 };
    case 'tiki-taka':       return { shotFreqMult: 0.82, foulRateMult: 0.90, midfieldMult: 1.20, attackMult: 0.95, defenseMult: 1.05 };
    case 'long-ball':       return { shotFreqMult: 1.15, foulRateMult: 1.05, midfieldMult: 0.80, attackMult: 1.15, defenseMult: 0.95 };
    case 'chaos':           return { shotFreqMult: 1.30, foulRateMult: 1.35, midfieldMult: 0.95, attackMult: 1.10, defenseMult: 0.90 };
    // Jeu sur les ailes — centres et débordements : plus de tirs (têtes) et d'attaque, milieu axial délaissé
    case 'ailes':           return { shotFreqMult: 1.10, foulRateMult: 0.95, midfieldMult: 0.90, attackMult: 1.12, defenseMult: 1.00 };
    // Bloc médian (à la Simeone) — compact entre les lignes, pièges au milieu, transitions sobres
    case 'bloc-median':     return { shotFreqMult: 0.90, foulRateMult: 1.12, midfieldMult: 1.05, attackMult: 0.92, defenseMult: 1.12 };
    // Football total — permutations permanentes : fort partout devant, arrière exposé
    case 'football-total':  return { shotFreqMult: 1.05, foulRateMult: 0.95, midfieldMult: 1.10, attackMult: 1.08, defenseMult: 0.92 };
    default:                return { shotFreqMult: 1.00, foulRateMult: 1.00, midfieldMult: 1.00, attackMult: 1.00, defenseMult: 1.00 };
  }
}

const MOD_CAP = 1.5;

/**
 * Résout les plans B ciblant une tactique sauvegardée : attache les mods du style
 * de la tactique (perso inclus) + son nom pour l'événement 📋. Les règles legacy
 * (style direct) passent telles quelles ; tactique introuvable → fallback style.
 */
export function enrichPlanBRules(
  planB: import('@/lib/types').PlanBRule[] | undefined,
  team?: { savedTactics?: import('@/lib/types').SavedTactic[]; customStyles?: CustomTacticStyle[] },
): import('./types').ResolvedPlanBRule[] {
  return (planB ?? []).map((r) => {
    if (!r.tacticId) return r;
    const t = team?.savedTactics?.find((st) => st.id === r.tacticId);
    if (!t) return r;
    const cs = t.activeCustomStyleId
      ? [...(t.customStyles ?? []), ...(team?.customStyles ?? [])].find((s) => s.id === t.activeCustomStyleId)
      : undefined;
    return { ...r, modsOverride: cs ? clampTacticMods(cs.mods) : getTacticMods(t.style), label: t.name };
  });
}

function clampTacticMods(mods: import('./types').TacticMods): import('./types').TacticMods {
  const clamp = (v: number) => Math.max(0.1, Math.min(MOD_CAP, Number(v) || 1));
  return {
    shotFreqMult:  clamp(mods.shotFreqMult),
    foulRateMult:  clamp(mods.foulRateMult),
    midfieldMult:  clamp(mods.midfieldMult),
    attackMult:    clamp(mods.attackMult),
    defenseMult:   clamp(mods.defenseMult),
  };
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
  unavailablePlayerIds?: Set<string>,
  customBench?: string[],
  plannedSubs?: PlannedSub[],
  positionMap?: Record<string, Position>,
  directives?: {
    planB?: import('./types').ResolvedPlanBRule[];
    setPieceTakers?: import('@/lib/types').SetPieceTakers;
    captainId?: string;
  },
): SideRatings {
  let lineup: Player[];
  let bench: Player[];

  // Filter out injured/suspended players from available roster
  const available = unavailablePlayerIds?.size
    ? roster.filter((p) => !unavailablePlayerIds.has(p.id))
    : roster;

  const playerMap = new Map(available.map((p) => [p.id, p]));

  // Hard-cap: only accept exactly 11 unique IDs — reject any tampered lineup
  const safeLineup = customLineup
    ? [...new Set(customLineup)].slice(0, 11)
    : undefined;

  if (safeLineup && safeLineup.length === 11) {
    const starters = safeLineup.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
    if (starters.length === 11) {
      lineup = starters;
      const lineupSet = new Set(safeLineup);
      if (customBench?.length) {
        // Use custom bench order; fill remaining slots from auto-sort
        const customBenchPlayers = customBench.map((id) => playerMap.get(id)).filter((p): p is Player => !!p && !lineupSet.has(p.id));
        const customBenchSet = new Set(customBenchPlayers.map((p) => p.id));
        const autoBenchRemainder = available
          .filter((p) => !lineupSet.has(p.id) && !customBenchSet.has(p.id))
          .sort((a, b) => b.overall - a.overall);
        bench = [...customBenchPlayers, ...autoBenchRemainder].slice(0, 12);
      } else {
        bench = available
          .filter((p) => !lineupSet.has(p.id))
          .sort((a, b) => b.overall - a.overall)
          .slice(0, 12);
      }
    } else {
      ({ lineup, bench } = pickXI(available, formation));
      bench = bench.sort((a, b) => b.overall - a.overall).slice(0, 12);
    }
  } else {
    ({ lineup, bench } = pickXI(available, formation));
    bench = bench.sort((a, b) => b.overall - a.overall).slice(0, 12);
  }

  // Apply free-editor position overrides — create virtual players with overridden position
  const effectiveLineup = positionMap
    ? lineup.map((p) => positionMap[p.id] ? { ...p, position: positionMap[p.id] as Player['position'] } : p)
    : lineup;

  const gk = effectiveLineup.find((p) => p.position === 'GK');
  const def = effectiveLineup.filter((p) => ['CB', 'LB', 'RB'].includes(p.position));
  const mid = effectiveLineup.filter((p) => ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.position));
  const att = effectiveLineup.filter((p) => ['LW', 'RW', 'ST'].includes(p.position));

  const top3Att = [...att].sort((a, b) => b.overall - a.overall).slice(0, 3);
  const am = mid.filter((p) => p.position === 'AM');

  // No attackers = near-zero raw attack (not 50 fallback)
  const meanAtt = top3Att.length ? avg(top3Att.map((p) => p.overall)) : 10;
  const meanAm = am.length ? avg(am.map((p) => p.overall)) : meanAtt;

  const rawMods = customTacticStyle ? customTacticStyle.mods : getTacticMods(tacticStyle);
  const tacticMods = clampTacticMods(rawMods);
  const coachB = (coach && !coachSuspended) ? computeCoachBonuses(coach, matchSeed) : null;
  const mm = moraleMult(morale ?? 50);

  // Formation imbalance multipliers — 10 outfield players, expected balance ~3-4 def / 3-4 mid / 2-3 att
  const nDef = def.length;
  const nMid = mid.length;
  const nAtt = att.length;

  // Attack mult: no att = almost no output; excess att (5+) = chaotic, slight penalty
  const attMult = nAtt === 0 ? 0.10
    : nAtt === 1 ? 0.65
    : nAtt === 2 ? 0.90
    : nAtt <= 4  ? 1.00
    : nAtt === 5 ? 0.90   // too many attackers = unbalanced, midfield hole hurts
    : 0.75;               // 6+ att = catastrophic midfield absence

  // Midfield mult: no mid = no build-up; excess mid (6+) = possession but slow attack
  const midMult = nMid === 0 ? 0.20
    : nMid === 1 ? 0.55
    : nMid === 2 ? 0.80
    : nMid <= 5  ? 1.00
    : nMid === 6 ? 1.05   // slight possession bonus
    : 1.00;               // 7+ mid = absurd but doesn't help more

  // Defense mult: no def = defense exposed; excess def (6+) = organized block
  const defMult = nDef === 0 ? 0.25
    : nDef === 1 ? 0.55
    : nDef === 2 ? 0.80
    : nDef <= 5  ? 1.00
    : nDef === 6 ? 1.10   // solid defensive block
    : nDef === 7 ? 1.15
    : 1.10;               // 8+ def = diminishing returns

  // Cross-penalties: excess in one zone starves another
  // Heavy defense (6+) collapses attack — no midfield outlet
  const heavyDefAttackPenalty = nDef >= 6 ? Math.max(0.10, 1.0 - (nDef - 5) * 0.25) : 1.0;
  // 0 midfielders = attack has no link with defense, both suffer
  const noMidPenalty = nMid === 0 ? 0.35 : nMid === 1 ? 0.70 : 1.0;
  // Excess attack (5+) = defense completely exposed
  const heavyAttDefPenalty = nAtt >= 5 ? Math.max(0.20, 1.0 - (nAtt - 4) * 0.30) : 1.0;

  const rawMidRating = nMid ? avg(mid.map((p) => p.overall)) : 15;
  const rawDefRating = nDef ? avg(def.map((p) => p.overall)) : 15;

  const attack  = (0.7 * meanAtt + 0.3 * meanAm) * tacticMods.attackMult * (coachB?.attackMult ?? 1) * mm * attMult * noMidPenalty * heavyDefAttackPenalty;
  const midfield = rawMidRating * tacticMods.midfieldMult * (coachB?.midfieldMult ?? 1) * mm * midMult;
  const defense = (rawDefRating * 0.8 + (gk?.overall ?? 50) * 0.2) * tacticMods.defenseMult * (coachB?.defenseMult ?? 1) * mm * defMult * heavyAttDefPenalty;
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
    plannedSubs: (plannedSubs ?? []).map((s) => ({ ...s, done: false })),
    planB: [...(directives?.planB ?? [])].sort((a, b) => a.fromMinute - b.fromMinute).map((r) => ({ ...r, done: false })),
    takers: directives?.setPieceTakers,
    captainId: directives?.captainId,
  };
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
