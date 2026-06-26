import type { Formation, TacticStyle, CustomTacticStyle } from '@/lib/types';
import type { TacticMods } from './types';

type FormationProfile = 'high-press' | 'balanced' | 'midfield-heavy' | 'defensive-block';

function formationProfile(f: Formation): FormationProfile {
  if (['4-3-3', '3-4-3', '4-2-3-1'].includes(f)) return 'high-press';
  // 4-1-4-1 = 1 DM + 4 mid + 1 ST → milieu très dense, pas balanced
  if (['3-5-2', '4-3-2-1', '3-6-1', '4-1-4-1'].includes(f)) return 'midfield-heavy';
  if (['5-3-2', '5-4-1', '4-5-1', '3-4-1-2'].includes(f)) return 'defensive-block';
  return 'balanced'; // 4-4-2, 4-4-1-1
}

/**
 * Formation matchup table.
 * Returns [myAttackMult, myDefenseMult, myMidfieldMult] for `my` formation vs `opp` formation.
 * Values are centered around 1.0 with ±5–10% range.
 */
/**
 * Formation matchup table — [attackMult, defenseMult, midfieldMult]
 *
 * Logique tactique :
 *
 * high-press (4-3-3, 4-2-3-1, 3-4-3)
 *   Ligne haute, récupération immédiate, pressing dès la perte.
 *   Attaque forte — le pressing crée des occasions hautes.
 *   Défense vulnérable derrière la ligne (espaces dos aux défenseurs).
 *   vs balanced : domine en attaque et au milieu
 *   vs midfield-heavy : milieu dense bloque les circuits du press (−att, −mid)
 *   vs defensive-block : press force le bloc à reculer (+att, +mid),
 *                        mais les longs dégagements du bloc exposent l'espace derrière (−def)
 *
 * midfield-heavy (3-5-2, 4-3-2-1, 3-6-1, 4-1-4-1)
 *   Densité au milieu, circuits courts, contrôle du tempo. Lent à verticaliser.
 *   vs high-press : circuits courts absorbent le press (+mid), attaque légèrement freinée
 *   vs balanced : domination milieu nette
 *   vs defensive-block : possession étouffe le bloc sur la durée (+att, +mid)
 *
 * defensive-block (5-3-2, 5-4-1, 4-5-1, 3-4-1-2)
 *   Bloc bas et compact, absorption, contre-attaque sur les espaces laissés.
 *   vs high-press : ligne haute laisse l'espace → contre-attaque efficace (+att),
 *                   défense exposée aux tirs en zone haute (−def)
 *   vs balanced : défense solide (+def), peu d'attaque (−att)
 *   vs midfield-heavy : possession finit par percer (−def), peu d'espace pour contrer (−att)
 *
 * balanced (4-4-2, 4-4-1-1)
 *   Ni avantage ni désavantage structurel fort.
 */
const FORMATION_MATCHUP: Record<FormationProfile, Record<FormationProfile, [number, number, number]>> = {
  // [attackMult, defenseMult, midfieldMult]
  'high-press': {
    'high-press':      [1.00, 1.00, 1.00],
    'balanced':        [1.12, 0.96, 1.08], // press domine l'équilibré
    'midfield-heavy':  [0.90, 0.98, 0.86], // milieu dense étouffe les circuits du press
    'defensive-block': [1.08, 0.88, 1.10], // press enfonce le bloc mais espaces derrière
  },
  'balanced': {
    'high-press':      [0.92, 1.06, 0.94], // subit le press mais défend correctement
    'balanced':        [1.00, 1.00, 1.00],
    'midfield-heavy':  [0.94, 1.02, 0.90], // perd le milieu face au surnom
    'defensive-block': [1.06, 1.02, 1.02], // ouvertures face au bloc
  },
  'midfield-heavy': {
    'high-press':      [0.94, 1.02, 1.12], // circuits courts absorbent le press, milieu domine
    'balanced':        [1.06, 1.00, 1.10], // domination milieu nette
    'midfield-heavy':  [1.00, 1.00, 1.00],
    'defensive-block': [1.10, 0.94, 1.14], // possession étouffe le bloc sur la durée
  },
  'defensive-block': {
    'high-press':      [1.14, 0.92, 0.96], // contre-attaque sur les espaces laissés par la ligne haute
    'balanced':        [0.94, 1.08, 0.98], // défend bien, n'attaque pas
    'midfield-heavy':  [0.88, 0.92, 0.90], // possession finit par percer, pas d'espace pour contrer
    'defensive-block': [1.00, 1.00, 1.00],
  },
};

type StyleProfile = 'possession-build' | 'direct-attack' | 'high-intensity' | 'defensive' | 'chaos';

function styleProfile(style: TacticStyle): StyleProfile {
  if (['possession', 'tiki-taka'].includes(style)) return 'possession-build';
  if (['contre-attaque', 'direct', 'long-ball'].includes(style)) return 'direct-attack';
  if (['pressing', 'gegenpressing'].includes(style)) return 'high-intensity';
  if (style === 'ultra-defensif') return 'defensive';
  return 'chaos';
}

/**
 * Style matchup table — [attackMult, defenseMult, midfieldMult]
 *
 * Logique tactique :
 *
 * possession-build (Possession, Tiki-taka)
 *   Triangles courts, construction depuis l'arrière, garde le ballon.
 *   PERD contre : direct-attack (long ball exploite l'espace dos aux défenseurs avancés)
 *   PERD contre : high-intensity (pressing immédiat intercepte avant que le triangle ne se forme)
 *   BAT : defensive (étouffe le bloc sur la durée, le bloc ne peut pas sortir)
 *   BAT : chaos (organisation et patience neutralise le désordre adverse)
 *
 * direct-attack (Contre-attaque, Jeu direct, Long ball)
 *   Verticalité, longs ballons, exploite l'espace derrière la ligne adverse.
 *   BAT : possession-build (espace derrière la ligne haute)
 *   PERD contre : high-intensity (récupération haute avant que le long ballon ne parte)
 *   PERD contre : defensive (bloc bas ferme l'espace — long ball absorbé dans le bloc)
 *
 * high-intensity (Pressing, Gegenpressing)
 *   Récupération immédiate après perte, transitions rapides, épuisement adverse.
 *   BAT : direct-attack (intercepte avant la phase directe)
 *   BAT : chaos (pressing structuré neutralise le pressing anarchique)
 *   PERD contre : possession-build (triangles courts contournent le press, épuise les presseurs)
 *   PERD contre : defensive (bloc bas absorbe le pressing, pas d'espace à combler)
 *
 * defensive (Ultra-défensif)
 *   Bloc très bas et compact, peu de transitions offensives, absorption.
 *   BAT : direct-attack (long ball dans le bloc = absorption, pas d'espace)
 *   BAT : high-intensity (pressing contre un bloc bas = épuisement des presseurs)
 *   PERD contre : possession-build (possession progressive trouve la faille)
 *   PERD contre : chaos (imprévisibilité crée des situations non anticipées)
 *
 * chaos
 *   Pressing anarchique, imprévisible, fautes fréquentes, transitions dans tous les sens.
 *   BAT : possession-build (désorganise les circuits de passe)
 *   BAT : direct-attack (transitions anarchiques récupèrent autant qu'elles perdent)
 *   PERD contre : high-intensity (pressing organisé domine l'anarchie)
 *   PERD contre : defensive (organisation ferme résiste à l'imprévisible)
 */
const STYLE_MATCHUP: Record<StyleProfile, Record<StyleProfile, [number, number, number]>> = {
  // [attackMult, defenseMult, midfieldMult]
  'possession-build': {
    'possession-build': [1.00, 1.00, 1.00],
    'direct-attack':    [0.88, 0.91, 1.06], // espace derrière → vulnérable défensivement, milieu compense
    'high-intensity':   [0.91, 0.90, 0.88], // gegenpressing casse les circuits AVANT qu'ils se forment
    'defensive':        [1.14, 1.06, 1.12], // possession perce progressivement le bloc
    'chaos':            [1.08, 1.06, 1.10], // patience et organisation neutralise le chaos
  },
  'direct-attack': {
    'possession-build': [1.14, 1.08, 0.92], // exploite l'espace derrière la ligne haute
    'direct-attack':    [1.00, 1.00, 1.00],
    'high-intensity':   [0.88, 0.91, 0.90], // récupération haute coupe le long ballon avant
    'defensive':        [0.86, 0.94, 0.90], // bloc bas ferme l'espace — long ball absorbé
    'chaos':            [0.96, 1.04, 0.98], // chaos crée autant d'espaces pour les deux
  },
  'high-intensity': {
    'possession-build': [1.06, 1.04, 1.08], // gegenpressing casse les triangles courts
    'direct-attack':    [1.12, 1.10, 1.12], // récupère avant le long ballon, transitions propres
    'high-intensity':   [1.00, 1.00, 1.00],
    'defensive':        [0.90, 0.88, 0.92], // bloc bas absorbe le pressing, peu d'espace
    'chaos':            [1.10, 1.08, 1.06], // pressing structuré domine le pressing anarchique
  },
  'defensive': {
    'possession-build': [0.88, 0.96, 0.90], // possession finit par trouver la faille
    'direct-attack':    [1.04, 1.14, 0.94], // long ball dans le bloc = absorption solide
    'high-intensity':   [1.06, 1.12, 0.96], // pressing contre bloc bas = épuisement des presseurs
    'defensive':        [1.00, 1.00, 1.00],
    'chaos':            [0.92, 0.90, 0.96], // imprévisibilité crée des failles dans le bloc
  },
  'chaos': {
    'possession-build': [1.10, 0.96, 1.02], // désorganise les automatismes de passe
    'direct-attack':    [1.08, 0.98, 1.04], // transitions dans tous les sens, récupère autant
    'high-intensity':   [0.92, 0.94, 0.94], // pressing structuré neutralise l'anarchie
    'defensive':        [1.06, 1.08, 1.00], // imprévisibilité perce l'organisation
    'chaos':            [1.00, 1.00, 1.00],
  },
};

/**
 * Derive a StyleProfile from CustomTacticStyle mods when no named style exists.
 * Uses dominant multiplier to classify.
 */
function customStyleProfile(mods: TacticMods): StyleProfile {
  const { shotFreqMult, midfieldMult, attackMult, defenseMult, foulRateMult } = mods;
  if (defenseMult >= 1.12) return 'defensive';
  if (foulRateMult >= 1.15 && midfieldMult >= 1.10) return 'high-intensity';
  if (midfieldMult >= 1.12) return 'possession-build';
  if (shotFreqMult >= 1.15 || attackMult >= 1.10) return 'direct-attack';
  if (foulRateMult >= 1.25 || shotFreqMult >= 1.25) return 'chaos';
  return 'balanced' as unknown as StyleProfile; // falls back to neutral
}

function resolveStyleProfile(
  tacticStyle?: TacticStyle,
  customTacticStyle?: CustomTacticStyle,
): StyleProfile | null {
  if (customTacticStyle) return customStyleProfile(customTacticStyle.mods);
  if (tacticStyle) return styleProfile(tacticStyle);
  return null;
}

export type MatchupAdjustment = {
  attackMult: number;
  defenseMult: number;
  midfieldMult: number;
};

/**
 * Compute cross-side matchup multipliers for one side.
 * Combines formation matchup + style matchup.
 * Each layer contributes independently; combined by multiplication.
 * Total swing stays bounded (both layers ±10% max = ±20% combined edge).
 */
export function computeMatchupAdjustment(
  myFormation: Formation,
  oppFormation: Formation,
  myTacticStyle?: TacticStyle,
  myCustomTacticStyle?: CustomTacticStyle,
  oppTacticStyle?: TacticStyle,
  oppCustomTacticStyle?: CustomTacticStyle,
): MatchupAdjustment {
  const myFP = formationProfile(myFormation);
  const oppFP = formationProfile(oppFormation);
  const [fAtt, fDef, fMid] = FORMATION_MATCHUP[myFP][oppFP];

  const mySP = resolveStyleProfile(myTacticStyle, myCustomTacticStyle);
  const oppSP = resolveStyleProfile(oppTacticStyle, oppCustomTacticStyle);

  let sAtt = 1.0, sDef = 1.0, sMid = 1.0;
  if (mySP && oppSP && mySP !== ('balanced' as StyleProfile) && oppSP !== ('balanced' as StyleProfile)) {
    [sAtt, sDef, sMid] = STYLE_MATCHUP[mySP as StyleProfile][oppSP as StyleProfile];
  } else if (mySP && oppSP) {
    // one side has no dominant style — partial influence (50%)
    const raw = (mySP !== ('balanced' as StyleProfile))
      ? STYLE_MATCHUP[mySP as StyleProfile][oppSP as StyleProfile]
      : STYLE_MATCHUP[oppSP as StyleProfile][mySP as StyleProfile];
    sAtt  = 1 + (raw[0] - 1) * 0.5;
    sDef  = 1 + (raw[1] - 1) * 0.5;
    sMid  = 1 + (raw[2] - 1) * 0.5;
  }

  return {
    attackMult:  fAtt * sAtt,
    defenseMult: fDef * sDef,
    midfieldMult: fMid * sMid,
  };
}
