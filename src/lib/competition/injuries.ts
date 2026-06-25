import type { Player } from '@/lib/types';

export type InjurySeverity = 'légère' | 'modérée' | 'grave';
export type InjuryCause = 'match' | 'altercation' | 'suspension';

export type Injury = {
  id: string;
  playerId: string;
  playerName: string;
  teamId: string;
  cause: InjuryCause;
  severity: InjurySeverity;
  /** Matches remaining before player is available again */
  matchesRemaining: number;
  description: string;
  roundOccurred: number;
};

export type Suspension = {
  id: string;
  /** playerId OR 'coach' */
  subjectId: string;
  subjectName: string;
  teamId: string;
  matchesRemaining: number;
  reason: string;
  roundOccurred: number;
};

const INJURY_DESCRIPTIONS: Record<InjurySeverity, string[]> = {
  légère: [
    'Contracture musculaire à la cuisse — repos de courte durée.',
    'Choc au genou sans gravité — indisponible le temps de récupérer.',
    'Douleur au mollet — joue avec la douleur mais préférence au repos.',
    'Cheville tordue légèrement — réévaluation avant le prochain match.',
  ],
  modérée: [
    'Déchirure musculaire partielle — indisponible plusieurs semaines.',
    'Entorse du genou — immobilisation et rééducation nécessaires.',
    'Fracture de fatigue détectée — mise au repos forcée.',
    'Contusion sévère à la hanche — soins intensifs en cours.',
  ],
  grave: [
    'Rupture des ligaments croisés — saison potentiellement compromise.',
    'Fracture de la cheville — opération chirurgicale probable.',
    'Déchirure totale des ischio-jambiers — longue convalescence.',
    'Traumatisme crânien léger — protocole commotion déclenché, indisponibilité prolongée.',
  ],
};

const ALTERCATION_INJURY_DESCRIPTIONS = [
  'Blessé lors d\'une altercation en coulisses — côtes fissurées.',
  'Victime d\'une agression après le match — soins à l\'infirmerie.',
  'Impliqué dans une bagarre — traumatisme facial, indisponible.',
  'Blessure à la main lors d\'un incident dans le vestiaire.',
];

function severityFromDuration(matches: number): InjurySeverity {
  if (matches <= 1) return 'légère';
  if (matches <= 3) return 'modérée';
  return 'grave';
}

function pickArr<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

/** Roll a match injury for a random non-GK player from the on-pitch list. ~8% per match per team. */
export function rollMatchInjury(
  teamId: string,
  onPitch: string[],
  players: Map<string, Player>,
  round: number,
): Injury | null {
  if (Math.random() > 0.08) return null;
  const nonGK = onPitch.map((id) => players.get(id)).filter((p): p is Player => !!p && p.position !== 'GK');
  if (!nonGK.length) return null;
  const victim = pickArr(nonGK);
  return createMatchInjury(teamId, victim, round);
}

/** Create a match injury for a specific known player (engine already picked the victim). */
export function createMatchInjury(
  teamId: string,
  player: Player,
  round: number,
): Injury {
  const r = Math.random();
  const matches = r < 0.55 ? 1 : r < 0.85 ? 2 + Math.floor(Math.random() * 2) : 4 + Math.floor(Math.random() * 3);
  const severity = severityFromDuration(matches);
  return {
    id: crypto.randomUUID(),
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    teamId,
    cause: 'match',
    severity,
    matchesRemaining: matches,
    description: pickArr(INJURY_DESCRIPTIONS[severity]),
    roundOccurred: round,
  };
}

/** Create an altercation injury (from scandal/physical clash). 1-3 matches. */
export function createAltercationInjury(
  teamId: string,
  playerId: string,
  playerName: string,
  round: number,
): Injury {
  const matches = 1 + Math.floor(Math.random() * 3);
  return {
    id: crypto.randomUUID(),
    playerId,
    playerName,
    teamId,
    cause: 'altercation',
    severity: severityFromDuration(matches),
    matchesRemaining: matches,
    description: pickArr(ALTERCATION_INJURY_DESCRIPTIONS),
    roundOccurred: round,
  };
}

/** Create a suspension (player or coach). */
export function createSuspension(
  teamId: string,
  subjectId: string,
  subjectName: string,
  matches: number,
  reason: string,
  round: number,
): Suspension {
  return {
    id: crypto.randomUUID(),
    subjectId,
    subjectName,
    teamId,
    matchesRemaining: matches,
    reason,
    roundOccurred: round,
  };
}

/** Decrement all injuries/suspensions by 1 match. Returns updated arrays without zero-remaining entries. */
export function decrementInjuries(injuries: Injury[]): Injury[] {
  return injuries
    .map((i) => ({ ...i, matchesRemaining: i.matchesRemaining - 1 }))
    .filter((i) => i.matchesRemaining > 0);
}

export function decrementSuspensions(suspensions: Suspension[], playingTeamIds?: string[]): Suspension[] {
  return suspensions
    .map((s) => {
      if (playingTeamIds && !playingTeamIds.includes(s.teamId)) return s;
      return { ...s, matchesRemaining: s.matchesRemaining - 1 };
    })
    .filter((s) => s.matchesRemaining > 0);
}

/** IDs of players (+ 'coach') that are unavailable for a given team. */
export function unavailableIds(
  teamId: string,
  injuries: Injury[],
  suspensions: Suspension[],
): Set<string> {
  const ids = new Set<string>();
  for (const inj of injuries) {
    if (inj.teamId === teamId) ids.add(inj.playerId);
  }
  for (const sus of suspensions) {
    if (sus.teamId === teamId) ids.add(sus.subjectId);
  }
  return ids;
}

export const SEVERITY_COLOR: Record<InjurySeverity, string> = {
  légère: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  modérée: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  grave: 'text-danger bg-danger/10 border-danger/20',
};

export const CAUSE_LABEL: Record<InjuryCause, string> = {
  match: 'En match',
  altercation: 'Altercation',
  suspension: 'Suspension',
};
