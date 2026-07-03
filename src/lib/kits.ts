/**
 * Résolution des couleurs de maillot pour un match : l'équipe à domicile joue
 * en couleur principale ; si les deux couleurs principales sont trop proches
 * (rouge vs rouge foncé…), l'extérieur passe en maillot extérieur — le sien
 * s'il est défini, sinon une couleur de repli contrastante.
 */

const DEFAULT_HOME = '#F4F0E6';
const DEFAULT_AWAY = '#C73E3E';
const FALLBACK_AWAY_KITS = ['#F4F0E6', '#2E6FD8', '#F2C230', '#111111'];

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Distance perceptuelle approximative (pondération rec. 601) */
export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Infinity;
  const dr = ra[0] - rb[0], dg = ra[1] - rb[1], db = ra[2] - rb[2];
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
}

const CLASH_THRESHOLD = 55;

export type ResolvedKits = {
  home: string;
  away: string;
  /** true si l'extérieur a dû changer de maillot (couleurs trop proches) */
  awayUsedAlternate: boolean;
};

export function resolveKits(
  homeTeam: { jerseyColor?: string } | undefined,
  awayTeam: { jerseyColor?: string; jerseyAwayColor?: string } | undefined,
): ResolvedKits {
  const home = homeTeam?.jerseyColor ?? DEFAULT_HOME;
  const awayPrimary = awayTeam?.jerseyColor ?? DEFAULT_AWAY;
  if (colorDistance(home, awayPrimary) >= CLASH_THRESHOLD) {
    return { home, away: awayPrimary, awayUsedAlternate: false };
  }
  // Conflit : maillot extérieur défini, sinon premier repli suffisamment éloigné des deux
  const alt = awayTeam?.jerseyAwayColor;
  if (alt && colorDistance(home, alt) >= CLASH_THRESHOLD) {
    return { home, away: alt, awayUsedAlternate: true };
  }
  const fallback = FALLBACK_AWAY_KITS.find(
    (c) => colorDistance(home, c) >= CLASH_THRESHOLD && colorDistance(awayPrimary, c) >= 25,
  ) ?? '#2E6FD8';
  return { home, away: fallback, awayUsedAlternate: true };
}
