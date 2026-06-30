import type { MatchRules } from '@/lib/sim/types';
import type { PressItem } from './press';
import type { Injury, Suspension } from './injuries';

export type CompetitionFormat = 'league' | 'cup' | 'groups_knockout' | 'lpm';
export type CompetitionStatus = 'setup' | 'ongoing' | 'completed';
export type CompMatchStatus = 'pending' | 'completed';

/** Statut officiel de la compétition (compte pour le palmarès) */
export type CompetitionKind = 'amicale' | 'officielle';
/** Portée géographique/institutionnelle */
export type CompetitionScope = 'internationale' | 'continentale' | 'regionale' | 'autre';
/** Importance de la compétition — influence le multiplicateur de points CMF */
export type CompetitionImportance =
  | 'mineur'       // ×0.4 — tournois amicaux mineurs, phases de test
  | 'regional'     // ×0.6 — compétitions régionales officielles
  | 'tournoi'      // ×0.8 — tournoi international standard entre sélections
  | 'prestige'     // ×1.1 — LPM ou compétition maison de premier plan
  | 'continental'  // ×1.4 — Euro, Copa América, CAN, etc.
  | 'mondial';     // ×2.0 — Coupe du Monde

export const COMPETITION_KIND_LABEL: Record<CompetitionKind, string> = {
  amicale: 'Amicale',
  officielle: 'Officielle',
};

export const COMPETITION_SCOPE_LABEL: Record<CompetitionScope, string> = {
  internationale: 'Internationale',
  continentale: 'Continentale',
  regionale: 'Régionale',
  autre: 'Autre',
};

export const COMPETITION_IMPORTANCE_LABEL: Record<CompetitionImportance, string> = {
  mineur: 'Mineur',
  regional: 'Régional',
  tournoi: 'Tournoi international',
  prestige: 'Prestige (LPM)',
  continental: 'Continental (Euro, CAN…)',
  mondial: 'Mondial (Coupe du Monde)',
};

export const IMPORTANCE_MULT: Record<CompetitionImportance, number> = {
  mineur: 0.4,
  regional: 0.6,
  tournoi: 0.8,
  prestige: 1.1,
  continental: 1.4,
  mondial: 2.0,
};

export type MatchStatSnapshot = {
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  xg?: { home: number; away: number };
  saves: { home: number; away: number };
  passes: { home: number; away: number };
  fouls: { home: number; away: number };
  corners: { home: number; away: number };
  offsides: { home: number; away: number };
  freekicks: { home: number; away: number };
  dribbles: { home: number; away: number };
  clearances: { home: number; away: number };
  keyPasses: { home: number; away: number };
  possession: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
};

export type GoalEvent = {
  minute: number;
  playerId: string;
  playerName: string;
  assistId?: string;
  assistName?: string;
};

export type CardEvent = {
  minute: number;
  playerId: string;
  playerName: string;
  type: 'yellow' | 'red';
};

export type MatchSummary = {
  motm?: {
    playerId: string;
    playerName: string;
    teamId: string;
    teamName: string;
    rating: number;
  };
  stats: MatchStatSnapshot;
  homeGoals?: GoalEvent[];
  awayGoals?: GoalEvent[];
  homeCards?: CardEvent[];
  awayCards?: CardEvent[];
};

export type CompMatch = {
  id: string;
  homeTeamId: string | null;   // null = TBD (winner not yet known)
  awayTeamId: string | null;
  homeFromMatch?: string;       // match id whose winner fills this slot
  awayFromMatch?: string;
  round: number;
  phase: string;                // 'group' | 'R32' | 'R16' | 'QF' | 'SF' | 'F' | '3rd' | 'league'
  groupId?: string;
  leg: 1 | 2 | 3;
  status: CompMatchStatus;
  result?: {
    home: number;
    away: number;
    penalties?: { home: number; away: number };
  };
  matchSummary?: MatchSummary;
  matchFileId?: string;
  simulatedAt?: string;
};

export type CompGroup = {
  id: string;
  name: string;
  teamIds: string[];
};

export type Standing = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type CompetitionConfig = {
  legsPerMatch: 1 | 2;
  thirdPlaceMatch: boolean;
  groupsCount?: number;
  qualifyPerGroup?: number;
  /** Number of best third-place teams to qualify for knockout (groups_knockout only) */
  bestThirds?: number;
  /** Used for league/cup, and as group-phase rules for groups_knockout */
  matchRules: MatchRules;
  /** Knockout-phase rules for groups_knockout (if absent, falls back to matchRules) */
  knockoutRules?: MatchRules;
};

export type PlayerCompStats = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  overall: number;
  position: string;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  matchRatings: number[];
  avgRating: number;
  motmCount: number;
};

export type CompetitionAwards = {
  topScorer: string | null;
  topAssister: string | null;
  bestGK: string | null;
  bestPlayer: string | null;
};

export type CompHistoryEntry = {
  compId: string;
  compName: string;
  year?: number;
  format: CompetitionFormat;
  kind?: CompetitionKind;
  scope?: CompetitionScope;
  importance?: CompetitionImportance;
  result: 'winner' | 'finalist' | 'third' | 'semi' | 'quarter' | 'round16' | 'round32' | 'round64' | 'participant';
  /** Phase reached (e.g. 'F', 'SF', 'QF', 'R16', 'group') */
  phase?: string;
  /** Number of teams in the competition (for size multiplier) */
  participantCount?: number;
  /** Final standing rank (e.g. 1 = winner, used for LPM league) */
  finishRank?: number;
  /** LPM zone bonus CMF points (added to palmarès total, not match history) */
  cmfZoneBonus?: number;
};

export type Competition = {
  id: string;
  name: string;
  format: CompetitionFormat;
  /** Edition year (e.g. 2024) */
  year?: number;
  /** Statut officiel (amicale vs officielle) */
  kind?: CompetitionKind;
  /** Portée géographique */
  scope?: CompetitionScope;
  /** Importance CMF — multiplicateur de points */
  importance?: CompetitionImportance;
  teamIds: string[];
  matches: CompMatch[];
  groups?: CompGroup[];
  standings: Record<string, Standing>;
  playerStats: Record<string, PlayerCompStats>;
  awards?: CompetitionAwards;
  config: CompetitionConfig;
  currentRound: number;
  status: CompetitionStatus;
  createdAt: string;
  winner?: string;
  disqualifiedTeamIds?: string[];
  /** Name + flag + slug snapshot so match pages can load rosters without fetching all teams. */
  teamSnapshot?: Record<string, { name: string; flag: string; slug?: string; globalStrength?: number }>;
  /** Morale per teamId — 1 to 100, starts at 50 */
  morale?: Record<string, number>;
  /** Press articles generated after each match */
  pressItems?: PressItem[];
  /** Active injuries across all teams */
  injuries?: Injury[];
  /** Active suspensions across all teams */
  suspensions?: Suspension[];
  /** LPM: host nation team ID — auto-qualified regardless of finish position */
  hostTeamId?: string;
  /** teamId → round at which presidency rebound press fires (after destitution event) */
  pendingPresidencyRebound?: Record<string, number>;
  /** teamId → round of their next match where 50% walkover risk applies (ref refusal reported) */
  pendingRefusalWalkover?: Record<string, number>;
  /** teamId → {round, matchId, walkoverApplied} for CMF judgment press after ref enquête */
  pendingCmfEnquete?: Record<string, { round: number; matchId?: string; walkoverApplied: boolean }>;
  /** matchId → round at which drame hommage press fires */
  pendingDrameHommage?: Record<string, number>;
  /** LPM: true once the schedule draw ceremony has been completed */
  drawRevealed?: boolean;
  /** True once the CMF debut articles have been generated (before round 1) */
  cmfDebutGenerated?: boolean;
  /** Manually assigned 3rd place teamId (when no 3rd-place match was played) */
  manualThird?: string;
};

export type CompetitionSummary = {
  id: string;
  name: string;
  format: CompetitionFormat;
  status: CompetitionStatus;
  teamCount: number;
  createdAt: string;
  winner?: string;
  year?: number;
  teamIds?: string[];
  kind?: CompetitionKind;
  scope?: CompetitionScope;
  importance?: CompetitionImportance;
};

/** Pick the right MatchRules for a given match phase. */
export function rulesForPhase(config: CompetitionConfig, phase: string): MatchRules {
  const isKnockout = phase !== 'group' && phase !== 'league';
  return (isKnockout && config.knockoutRules) ? config.knockoutRules : config.matchRules;
}

export const FORMAT_LABEL: Record<CompetitionFormat, string> = {
  league: 'Championnat (Ligue)',
  cup: 'Coupe (Élimination directe)',
  groups_knockout: 'Groupes + Phase finale',
  lpm: 'Ligue Préliminaire Mondiale (LPM)',
};

export const FORMAT_DESCRIPTION: Record<CompetitionFormat, string> = {
  league: 'Toutes les équipes se rencontrent. Classement par points.',
  cup: 'Tirage au sort, élimination directe à chaque tour.',
  groups_knockout: 'Phase de groupes puis tableau final à élimination directe.',
  lpm: '48 équipes · 11 journées · top 24 qualifiés directement · places 25–40 en barrages A/R.',
};
