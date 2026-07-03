import type { Formation, TacticStyle, CustomTacticStyle } from '@/lib/types';
import type { TacticMods } from './types';

export type FormationProfile = 'high-press' | 'balanced' | 'midfield-heavy' | 'defensive-block' | 'wide-attack';

export function formationProfile(f: Formation): FormationProfile {
  // 3-4-2-1 : trio offensif compact + pistons hauts → pressing coordonné dès la perte
  if (['4-3-3', '4-2-3-1', '3-4-2-1'].includes(f)) return 'high-press';
  // Ailiers de débordement + pistons offensifs : le danger vient des côtés
  if (['3-4-3', '4-2-4'].includes(f)) return 'wide-attack';
  // 4-1-4-1 = 1 DM + 4 mid + 1 ST → milieu très dense, pas balanced
  // 4-1-2-1-2 (losange) et 4-2-2-2 (carré) : aucun ailier, surnombre axial
  if (['3-5-2', '4-3-2-1', '3-6-1', '4-1-4-1', '4-1-2-1-2', '4-2-2-2'].includes(f)) return 'midfield-heavy';
  if (['5-3-2', '5-4-1', '4-5-1', '3-4-1-2'].includes(f)) return 'defensive-block';
  return 'balanced'; // 4-4-2, 4-4-1-1
}

export const FORMATION_PROFILE_LABEL: Record<FormationProfile, string> = {
  'high-press': 'Pressing haut',
  'balanced': 'Équilibré',
  'midfield-heavy': 'Surnombre au milieu',
  'defensive-block': 'Bloc défensif',
  'wide-attack': 'Attaque par les ailes',
};

export const FORMATION_PROFILE_DESC: Record<FormationProfile, string> = {
  'high-press': 'Ligne haute et récupération immédiate. Crée des occasions près du but adverse, mais laisse de l\'espace dans le dos de la défense.',
  'balanced': 'Deux lignes de quatre, ni surnombre ni sous-nombre structurel. Peu de faiblesses, peu d\'avantages.',
  'midfield-heavy': 'Densité axiale et contrôle du tempo. Domine l\'entrejeu, mais manque de largeur et verticalise lentement.',
  'defensive-block': 'Bloc bas et compact, absorption puis contre-attaque dans les espaces laissés par l\'adversaire.',
  'wide-attack': 'Débordements, centres et renversements de jeu. Étire les défenses, mais concède l\'axe et expose les côtés en transition.',
};

/**
 * Formation matchup table — [attackMult, defenseMult, midfieldMult]
 *
 * Logique tactique :
 *
 * high-press (4-3-3, 4-2-3-1, 3-4-2-1)
 *   Ligne haute, récupération immédiate, pressing dès la perte.
 *   Attaque forte — le pressing crée des occasions hautes.
 *   Défense vulnérable derrière la ligne (espaces dos aux défenseurs).
 *   vs balanced : domine en attaque et au milieu
 *   vs midfield-heavy : milieu dense bloque les circuits du press (−att, −mid)
 *   vs defensive-block : press force le bloc à reculer (+att, +mid),
 *                        mais les longs dégagements du bloc exposent l'espace derrière (−def)
 *   vs wide-attack : press gagne le ballon haut avant les renversements (+att, +mid),
 *                    mais un renversement réussi isole les latéraux (−def)
 *
 * midfield-heavy (3-5-2, 4-3-2-1, 3-6-1, 4-1-4-1, 4-1-2-1-2, 4-2-2-2)
 *   Densité au milieu, circuits courts, contrôle du tempo. Lent à verticaliser.
 *   vs high-press : circuits courts absorbent le press (+mid), attaque légèrement freinée
 *   vs balanced : domination milieu nette
 *   vs defensive-block : possession étouffe le bloc sur la durée (+att, +mid)
 *   vs wide-attack : domine l'axe (+mid) mais les couloirs sont ouverts (−def)
 *
 * defensive-block (5-3-2, 5-4-1, 4-5-1, 3-4-1-2)
 *   Bloc bas et compact, absorption, contre-attaque sur les espaces laissés.
 *   vs high-press : ligne haute laisse l'espace → contre-attaque efficace (+att),
 *                   défense exposée aux tirs en zone haute (−def)
 *   vs balanced : défense solide (+def), peu d'attaque (−att)
 *   vs midfield-heavy : possession finit par percer (−def), peu d'espace pour contrer (−att)
 *   vs wide-attack : 3 centraux + pistons neutralisent les centres (+def),
 *                    contres dans le dos des ailiers montés (+att)
 *
 * wide-attack (3-4-3, 4-2-4)
 *   Largeur maximale, débordements, centres, renversements de jeu.
 *   BAT : balanced et midfield-heavy (surcharge les latéraux, contourne la densité axiale)
 *   PERD contre : defensive-block (5 défenseurs absorbent les centres dans la surface)
 *   vs high-press : jeu ouvert des deux côtés — les diagonales longues sautent le press,
 *                   mais les deux défenses sont exposées
 *
 * balanced (4-4-2, 4-4-1-1)
 *   Ni avantage ni désavantage structurel fort.
 */
export const FORMATION_MATCHUP: Record<FormationProfile, Record<FormationProfile, [number, number, number]>> = {
  // [attackMult, defenseMult, midfieldMult]
  'high-press': {
    'high-press':      [1.00, 1.00, 1.00],
    'balanced':        [1.12, 0.96, 1.08], // press domine l'équilibré
    'midfield-heavy':  [0.90, 0.98, 0.86], // milieu dense étouffe les circuits du press
    'defensive-block': [1.08, 0.88, 1.10], // press enfonce le bloc mais espaces derrière
    'wide-attack':     [1.04, 0.94, 1.04], // récupère haut avant le renversement, mais isolé si contourné
  },
  'balanced': {
    'high-press':      [0.92, 1.06, 0.94], // subit le press mais défend correctement
    'balanced':        [1.00, 1.00, 1.00],
    'midfield-heavy':  [0.94, 1.02, 0.90], // perd le milieu face au surnombre
    'defensive-block': [1.06, 1.02, 1.02], // ouvertures face au bloc
    'wide-attack':     [0.98, 0.94, 1.02], // latéraux en 1c1 permanent sur les côtés
  },
  'midfield-heavy': {
    'high-press':      [0.94, 1.02, 1.12], // circuits courts absorbent le press, milieu domine
    'balanced':        [1.06, 1.00, 1.10], // domination milieu nette
    'midfield-heavy':  [1.00, 1.00, 1.00],
    'defensive-block': [1.10, 0.94, 1.14], // possession étouffe le bloc sur la durée
    'wide-attack':     [0.98, 0.90, 1.08], // gagne l'axe mais couloirs béants, centres en série sur la défense
  },
  'defensive-block': {
    'high-press':      [1.14, 0.92, 0.96], // contre-attaque sur les espaces laissés par la ligne haute
    'balanced':        [0.98, 1.08, 0.98], // défend bien, garde un peu de mordant offensif
    'midfield-heavy':  [0.92, 0.92, 0.90], // possession finit par percer, pas d'espace pour contrer
    'defensive-block': [1.00, 1.00, 1.00],
    'wide-attack':     [1.06, 1.08, 0.98], // absorbe les centres à 5, contre dans le dos des ailiers
  },
  'wide-attack': {
    'high-press':      [1.06, 0.92, 0.96], // les diagonales sautent le press, mais jeu très ouvert
    'balanced':        [1.10, 0.96, 1.00], // surcharge les latéraux adverses
    'midfield-heavy':  [1.12, 0.98, 0.92], // formations étroites sans protection des couloirs — boulevard pour les ailiers
    'defensive-block': [0.92, 0.96, 1.00], // centres absorbés par les 5 défenseurs
    'wide-attack':     [1.00, 1.00, 1.00],
  },
};

export type StyleProfile = 'possession-build' | 'direct-attack' | 'high-intensity' | 'defensive' | 'chaos' | 'wide-play';

export function styleProfile(style: TacticStyle): StyleProfile {
  // football-total : permutations + possession — même famille que le jeu de position
  if (['possession', 'tiki-taka', 'football-total'].includes(style)) return 'possession-build';
  if (['contre-attaque', 'direct', 'long-ball'].includes(style)) return 'direct-attack';
  if (['pressing', 'gegenpressing'].includes(style)) return 'high-intensity';
  // bloc-median : compacité et pièges entre les lignes — famille défensive
  if (['ultra-defensif', 'bloc-median'].includes(style)) return 'defensive';
  if (style === 'ailes') return 'wide-play';
  return 'chaos';
}

export const STYLE_PROFILE_LABEL: Record<StyleProfile, string> = {
  'possession-build': 'Construction / possession',
  'direct-attack': 'Attaque directe',
  'high-intensity': 'Haute intensité',
  'defensive': 'Défensif',
  'chaos': 'Chaos',
  'wide-play': 'Jeu de côtés',
};

export const STYLE_PROFILE_DESC: Record<StyleProfile, string> = {
  'possession-build': 'Triangles courts et construction patiente. Perce les blocs sur la durée, mais vulnérable au pressing immédiat et aux longs ballons dans le dos.',
  'direct-attack': 'Verticalité et transitions rapides. Punit les lignes hautes, mais s\'écrase contre un bloc bas bien organisé.',
  'high-intensity': 'Récupération haute et asphyxie de la relance adverse. Domine le jeu direct, mais s\'épuise contre un bloc bas ou des circuits courts maîtrisés.',
  'defensive': 'Compacité, absorption, sobriété. Neutralise le jeu direct et use les presseurs, mais finit par céder face à une possession patiente.',
  'chaos': 'Imprévisible, fautes et transitions dans tous les sens. Dérègle les automatismes adverses, mais s\'incline face à une structure disciplinée.',
  'wide-play': 'Débordements, centres et renversements. Contourne le pressing et la densité axiale, mais perd l\'axe face à la possession et les centres meurent dans une surface bien peuplée.',
};

/**
 * Style matchup table — [attackMult, defenseMult, midfieldMult]
 *
 * Logique tactique :
 *
 * possession-build (Possession, Tiki-taka, Football total)
 *   Triangles courts, construction depuis l'arrière, garde le ballon.
 *   PERD contre : direct-attack (long ball exploite l'espace dos aux défenseurs avancés)
 *   PERD contre : high-intensity (pressing immédiat intercepte avant que le triangle ne se forme)
 *   BAT : defensive (étouffe le bloc sur la durée, le bloc ne peut pas sortir)
 *   BAT : chaos (organisation et patience neutralise le désordre adverse)
 *   vs wide-play : contrôle l'axe et le tempo (+mid), mais les renversements
 *                  adverses prennent la défense resserrée dans le sens de la largeur (−def)
 *
 * direct-attack (Contre-attaque, Jeu direct, Long ball)
 *   Verticalité, longs ballons, exploite l'espace derrière la ligne adverse.
 *   BAT : possession-build (espace derrière la ligne haute)
 *   PERD contre : high-intensity (récupération haute avant que le long ballon ne parte)
 *   PERD contre : defensive (bloc bas ferme l'espace — long ball absorbé dans le bloc)
 *   vs wide-play : deux jeux verticaux — légère prime au plus direct
 *
 * high-intensity (Pressing, Gegenpressing)
 *   Récupération immédiate après perte, transitions rapides, épuisement adverse.
 *   BAT : direct-attack (intercepte avant la phase directe)
 *   BAT : chaos (pressing structuré neutralise le pressing anarchique)
 *   PERD contre : possession-build (triangles courts contournent le press, épuise les presseurs)
 *   PERD contre : defensive (bloc bas absorbe le pressing, pas d'espace à combler)
 *   PERD contre : wide-play (la diagonale longue saute la zone de press — le piège se referme sur du vide)
 *
 * defensive (Ultra-défensif, Bloc médian)
 *   Bloc bas/médian compact, peu de transitions offensives, absorption.
 *   BAT : direct-attack (long ball dans le bloc = absorption, pas d'espace)
 *   BAT : high-intensity (pressing contre un bloc bas = épuisement des presseurs)
 *   BAT : wide-play (surface surpeuplée — les centres sont dégagés en série)
 *   PERD contre : possession-build (possession progressive trouve la faille)
 *   PERD contre : chaos (imprévisibilité crée des situations non anticipées)
 *
 * wide-play (Jeu sur les ailes)
 *   Débordements, centres, renversements d'aile à aile.
 *   BAT : high-intensity (les renversements sautent le bloc de press)
 *   BAT : chaos (la largeur structure le jeu là où le chaos s'éparpille)
 *   PERD contre : possession-build (perd la bataille de l'axe, court après le ballon)
 *   PERD contre : defensive (centres absorbés dans la surface)
 *
 * chaos
 *   Pressing anarchique, imprévisible, fautes fréquentes, transitions dans tous les sens.
 *   BAT : possession-build (désorganise les circuits de passe)
 *   BAT : direct-attack (transitions anarchiques récupèrent autant qu'elles perdent)
 *   PERD contre : high-intensity (pressing organisé domine l'anarchie)
 *   PERD contre : defensive (organisation ferme résiste à l'imprévisible)
 */
export const STYLE_MATCHUP: Record<StyleProfile, Record<StyleProfile, [number, number, number]>> = {
  // [attackMult, defenseMult, midfieldMult]
  'possession-build': {
    'possession-build': [1.00, 1.00, 1.00],
    'direct-attack':    [0.88, 0.91, 1.06], // espace derrière → vulnérable défensivement, milieu compense
    'high-intensity':   [0.91, 0.90, 0.88], // gegenpressing casse les circuits AVANT qu'ils se forment
    'defensive':        [1.14, 1.06, 1.12], // possession perce progressivement le bloc
    'chaos':            [1.00, 1.02, 1.06], // patience neutralise le chaos, avantage resserré
    'wide-play':        [1.04, 0.94, 1.10], // contrôle l'axe, mais renversements adverses dans la largeur
  },
  'direct-attack': {
    'possession-build': [1.14, 1.08, 0.92], // exploite l'espace derrière la ligne haute
    'direct-attack':    [1.00, 1.00, 1.00],
    'high-intensity':   [0.94, 0.91, 0.96], // récupération haute gêne le long ballon, milieu tient mieux
    'defensive':        [0.92, 0.94, 0.90], // bloc bas ferme l'espace, mais long ball garde du mordant
    'chaos':            [1.00, 1.04, 1.00], // transitions directes exploitent le désordre aussi
    'wide-play':        [1.02, 0.98, 1.00], // deux jeux verticaux, prime au plus direct
  },
  'high-intensity': {
    'possession-build': [1.06, 1.04, 1.08], // gegenpressing casse les triangles courts
    'direct-attack':    [1.06, 1.09, 1.04], // récupère avant le long ballon, transitions propres
    'high-intensity':   [1.00, 1.00, 1.00],
    'defensive':        [0.90, 0.88, 0.92], // bloc bas absorbe le pressing, peu d'espace
    'chaos':            [1.10, 1.08, 1.06], // pressing structuré domine le pressing anarchique
    'wide-play':        [0.96, 0.92, 1.02], // la diagonale longue saute la zone de press
  },
  'defensive': {
    'possession-build': [0.88, 0.96, 0.90], // possession finit par trouver la faille
    'direct-attack':    [1.08, 1.14, 1.10], // long ball dans le bloc = absorption solide
    'high-intensity':   [1.06, 1.12, 0.96], // pressing contre bloc bas = épuisement des presseurs
    'defensive':        [1.00, 1.00, 1.00],
    'chaos':            [1.00, 0.96, 0.96], // imprévisibilité crée des failles, moins écrasant
    'wide-play':        [1.02, 1.10, 1.00], // surface surpeuplée, centres dégagés en série
  },
  'chaos': {
    'possession-build': [1.00, 1.00, 1.02], // désorganise les automatismes de passe, avantage resserré
    'direct-attack':    [1.00, 1.00, 1.02], // transitions dans tous les sens, plus équilibré face au direct
    'high-intensity':   [0.92, 0.94, 0.94], // pressing structuré neutralise l'anarchie
    'defensive':        [1.00, 1.02, 0.96], // imprévisibilité perce l'organisation, moins d'écart
    'chaos':            [1.00, 1.00, 1.00],
    'wide-play':        [0.98, 0.96, 1.00], // la largeur structure, le chaos s'éparpille
  },
  'wide-play': {
    'possession-build': [1.04, 0.96, 0.92], // attaque la largeur d'une structure étroite, perd l'axe
    'direct-attack':    [1.02, 0.96, 1.00], // jeu ouvert, léger désavantage face au plus vertical
    'high-intensity':   [1.08, 1.00, 0.96], // renversements par-dessus le press — le piège se referme sur du vide
    'defensive':        [0.90, 1.00, 0.96], // centres dans une surface bien peuplée
    'chaos':            [1.04, 1.02, 1.00], // structure large > anarchie
    'wide-play':        [1.00, 1.00, 1.00],
  },
};

/**
 * Baseline when only ONE side has a discernible style: the styled side gets a
 * modest inherent edge/cost vs a neutral opponent; the neutral side gets [1,1,1].
 */
const STYLE_VS_NEUTRAL: Record<StyleProfile, [number, number, number]> = {
  'possession-build': [1.02, 1.00, 1.06],
  'direct-attack':    [1.05, 0.98, 0.98],
  'high-intensity':   [1.02, 1.00, 1.05],
  'defensive':        [0.96, 1.06, 0.98],
  'chaos':            [1.02, 0.97, 1.00],
  'wide-play':        [1.04, 0.98, 0.97],
};

/**
 * Derive a StyleProfile from CustomTacticStyle mods when no named style exists.
 * Uses dominant multiplier to classify. Returns null when no profile dominates
 * (neutral sliders) — the style matchup layer is then skipped for that side.
 */
export function customStyleProfile(mods: TacticMods): StyleProfile | null {
  const { shotFreqMult, midfieldMult, attackMult, defenseMult, foulRateMult } = mods;
  if (foulRateMult >= 1.25 && shotFreqMult >= 1.20) return 'chaos';
  if (defenseMult >= 1.10) return 'defensive';
  if (foulRateMult >= 1.12 && midfieldMult >= 1.08) return 'high-intensity';
  if (midfieldMult >= 1.10) return 'possession-build';
  // largeur = attaque boostée + axe délaissé + jeu propre (centres, pas de duels axiaux)
  if (attackMult >= 1.08 && midfieldMult <= 0.94 && foulRateMult < 1.00) return 'wide-play';
  if (shotFreqMult >= 1.12 || attackMult >= 1.08) return 'direct-attack';
  return null;
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
  if (mySP && oppSP) {
    [sAtt, sDef, sMid] = STYLE_MATCHUP[mySP][oppSP];
  } else if (mySP) {
    // opponent has no discernible style — modest inherent edge/cost only
    [sAtt, sDef, sMid] = STYLE_VS_NEUTRAL[mySP];
  }
  // mySP null → no style layer for this side

  return {
    attackMult:  fAtt * sAtt,
    defenseMult: fDef * sDef,
    midfieldMult: fMid * sMid,
  };
}
