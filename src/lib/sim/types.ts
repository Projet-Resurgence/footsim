import type { Formation, Player, TacticStyle, Team } from '@/lib/types';

export type Speed = 'instant' | '0.5' | '1' | '2' | '5';

export type EventKind =
  | 'kickoff' | 'goal' | 'shot' | 'shotOnTarget' | 'save' | 'foul'
  | 'yellow' | 'red' | 'corner' | 'offside' | 'halftime' | 'fulltime' | 'keyPass'
  | 'penalty' | 'freeKick' | 'header' | 'dribble' | 'clearance' | 'crossbar'
  | 'substitution' | 'extraTime';

export type TacticMods = {
  shotFreqMult: number;
  foulRateMult: number;
  midfieldMult: number;
  attackMult: number;
};

export type MatchRules = {
  noOffside: boolean;
  maxSubs: 3 | 5;
  goldenGoal: boolean;
  extraTime: boolean;
  penalties: boolean;
};

export const DEFAULT_RULES: MatchRules = {
  noOffside: false,
  maxSubs: 5,
  goldenGoal: false,
  extraTime: false,
  penalties: false,
};

export type SideRatings = {
  attack: number;
  midfield: number;
  defense: number;
  gk: number;
  formation: Formation;
  lineup: string[];
  bench: string[];
  yellow: Set<string>;
  red: Set<string>;
  tacticMods: TacticMods;
};

export type MatchEvent = {
  id: number;
  minute: number;
  half: 1 | 2;
  type: EventKind;
  side: 'home' | 'away' | null;
  playerId?: string;
  text: string;
  ballPos?: { x: number; y: number };
};

export type MatchInput = {
  matchId: string;
  home: { team: Team; players: Player[]; formation: Formation; lineup?: string[]; tacticStyle?: TacticStyle };
  away: { team: Team; players: Player[]; formation: Formation; lineup?: string[]; tacticStyle?: TacticStyle };
  speed: Speed;
  rules: MatchRules;
};

export type MatchState = {
  matchId: string;
  status: 'pregame' | 'firstHalf' | 'halftime' | 'secondHalf'
    | 'extraTimeFirst' | 'extraTimeHalfTime' | 'extraTimeSecond'
    | 'penalties' | 'fulltime';
  minute: number;
  half: 1 | 2;
  addedTime: number;
  homeAddedTime: number;
  awayAddedTime: number;
  score: { home: number; away: number };
  events: MatchEvent[];
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  fouls: { home: number; away: number };
  cards: {
    home: { yellow: string[]; red: string[] };
    away: { yellow: string[]; red: string[] };
  };
  possession: { home: number; away: number };
  possessionTicks: { home: number; away: number };
  ball: { x: number; y: number };
  speed: Speed;
  homeOnPitch: string[];
  awayOnPitch: string[];
  rules: MatchRules;
  homeSubs: number;
  awaySubs: number;
  penaltyScore?: { home: number; away: number };
};
