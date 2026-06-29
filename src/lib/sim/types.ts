import type { Formation, Player, TacticStyle, Team } from '@/lib/types';

export type Speed = 'instant' | '0.5' | '1' | '2' | '5';

export type EventKind =
  | 'kickoff' | 'goal' | 'shot' | 'shotOnTarget' | 'save' | 'foul'
  | 'yellow' | 'red' | 'corner' | 'offside' | 'halftime' | 'fulltime' | 'keyPass'
  | 'penalty' | 'penalty_miss' | 'penalty_saved' | 'freeKick' | 'header' | 'dribble' | 'clearance' | 'crossbar'
  | 'substitution' | 'extraTime' | 'coachRed' | 'injury';

export type TacticMods = {
  shotFreqMult: number;
  foulRateMult: number;
  midfieldMult: number;
  attackMult: number;
  defenseMult: number;
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

export type PlannedSubEntry = {
  outId: string;
  inId: string;
  minute?: number;
  done: boolean;
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
  plannedSubs: PlannedSubEntry[];
};

export type MatchEvent = {
  id: number;
  minute: number;
  half: 1 | 2;
  type: EventKind;
  side: 'home' | 'away' | null;
  playerId?: string;
  assistId?: string;
  /** For substitution events: the player who came off */
  replacedId?: string;
  text: string;
  ballPos?: { x: number; y: number };
};

export type CorruptionDeal = {
  /** Which side paid the bribe. 'both' when both teams bribed the ref. */
  side: 'home' | 'away' | 'both';
  /** Amount in millions (total if both sides) */
  bribe: number;
  /** Referee accepted the offer */
  accepted: boolean;
  /** Referee actually honors it in-game (can renege).
   *  When side='both': ref plays normally (cancels out). When side=one: biases against opp. */
  honored: boolean;
  /** Referee refused the approach before the match and reported it to CMF.
   *  Match still plays normally, but next match of bribing team has 50% walkover risk. */
  refusedByRef?: boolean;
};

export type MatchInput = {
  matchId: string;
  home: { team: Team; players: Player[]; formation: Formation; formationLabel?: string; lineup?: string[]; bench?: string[]; plannedSubs?: import('@/lib/types').PlannedSub[]; tacticStyle?: TacticStyle; customTacticStyle?: import('@/lib/types').CustomTacticStyle; morale?: number; unavailablePlayerIds?: string[]; positionMap?: Record<string, import('@/lib/types').Position>; tokenPositions?: Record<string, { x: number; y: number }>; hasTactic?: boolean };
  away: { team: Team; players: Player[]; formation: Formation; formationLabel?: string; lineup?: string[]; bench?: string[]; plannedSubs?: import('@/lib/types').PlannedSub[]; tacticStyle?: TacticStyle; customTacticStyle?: import('@/lib/types').CustomTacticStyle; morale?: number; unavailablePlayerIds?: string[]; positionMap?: Record<string, import('@/lib/types').Position>; tokenPositions?: Record<string, { x: number; y: number }>; hasTactic?: boolean };
  speed: Speed;
  rules: MatchRules;
  corruption?: CorruptionDeal;
  /** For two-legged ties: leg 1 score so ET is only triggered on aggregate draw */
  leg1Score?: { home: number; away: number };
  /** coaches are taken from team.coach — passed explicitly here for worker use */
  /** If true, result is saved and counts toward recentMatches / CMF rankings */
  countForStats?: boolean;
};

export type MatchState = {
  matchId: string;
  status: 'pregame' | 'firstHalf' | 'halftime' | 'secondHalf'
    | 'extraTimeFirst' | 'extraTimeHalfTime' | 'extraTimeSecond'
    | 'penalties' | 'fulltime';
  corruption?: CorruptionDeal;
  minute: number;
  half: 1 | 2;
  addedTime: number;
  homeAddedTime: number;
  awayAddedTime: number;
  score: { home: number; away: number };
  events: MatchEvent[];
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  xg: { home: number; away: number };
  saves: { home: number; away: number };
  passes: { home: number; away: number };
  fouls: { home: number; away: number };
  corners: { home: number; away: number };
  offsides: { home: number; away: number };
  freekicks: { home: number; away: number };
  dribbles: { home: number; away: number };
  clearances: { home: number; away: number };
  keyPasses: { home: number; away: number };
  cards: {
    home: { yellow: string[]; red: string[] };
    away: { yellow: string[]; red: string[] };
  };
  possession: { home: number; away: number };
  possessionTicks: { home: number; away: number };
  /** Per-player event counts for rating computation */
  playerKeyPasses: Record<string, number>;
  playerSaves: Record<string, number>;
  playerDribbles: Record<string, number>;
  playerClearances: Record<string, number>;
  ball: { x: number; y: number };
  speed: Speed;
  homeOnPitch: string[];
  awayOnPitch: string[];
  /** Initial bench IDs (set at kick-off, used for press/doping pool) */
  homeBench: string[];
  awayBench: string[];
  /** Current available bench (shrinks as players enter the pitch) */
  homeAvailableBench: string[];
  awayAvailableBench: string[];
  rules: MatchRules;
  homeSubs: number;
  awaySubs: number;
  penaltyScore?: { home: number; away: number };
  /** coach ejected this match — suspended for next match */
  coachEjected?: { home: boolean; away: boolean };
  /** Players injured during this match: side → playerId[] */
  matchInjuries?: { home: string[]; away: string[] };
  /** For two-legged ties: leg 1 score so ET fires on aggregate draw, not match draw */
  leg1Score?: { home: number; away: number };
};
