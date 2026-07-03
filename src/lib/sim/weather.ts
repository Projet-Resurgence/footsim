/**
 * Météo de match — zones climatiques regroupant plusieurs pays,
 * tirage seedé par match, effets sur le moteur de simulation.
 */

export type WeatherKind = 'clair' | 'couvert' | 'pluie' | 'orage' | 'neige' | 'vent' | 'brouillard' | 'canicule';

export type Weather = { kind: WeatherKind; tempC: number };

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clair: 'Ciel dégagé',
  couvert: 'Couvert',
  pluie: 'Pluie',
  orage: 'Orage',
  neige: 'Neige',
  vent: 'Vent fort',
  brouillard: 'Brouillard',
  canicule: 'Canicule',
};

export type ClimateZone =
  | 'europe-nord' | 'europe-ouest' | 'europe-est' | 'mediterranee'
  | 'sahara-moyen-orient' | 'afrique-tropicale' | 'afrique-australe'
  | 'asie-centrale' | 'asie-est' | 'asie-sud-tropicale'
  | 'ameriques-nord' | 'ameriques-tropicales' | 'ameriques-sud-temperees' | 'oceanie';

export const CLIMATE_ZONES: ClimateZone[] = [
  'europe-nord', 'europe-ouest', 'europe-est', 'mediterranee',
  'sahara-moyen-orient', 'afrique-tropicale', 'afrique-australe',
  'asie-centrale', 'asie-est', 'asie-sud-tropicale',
  'ameriques-nord', 'ameriques-tropicales', 'ameriques-sud-temperees', 'oceanie',
];

export const CLIMATE_ZONE_LABEL: Record<ClimateZone, string> = {
  'europe-nord': 'Europe du Nord',
  'europe-ouest': 'Europe de l\'Ouest',
  'europe-est': 'Europe de l\'Est',
  'mediterranee': 'Méditerranée',
  'sahara-moyen-orient': 'Sahara & Moyen-Orient',
  'afrique-tropicale': 'Afrique tropicale',
  'afrique-australe': 'Afrique australe',
  'asie-centrale': 'Asie centrale',
  'asie-est': 'Asie de l\'Est',
  'asie-sud-tropicale': 'Asie du Sud & Sud-Est',
  'ameriques-nord': 'Amérique du Nord',
  'ameriques-tropicales': 'Amériques tropicales',
  'ameriques-sud-temperees': 'Amérique du Sud tempérée',
  'oceanie': 'Océanie',
};

/** Pays/régions englobés — affiché dans les sélecteurs pour guider le choix */
export const CLIMATE_ZONE_DESC: Record<ClimateZone, string> = {
  'europe-nord': 'Scandinavie, Baltique, Islande, Russie du Nord',
  'europe-ouest': 'France, Îles Britanniques, Benelux, Allemagne, Suisse',
  'europe-est': 'Pologne, Ukraine, Russie, Balkans continentaux, Hongrie',
  'mediterranee': 'Espagne, Italie, Grèce, Turquie, Levant, côte nord-africaine',
  'sahara-moyen-orient': 'Sahara, Égypte, Arabie, Golfe, Iran, Irak',
  'afrique-tropicale': 'Afrique de l\'Ouest, Centrale et de l\'Est',
  'afrique-australe': 'Afrique du Sud, Namibie, Botswana, Zimbabwe',
  'asie-centrale': 'Kazakhstan, steppes, Mongolie, Caucase',
  'asie-est': 'Chine, Japon, Corées, Taïwan',
  'asie-sud-tropicale': 'Inde, Thaïlande, Vietnam, Indonésie, Philippines',
  'ameriques-nord': 'USA, Canada, Mexique du Nord',
  'ameriques-tropicales': 'Caraïbes, Amérique centrale, Brésil, Colombie, Pérou',
  'ameriques-sud-temperees': 'Argentine, Chili, Uruguay, Paraguay',
  'oceanie': 'Australie, Nouvelle-Zélande, îles du Pacifique',
};

type ZoneClimate = {
  /** [min, max] température plausible un jour de match */
  tempRange: [number, number];
  /** Poids relatifs de chaque type de temps (0 = impossible dans la zone) */
  weights: Record<WeatherKind, number>;
};

const ZONE_CLIMATE: Record<ClimateZone, ZoneClimate> = {
  'europe-nord': {
    tempRange: [-8, 20],
    weights: { clair: 18, couvert: 26, pluie: 20, orage: 3, neige: 14, vent: 10, brouillard: 9, canicule: 0 },
  },
  'europe-ouest': {
    tempRange: [0, 27],
    weights: { clair: 24, couvert: 26, pluie: 22, orage: 6, neige: 3, vent: 10, brouillard: 8, canicule: 1 },
  },
  'europe-est': {
    tempRange: [-10, 28],
    weights: { clair: 24, couvert: 24, pluie: 16, orage: 6, neige: 12, vent: 10, brouillard: 7, canicule: 1 },
  },
  'mediterranee': {
    tempRange: [8, 36],
    weights: { clair: 42, couvert: 16, pluie: 10, orage: 6, neige: 0, vent: 12, brouillard: 3, canicule: 11 },
  },
  'sahara-moyen-orient': {
    tempRange: [16, 46],
    weights: { clair: 52, couvert: 8, pluie: 2, orage: 2, neige: 0, vent: 14, brouillard: 1, canicule: 21 },
  },
  'afrique-tropicale': {
    tempRange: [21, 37],
    weights: { clair: 30, couvert: 18, pluie: 22, orage: 16, neige: 0, vent: 5, brouillard: 2, canicule: 7 },
  },
  'afrique-australe': {
    tempRange: [7, 32],
    weights: { clair: 38, couvert: 18, pluie: 14, orage: 8, neige: 0, vent: 12, brouillard: 4, canicule: 6 },
  },
  'asie-centrale': {
    tempRange: [-12, 32],
    weights: { clair: 30, couvert: 20, pluie: 10, orage: 4, neige: 12, vent: 16, brouillard: 5, canicule: 3 },
  },
  'asie-est': {
    tempRange: [-4, 32],
    weights: { clair: 28, couvert: 22, pluie: 18, orage: 8, neige: 6, vent: 8, brouillard: 6, canicule: 4 },
  },
  'asie-sud-tropicale': {
    tempRange: [22, 40],
    weights: { clair: 26, couvert: 18, pluie: 22, orage: 16, neige: 0, vent: 4, brouillard: 3, canicule: 11 },
  },
  'ameriques-nord': {
    tempRange: [-8, 32],
    weights: { clair: 28, couvert: 20, pluie: 16, orage: 8, neige: 8, vent: 10, brouillard: 5, canicule: 5 },
  },
  'ameriques-tropicales': {
    tempRange: [20, 36],
    weights: { clair: 30, couvert: 18, pluie: 22, orage: 14, neige: 0, vent: 6, brouillard: 2, canicule: 8 },
  },
  'ameriques-sud-temperees': {
    tempRange: [0, 28],
    weights: { clair: 28, couvert: 22, pluie: 18, orage: 6, neige: 2, vent: 14, brouillard: 8, canicule: 2 },
  },
  'oceanie': {
    tempRange: [6, 34],
    weights: { clair: 34, couvert: 20, pluie: 16, orage: 6, neige: 0, vent: 14, brouillard: 4, canicule: 6 },
  },
};

/** Petit PRNG déterministe (mulberry32) — même matchId = même météo */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function rollWeather(zone: ClimateZone, seed: number): Weather {
  const climate = ZONE_CLIMATE[zone];
  const rng = mulberry32(seed);

  // Tirage du type de temps
  const entries = Object.entries(climate.weights) as [WeatherKind, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  let kind: WeatherKind = 'clair';
  for (const [k, w] of entries) {
    roll -= w;
    if (roll <= 0) { kind = k; break; }
  }

  // Température dans la plage de la zone, resserrée selon le type de temps
  const [min, max] = climate.tempRange;
  let lo = min, hi = max;
  if (kind === 'neige') { hi = Math.min(hi, 1); }
  else if (kind === 'canicule') { lo = Math.max(lo, Math.max(30, hi - 8)); }
  else if (kind === 'pluie' || kind === 'orage' || kind === 'couvert' || kind === 'brouillard') {
    // temps couvert = ni les extrêmes chauds ni les extrêmes froids
    lo = min + (max - min) * 0.15;
    hi = max - (max - min) * 0.2;
  }
  if (hi < lo) hi = lo;
  const tempC = Math.round(lo + rng() * (hi - lo));

  return { kind, tempC };
}

// ─── Effets moteur ────────────────────────────────────────────────────────────

export type WeatherFx = {
  /** Multiplie le poids des passes clés (terrain gras = circuits cassés) */
  keyPassMult: number;
  /** Multiplie le poids des dribbles (ballon glissant, appuis incertains) */
  dribbleMult: number;
  /** Multiplie le poids des fautes (tacles glissés, duels ratés) */
  foulMult: number;
  /** Multiplie la fréquence de tirs */
  shotFreqMult: number;
  /** Additif sur la probabilité de cadrer (base 0.55) */
  onTargetDelta: number;
  /** Additif sur la conversion des coups de pied arrêtés (corners 0.35, CF 0.30) */
  setPieceDelta: number;
  /** Multiplie la pénalité de fatigue (canicule = jambes coupées) */
  fatigueMult: number;
};

const NEUTRAL_FX: WeatherFx = {
  keyPassMult: 1, dribbleMult: 1, foulMult: 1, shotFreqMult: 1,
  onTargetDelta: 0, setPieceDelta: 0, fatigueMult: 1,
};

const KIND_FX: Record<WeatherKind, WeatherFx> = {
  clair:      NEUTRAL_FX,
  couvert:    NEUTRAL_FX,
  pluie:      { keyPassMult: 0.92, dribbleMult: 0.90, foulMult: 1.10, shotFreqMult: 1.00, onTargetDelta: -0.03, setPieceDelta: 0,     fatigueMult: 1.05 },
  orage:      { keyPassMult: 0.88, dribbleMult: 0.85, foulMult: 1.18, shotFreqMult: 0.95, onTargetDelta: -0.05, setPieceDelta: -0.03, fatigueMult: 1.10 },
  neige:      { keyPassMult: 0.85, dribbleMult: 0.82, foulMult: 1.10, shotFreqMult: 0.90, onTargetDelta: -0.06, setPieceDelta: -0.05, fatigueMult: 1.15 },
  vent:       { keyPassMult: 0.95, dribbleMult: 1.00, foulMult: 1.00, shotFreqMult: 0.95, onTargetDelta: -0.04, setPieceDelta: -0.08, fatigueMult: 1.00 },
  brouillard: { keyPassMult: 0.92, dribbleMult: 0.95, foulMult: 1.05, shotFreqMult: 0.95, onTargetDelta: -0.05, setPieceDelta: -0.02, fatigueMult: 1.00 },
  canicule:   { keyPassMult: 1.00, dribbleMult: 0.95, foulMult: 1.00, shotFreqMult: 1.00, onTargetDelta: 0,     setPieceDelta: 0,     fatigueMult: 1.40 },
};

export function weatherFx(weather?: Weather): WeatherFx {
  if (!weather) return NEUTRAL_FX;
  const base = KIND_FX[weather.kind];
  // Extrêmes de température au-delà du type de temps
  let fatigueMult = base.fatigueMult;
  let dribbleMult = base.dribbleMult;
  if (weather.tempC >= 32 && weather.kind !== 'canicule') fatigueMult += 0.15;
  if (weather.tempC <= 0) { fatigueMult += 0.10; dribbleMult *= 0.95; }
  if (fatigueMult === base.fatigueMult && dribbleMult === base.dribbleMult) return base;
  return { ...base, fatigueMult, dribbleMult };
}

/** Zone par défaut à partir du continent de l'équipe à domicile (matchs amicaux) */
export function zoneFromContinent(continent?: string): ClimateZone | undefined {
  switch (continent) {
    case 'europe': return 'europe-ouest';
    case 'afriquenord': return 'sahara-moyen-orient';
    case 'afrique': return 'afrique-tropicale';
    case 'moyenorient': return 'sahara-moyen-orient';
    case 'asie': return 'asie-est';
    case 'asiecentrale': return 'asie-centrale';
    case 'amerique': return 'ameriques-nord';
    case 'oceanie': return 'oceanie';
    default: return undefined;
  }
}
