import type { EventKind } from './types';

export const ZONE: Record<string, { x: number; y: number }> = {
  centre: { x: 50, y: 25 },
  homeAttack: { x: 80, y: 25 },
  awayAttack: { x: 20, y: 25 },
  homeBox: { x: 88, y: 25 },
  awayBox: { x: 12, y: 25 },
  homeLeftCorner: { x: 100, y: 0 },
  homeRightCorner: { x: 100, y: 50 },
  awayLeftCorner: { x: 0, y: 0 },
  awayRightCorner: { x: 0, y: 50 },
  midfieldHome: { x: 60, y: 25 },
  midfieldAway: { x: 40, y: 25 },
};

export function eventText(
  type: EventKind,
  minute: number,
  team: string,
  playerName?: string,
): string {
  switch (type) {
    case 'kickoff':
      return `${minute}' — Coup d'envoi.`;
    case 'goal':
      return `⚽ ${minute}' — But pour ${team} ! ${playerName ?? ''} marque.`.trim();
    case 'shot':
      return `${minute}' — Tir non cadré de ${playerName ?? team}.`;
    case 'shotOnTarget':
      return `${minute}' — Frappe cadrée de ${playerName ?? team}.`;
    case 'save':
      return `🧤 ${minute}' — Belle parade de ${playerName ?? 'le gardien'}.`;
    case 'foul':
      return `${minute}' — Faute de ${playerName ?? team}.`;
    case 'yellow':
      return `🟨 ${minute}' — Carton jaune pour ${playerName ?? team} (${team}).`;
    case 'red':
      return `🟥 ${minute}' — ${playerName ?? team} expulsé ! ${team} à 10.`;
    case 'corner':
      return `${minute}' — Corner pour ${team}.`;
    case 'offside':
      return `${minute}' — Hors-jeu signalé contre ${team}.`;
    case 'keyPass':
      return `${minute}' — Passe décisive de ${playerName ?? team}.`;
    case 'penalty':
      return `🔴 ${minute}' — Penalty pour ${team} ! ${playerName ?? ''} s'élance.`.trim();
    case 'freeKick':
      return `${minute}' — Coup franc dangereux pour ${team}${playerName ? ` (${playerName})` : ''}.`;
    case 'header':
      return `${minute}' — Coup de tête de ${playerName ?? team}${playerName ? '' : ''}.`;
    case 'dribble':
      return `${minute}' — Dribble réussi de ${playerName ?? team} !`;
    case 'clearance':
      return `${minute}' — Dégagement in extremis de ${playerName ?? team}.`;
    case 'crossbar':
      return `⛔ ${minute}' — ${playerName ?? team} touche le poteau !`;
    case 'halftime':
      return `Mi-temps.`;
    case 'fulltime':
      return `Fin du match.`;
  }
}
