import type { MatchRules } from '@/lib/sim/types';
import type { PressItem } from './press';
import type { Injury, Suspension } from './injuries';

export type CompetitionFormat = 'league' | 'cup' | 'groups_knockout' | 'lpm';
export type CompetitionStatus = 'setup' | 'ongoing' | 'completed';
export type CompMatchStatus = 'pending' | 'completed';

export type CompMatch = {
  id: string;
  homeTeamId: string | null;   // null = TBD (winner not yet known)
  awayTeamId: string | null;
  homeFromMatch?: string;       // match id whose winner fills this slot
  awayFromMatch?: string;
  round: number;
  phase: string;                // 'group' | 'R32' | 'R16' | 'QF' | 'SF' | 'F' | '3rd' | 'league'
  groupId?: string;
  leg: 1 | 2;
  status: CompMatchStatus;
  result?: {
    home: number;
    away: number;
    penalties?: { home: number; away: number };
  };
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
  goals: number;
  assists: number;
  cleanSheets: number;
  yellowCards: number;
  redCards: number;
  matchRatings: number[];
  avgRating: number;
};

export type CompetitionAwards = {
  topScorer: string | null;
  topAssister: string | null;
  bestGK: string | null;
  bestPlayer: string | null;
};

export type Competition = {
  id: string;
  name: string;
  format: CompetitionFormat;
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
  /** Name + flag snapshot so non-admin viewers can display team info without GitHub PAT. */
  teamSnapshot?: Record<string, { name: string; flag: string }>;
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
};

export type CompetitionSummary = {
  id: string;
  name: string;
  format: CompetitionFormat;
  status: CompetitionStatus;
  teamCount: number;
  createdAt: string;
  winner?: string;
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
