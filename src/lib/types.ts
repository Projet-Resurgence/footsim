export type Culture =
  | 'francais' | 'anglais' | 'allemand' | 'italien' | 'espagnol' | 'portugais'
  | 'grec' | 'hongrois' | 'tcheque' | 'polonais' | 'russe' | 'ukrainien'
  | 'suedois' | 'neerlandais' | 'roumain' | 'serbe' | 'croate' | 'turc'
  | 'arabe' | 'japonais' | 'coreen';

export const CULTURES: Culture[] = [
  'francais','anglais','allemand','italien','espagnol','portugais',
  'grec','hongrois','tcheque','polonais','russe','ukrainien',
  'suedois','neerlandais','roumain','serbe','croate','turc',
  'arabe','japonais','coreen',
];

export const CULTURE_LABEL: Record<Culture, string> = {
  francais: 'Français', anglais: 'Anglais', allemand: 'Allemand', italien: 'Italien',
  espagnol: 'Espagnol', portugais: 'Portugais', grec: 'Grec', hongrois: 'Hongrois',
  tcheque: 'Tchèque', polonais: 'Polonais', russe: 'Russe', ukrainien: 'Ukrainien',
  suedois: 'Suédois', neerlandais: 'Néerlandais', roumain: 'Roumain', serbe: 'Serbe',
  croate: 'Croate', turc: 'Turc',
  arabe: 'Arabe', japonais: 'Japonais', coreen: 'Coréen',
};

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';

export const POSITIONS: Position[] = ['GK','CB','LB','RB','DM','CM','AM','LM','RM','LW','RW','ST'];

export type Formation = '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1' | '5-3-2' | '4-1-4-1' | '3-4-3' | '4-3-2-1';

export type TacticStyle = 'possession' | 'contre-attaque' | 'direct' | 'pressing';

export const TACTIC_STYLE_LABEL: Record<TacticStyle, string> = {
  possession: 'Possession',
  'contre-attaque': 'Contre-attaque',
  direct: 'Jeu direct',
  pressing: 'Pressing haut',
};

export type TechnicalStats = {
  passing: number; crossing: number; dribbling: number; finishing: number;
  firstTouch: number; heading: number; longShots: number;
  tackling: number; marking: number;
};
export type MentalStats = {
  vision: number; decisions: number; composure: number; anticipation: number;
  offTheBall: number; aggression: number; workRate: number;
};
export type PhysicalStats = {
  pace: number; acceleration: number; strength: number; stamina: number;
  agility: number; balance: number; jumping: number;
};
export type GoalkeepingStats = {
  reflexes: number; handling: number; aerial: number;
  oneOnOne: number; kicking: number; throwing: number;
};

export type PlayerStats = {
  technical: TechnicalStats;
  mental: MentalStats;
  physical: PhysicalStats;
  goalkeeping: GoalkeepingStats | null;
};

export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  position: Position;
  altPositions: Position[];
  preferredFoot: 'left' | 'right' | 'both';
  stats: PlayerStats;
  overall: number;
};

export type TeamTactics = {
  style: TacticStyle;
  formation: Formation;
  lineup: string[];
};

export type Team = {
  id: string;
  slug: string;
  name: string;
  flag: string;
  culture: Culture;
  globalStrength: number;
  createdAt: string;
  createdBy: string;
  playerCount: number;
  formation: Formation;
  tactics?: TeamTactics;
};
