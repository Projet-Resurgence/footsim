import type { Formation, Player, TacticStyle, Team } from '@/lib/types';

export type Speed = 'instant' | '0.5' | '1' | '2' | '5';

export type EventKind =
  | 'kickoff' | 'goal' | 'shot' | 'shotOnTarget' | 'save' | 'foul'
  | 'yellow' | 'red' | 'corner' | 'offside' | 'halftime' | 'fulltime' | 'keyPass'
  | 'penalty' | 'freeKick' | 'header' | 'dribble' | 'clearance' | 'crossbar';

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

export type TacticMods = {
  shotFreqMult: number;
  foulRateMult: number;
  midfieldMult: number;
  attackMult: number;
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

export type MatchInput = {
  matchId: string;
  home: { team: Team; players: Player[]; formation: Formation; lineup?: string[]; tacticStyle?: TacticStyle };
  away: { team: Team; players: Player[]; formation: Formation; lineup?: string[]; tacticStyle?: TacticStyle };
  speed: Speed;
};

export type MatchState = {
  matchId: string;
  status: 'pregame' | 'firstHalf' | 'halftime' | 'secondHalf' | 'fulltime';
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
};
