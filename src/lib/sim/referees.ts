/**
 * Profils d'arbitres — 50 arbitres aux tendances distinctes qui colorent chaque
 * match : fréquence de coups de sifflet, sévérité sur les cartons, tendance
 * penalty, générosité du temps additionnel.
 */

export type Referee = {
  id: number;
  name: string;
  /** Multiplie la fréquence des fautes sifflées (0.85–1.25) */
  foulStrictness: number;
  /** Multiplie la probabilité de carton jaune (0.70–1.50) */
  cardStrictness: number;
  /** Multiplie la probabilité de rouge direct (0.60–1.80) */
  redTendency: number;
  /** Multiplie la probabilité de penalty sur faute (0.70–1.40) */
  penaltyTendency: number;
  /** Minutes de temps additionnel en plus/en moins (-1 à +2) */
  addedTimeBias: number;
};

const REFEREE_NAMES = [
  'Bastien Leclerc', 'Karim Ziani', 'Théo Marchand', 'Olivier Brunet', 'Sofiane Kaddour',
  'Damien Roux', 'Nicolas Perrin', 'Yann Le Gall', 'Marc-Antoine Faure', 'Julien Delorme',
  'Rémi Chauvin', 'Anders Lindqvist', 'Piotr Kowalczyk', 'Viktor Petrov', 'Matteo Ricci',
  'Diego Herrera', 'João Mendes', 'Stefan Weber', 'Milan Jovanović', 'Andrej Novak',
  'Kenji Takahashi', 'Min-jun Park', 'Emre Yıldız', 'Tarek Haddad', 'Yusuf Diallo',
  'Kwame Mensah', 'Samuel Okafor', 'Liam O\'Sullivan', 'Ewan MacGregor', 'Dylan Carter',
  'Rodrigo Álvarez', 'Facundo Morales', 'Thiago Cardoso', 'Mikkel Sørensen', 'Jasper Van Dijk',
  'László Németh', 'Dmytro Kovalenko', 'Ilya Smirnov', 'Georgios Papadakis', 'Zoran Đukić',
  'Aleksi Virtanen', 'Bram Janssens', 'Cédric Morvan', 'Amir Nasser', 'Ousmane Traoré',
  'Hugo Lemaître', 'Rafael Domínguez', 'Tomas Vaněk', 'Bogdan Ionescu', 'Erik Halvorsen',
];

/** PRNG déterministe — mêmes 50 arbitres à chaque chargement */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildReferee(id: number): Referee {
  const rng = mulberry32(1000 + id * 7919);
  const lerp = (lo: number, hi: number) => Math.round((lo + rng() * (hi - lo)) * 100) / 100;
  return {
    id,
    name: REFEREE_NAMES[id],
    foulStrictness: lerp(0.85, 1.25),
    cardStrictness: lerp(0.70, 1.50),
    redTendency: lerp(0.60, 1.80),
    penaltyTendency: lerp(0.70, 1.40),
    addedTimeBias: Math.round(lerp(-1, 2)),
  };
}

export const REFEREES: Referee[] = REFEREE_NAMES.map((_, i) => buildReferee(i));

/** Arbitre déterministe pour un match (même seed = même arbitre) */
export function pickReferee(seed: number): Referee {
  return REFEREES[Math.abs(seed) % REFEREES.length];
}

/**
 * Arbitres tous distincts pour une journée multiplex : mélange déterministe
 * (Fisher-Yates seedé) puis attribution dans l'ordre. count ≤ 50.
 */
export function pickDistinctReferees(count: number, seed: number): Referee[] {
  const rng = mulberry32(Math.abs(seed) || 1);
  const idx = REFEREES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(count, REFEREES.length)).map((i) => REFEREES[i]);
}

/** Description courte du tempérament, pour l'affichage */
export function refereeTemperament(ref: Referee): string {
  const strict = ref.foulStrictness + ref.cardStrictness;
  if (ref.cardStrictness >= 1.3 || ref.redTendency >= 1.5) return 'très sévère';
  if (strict >= 2.35) return 'strict';
  if (strict <= 1.75) return 'laxiste';
  return 'équilibré';
}
