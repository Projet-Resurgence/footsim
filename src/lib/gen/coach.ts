import type { Culture } from '@/lib/types';
import { pickNameMixed } from './names';
import type { CultureWeight } from './names';

export type PositiveTrait =
  | 'motivateur'     // +5% attack
  | 'tacticien'      // +8% midfield
  | 'offensif'       // +7% attack, +5% shot freq
  | 'defensif'       // +8% defense
  | 'disciplinaire'  // -35% foul rate
  | 'opportuniste'   // +12% shot freq
  | 'gestionnaire'   // +5% all (subs bonus)
  | 'charismatique'  // +4% all ratings
  | 'analyste'       // +6% midfield, +3% defense
  | 'meneur';        // +6% attack, -10% foul rate

export type NegativeTrait =
  | 'impulsif'       // +40% foul rate
  | 'conservateur'   // -8% attack, -6% shot freq
  | 'desorganise'    // -7% midfield
  | 'conflictuel'    // -5% all ratings
  | 'imprevoyant'    // -6% defense
  | 'rigide'         // -5% midfield, -4% attack
  | 'passif'         // -10% shot freq
  | 'impatient'      // +20% foul rate, -4% defense
  | 'alcoolique'     // annule 1 trait positif aléatoire en match + -10% all
  | 'drogue';        // annule 1 trait positif aléatoire en match + +25% foul rate

export type CoachTrait = PositiveTrait | NegativeTrait;

export const POSITIVE_TRAITS: PositiveTrait[] = [
  'motivateur', 'tacticien', 'offensif', 'defensif',
  'disciplinaire', 'opportuniste', 'gestionnaire', 'charismatique',
  'analyste', 'meneur',
];

export const NEGATIVE_TRAITS: NegativeTrait[] = [
  'impulsif', 'conservateur', 'desorganise', 'conflictuel',
  'imprevoyant', 'rigide', 'passif', 'impatient',
  'alcoolique', 'drogue',
];

/** Traits that cancel a random positive trait each match before computing bonuses */
export const CANCELLING_TRAITS = new Set<NegativeTrait>(['alcoolique', 'drogue']);

export const COACH_TRAIT_LABEL: Record<CoachTrait, string> = {
  // positive
  motivateur: 'Motivateur',
  tacticien: 'Tacticien',
  offensif: 'Offensif',
  defensif: 'Défensif',
  disciplinaire: 'Disciplinaire',
  opportuniste: 'Opportuniste',
  gestionnaire: 'Gestionnaire',
  charismatique: 'Charismatique',
  analyste: 'Analyste',
  meneur: 'Meneur',
  // negative
  impulsif: 'Impulsif',
  conservateur: 'Conservateur',
  desorganise: 'Désorganisé',
  conflictuel: 'Conflictuel',
  imprevoyant: 'Imprévoyant',
  rigide: 'Rigide',
  passif: 'Passif',
  impatient: 'Impatient',
  alcoolique: 'Alcoolique',
  drogue: 'Drogué',
};

export const COACH_TRAIT_DESCRIPTION: Record<CoachTrait, string> = {
  motivateur: '+5% attaque — galvanise les joueurs en phase offensive.',
  tacticien: '+8% milieu — organisation tactique supérieure.',
  offensif: '+7% attaque, +5% fréquence de tirs — pressing vers l\'avant.',
  defensif: '+8% défense — bloc bas et solidité défensive.',
  disciplinaire: '-35% fautes — équipe propre et disciplinée.',
  opportuniste: '+12% fréquence de tirs — cherche le but à chaque occasion.',
  gestionnaire: '+5% sur tout — management global de qualité.',
  charismatique: '+4% sur tous les ratings — leadership naturel.',
  analyste: '+6% milieu, +3% défense — lecture du jeu adverse.',
  meneur: '+6% attaque, -10% fautes — entraîneur-leader.',
  impulsif: '+40% fautes commises — tempérament incontrôlable.',
  conservateur: '-8% attaque, -6% tirs — trop prudent, manque d\'ambition.',
  desorganise: '-7% milieu — organisation déficiente.',
  conflictuel: '-5% sur tout — mauvais climat dans le vestiaire.',
  imprevoyant: '-6% défense — pas de plan B défensif.',
  rigide: '-5% milieu, -4% attaque — incapable de s\'adapter.',
  passif: '-10% fréquence de tirs — équipe trop attentiste.',
  impatient: '+20% fautes, -4% défense — perd ses nerfs en cours de match.',
  alcoolique: 'Annule 1 trait positif aléatoire par match, -10% sur tout — performances imprévisibles.',
  drogue: 'Annule 1 trait positif aléatoire par match, +25% fautes — instabilité comportementale.',
};

export type CoachStats = {
  motivation: number;
  tactique: number;
  offensive: number;
  defensif: number;
  mentalite: number;
  gestion: number;
};

export type Coach = {
  id: string;
  firstName: string;
  lastName: string;
  culture: Culture;
  stats: CoachStats;
  /** 0–2 positive traits */
  positiveTraits: PositiveTrait[];
  /** 0–3 negative traits */
  negativeTraits: NegativeTrait[];
  overall: number;
  /** @deprecated use positiveTraits/negativeTraits */
  trait?: CoachTrait;
};

export type CoachBonuses = {
  attackMult: number;
  midfieldMult: number;
  defenseMult: number;
  shotFreqMult: number;
  foulRateMult: number;
};

function clamp(n: number, lo: number, hi: number) { return n < lo ? lo : n > hi ? hi : n; }

function sampleStat(): number {
  return Math.max(1, Math.min(20, Math.round(8 + Math.random() * 12)));
}

function pickN<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function computeOverall(stats: CoachStats, pos: PositiveTrait[], neg: NegativeTrait[]): number {
  const avg = (stats.motivation + stats.tactique + stats.offensive + stats.defensif + stats.mentalite + stats.gestion) / 6;
  const traitBonus = pos.length * 3 - neg.length * 2;
  return Math.round(clamp(avg * 5 + traitBonus, 1, 100));
}

export function generateCoach(cultures: CultureWeight[]): Coach {
  const dominant = cultures.reduce((a, b) => (a.weight >= b.weight ? a : b)).culture;
  const { firstName, lastName } = pickNameMixed(cultures);
  const stats: CoachStats = {
    motivation: sampleStat(),
    tactique: sampleStat(),
    offensive: sampleStat(),
    defensif: sampleStat(),
    mentalite: sampleStat(),
    gestion: sampleStat(),
  };
  // 0–2 positive traits, 0–3 negative traits (uniform draw)
  const numPos = Math.floor(Math.random() * 3); // 0,1,2
  const numNeg = Math.floor(Math.random() * 4); // 0,1,2,3
  const positiveTraits = pickN(POSITIVE_TRAITS, numPos);
  const negativeTraits = pickN(NEGATIVE_TRAITS, numNeg);

  return {
    id: crypto.randomUUID(),
    firstName,
    lastName,
    culture: dominant,
    stats,
    positiveTraits,
    negativeTraits,
    overall: computeOverall(stats, positiveTraits, negativeTraits),
  };
}

const TRAIT_MODS: Record<CoachTrait, Partial<CoachBonuses>> = {
  motivateur:    { attackMult: 1.05 },
  tacticien:     { midfieldMult: 1.08 },
  offensif:      { attackMult: 1.07, shotFreqMult: 1.05 },
  defensif:      { defenseMult: 1.08 },
  disciplinaire: { foulRateMult: 0.65 },
  opportuniste:  { shotFreqMult: 1.12 },
  gestionnaire:  { attackMult: 1.05, midfieldMult: 1.05, defenseMult: 1.05 },
  charismatique: { attackMult: 1.04, midfieldMult: 1.04, defenseMult: 1.04 },
  analyste:      { midfieldMult: 1.06, defenseMult: 1.03 },
  meneur:        { attackMult: 1.06, foulRateMult: 0.90 },
  impulsif:      { foulRateMult: 1.40 },
  conservateur:  { attackMult: 0.92, shotFreqMult: 0.94 },
  desorganise:   { midfieldMult: 0.93 },
  conflictuel:   { attackMult: 0.95, midfieldMult: 0.95, defenseMult: 0.95 },
  imprevoyant:   { defenseMult: 0.94 },
  rigide:        { midfieldMult: 0.95, attackMult: 0.96 },
  passif:        { shotFreqMult: 0.90 },
  impatient:     { foulRateMult: 1.20, defenseMult: 0.96 },
  // cancelling traits — base malus only, positive cancellation handled in computeCoachBonuses
  alcoolique:    { attackMult: 0.90, midfieldMult: 0.90, defenseMult: 0.90 },
  drogue:        { foulRateMult: 1.25 },
};

export function computeCoachBonuses(coach: Coach, seed?: number): CoachBonuses {
  const s = coach.stats;
  // Base from stats
  let b: CoachBonuses = {
    attackMult:   1 + (s.motivation / 20) * 0.06 + (s.offensive / 20) * 0.08,
    midfieldMult: 1 + (s.tactique / 20) * 0.10,
    defenseMult:  1 + (s.defensif / 20) * 0.08,
    shotFreqMult: 1 + (s.offensive / 20) * 0.04,
    foulRateMult: 1 - (s.mentalite / 20) * 0.10,
  };

  // Determine effective positive traits after cancellation
  let positiveTraits: PositiveTrait[] = coach.positiveTraits ?? (coach.trait ? [coach.trait as PositiveTrait] : []);
  const negativeTraits: NegativeTrait[] = coach.negativeTraits ?? [];

  // Each cancelling negative trait removes one random positive trait
  const cancelCount = negativeTraits.filter((t) => CANCELLING_TRAITS.has(t)).length;
  if (cancelCount > 0 && positiveTraits.length > 0) {
    // Use seed for reproducibility within a match (passed from match engine)
    const rng = seed !== undefined ? () => { seed = (seed! * 1664525 + 1013904223) & 0xffffffff; return Math.abs(seed) / 0xffffffff; } : Math.random;
    const remaining = [...positiveTraits];
    for (let i = 0; i < cancelCount && remaining.length > 0; i++) {
      const idx = Math.floor(rng() * remaining.length);
      remaining.splice(idx, 1);
    }
    positiveTraits = remaining;
  }

  const allTraits: CoachTrait[] = [...positiveTraits, ...negativeTraits];

  for (const trait of allTraits) {
    const mods = TRAIT_MODS[trait];
    if (mods.attackMult)   b.attackMult   *= mods.attackMult;
    if (mods.midfieldMult) b.midfieldMult *= mods.midfieldMult;
    if (mods.defenseMult)  b.defenseMult  *= mods.defenseMult;
    if (mods.shotFreqMult) b.shotFreqMult *= mods.shotFreqMult;
    if (mods.foulRateMult) b.foulRateMult *= mods.foulRateMult;
  }

  return b;
}
