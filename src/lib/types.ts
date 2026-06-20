export type Culture =
  | 'francais' | 'anglais' | 'allemand' | 'italien' | 'espagnol' | 'portugais'
  | 'grec' | 'hongrois' | 'tcheque' | 'polonais' | 'russe' | 'ukrainien'
  | 'suedois' | 'neerlandais' | 'roumain' | 'serbe' | 'croate' | 'turc'
  | 'arabe' | 'japonais' | 'coreen'
  | 'chinois' | 'vietnamien' | 'thai' | 'indonesien' | 'persan' | 'indien' | 'israelien'
  | 'bresilien' | 'argentin' | 'mexicain' | 'anglo-americain' | 'quebecois'
  | 'maghrebin' | 'egyptien' | 'levantin' | 'golfe' | 'soudanais'
  | 'cambodgien' | 'birman' | 'philippin' | 'malaisien'
  | 'nigerian' | 'ethiopien' | 'tanzanien' | 'somalien'
  | 'senegalais' | 'ivoirien' | 'ghaneen' | 'malien' | 'burkinabe' | 'guineens'
  | 'congolais' | 'camerounais' | 'angolais'
  | 'kenyan' | 'ugandais' | 'rwandais'
  | 'zoulou' | 'mozambicain' | 'zimbabween'
  | 'kazakh' | 'ouzbek' | 'kirghiz' | 'tadjik' | 'turkmene' | 'azeri'
  | 'ouighour' | 'mongol' | 'siberien'
  | 'amerindien' | 'peruvien' | 'chilien'
  | 'australien' | 'neo-zelandais' | 'caledonien';

export const CULTURES: Culture[] = [
  'francais','anglais','allemand','italien','espagnol','portugais',
  'grec','hongrois','tcheque','polonais','russe','ukrainien',
  'suedois','neerlandais','roumain','serbe','croate','turc',
  'arabe','japonais','coreen',
  'chinois','vietnamien','thai','indonesien','persan','indien','israelien',
  'bresilien','argentin','mexicain','anglo-americain','quebecois',
  'maghrebin','egyptien','levantin','golfe','soudanais',
  'cambodgien','birman','philippin','malaisien',
  'nigerian','ethiopien','tanzanien','somalien',
  'senegalais','ivoirien','ghaneen','malien','burkinabe','guineens',
  'congolais','camerounais','angolais',
  'kenyan','ugandais','rwandais',
  'zoulou','mozambicain','zimbabween',
  'kazakh','ouzbek','kirghiz','tadjik','turkmene','azeri',
  'ouighour','mongol','siberien',
  'amerindien','peruvien','chilien',
  'australien','neo-zelandais','caledonien',
];

export const CULTURE_LABEL: Record<Culture, string> = {
  francais: 'Français', anglais: 'Anglais', allemand: 'Allemand', italien: 'Italien',
  espagnol: 'Espagnol', portugais: 'Portugais', grec: 'Grec', hongrois: 'Hongrois',
  tcheque: 'Tchèque', polonais: 'Polonais', russe: 'Russe', ukrainien: 'Ukrainien',
  suedois: 'Suédois', neerlandais: 'Néerlandais', roumain: 'Roumain', serbe: 'Serbe',
  croate: 'Croate', turc: 'Turc',
  arabe: 'Arabe (générique)', japonais: 'Japonais', coreen: 'Coréen',
  chinois: 'Chinois', vietnamien: 'Vietnamien', thai: 'Thaï', indonesien: 'Indonésien',
  persan: 'Persan', indien: 'Indien', israelien: 'Israélien',
  bresilien: 'Brésilien', argentin: 'Argentin', mexicain: 'Mexicain',
  'anglo-americain': 'Anglo-Américain', quebecois: 'Québécois',
  maghrebin: 'Maghrébin', egyptien: 'Égyptien', levantin: 'Levantin',
  golfe: 'Golfe Persique', soudanais: 'Soudanais',
  cambodgien: 'Cambodgien', birman: 'Birman', philippin: 'Philippin', malaisien: 'Malaisien',
  nigerian: 'Nigérian', ethiopien: 'Éthiopien', tanzanien: 'Tanzanien', somalien: 'Somalien',
  senegalais: 'Sénégalais', ivoirien: 'Ivoirien', ghaneen: 'Ghanéen', malien: 'Malien',
  burkinabe: 'Burkinabé', guineens: 'Guinéen',
  congolais: 'Congolais', camerounais: 'Camerounais', angolais: 'Angolais',
  kenyan: 'Kenyan', ugandais: 'Ougandais', rwandais: 'Rwandais',
  zoulou: 'Zoulou / Sud-Africain', mozambicain: 'Mozambicain', zimbabween: 'Zimbabwéen',
  kazakh: 'Kazakh', ouzbek: 'Ouzbek', kirghiz: 'Kirghiz', tadjik: 'Tadjik',
  turkmene: 'Turkmène', azeri: 'Azéri',
  ouighour: 'Ouïghour', mongol: 'Mongol', siberien: 'Sibérien',
  amerindien: 'Amérindien', peruvien: 'Péruvien', chilien: 'Chilien',
  australien: 'Australien', 'neo-zelandais': 'Néo-Zélandais', caledonien: 'Calédonien',
};

export type Continent = 'europe' | 'asie' | 'asiecentrale' | 'amerique' | 'moyenorient' | 'afrique' | 'afriquenord' | 'oceanie';

export const CONTINENT_LABEL: Record<Continent, string> = {
  europe: 'Europe',
  asie: 'Asie',
  asiecentrale: 'Asie centrale & Caucase',
  amerique: 'Amérique',
  moyenorient: 'Moyen-Orient',
  afrique: 'Afrique subsaharienne',
  afriquenord: 'Afrique du Nord',
  oceanie: 'Océanie',
};

export const CULTURE_CONTINENT: Record<Culture, Continent> = {
  francais: 'europe', anglais: 'europe', allemand: 'europe', italien: 'europe',
  espagnol: 'europe', portugais: 'europe', grec: 'europe', hongrois: 'europe',
  tcheque: 'europe', polonais: 'europe', russe: 'europe', ukrainien: 'europe',
  suedois: 'europe', neerlandais: 'europe', roumain: 'europe', serbe: 'europe',
  croate: 'europe', turc: 'europe',
  japonais: 'asie', coreen: 'asie', chinois: 'asie', vietnamien: 'asie',
  thai: 'asie', indonesien: 'asie', indien: 'asie', cambodgien: 'asie',
  birman: 'asie', philippin: 'asie', malaisien: 'asie',
  ouighour: 'asie', mongol: 'asie', siberien: 'asie',
  kazakh: 'asiecentrale', ouzbek: 'asiecentrale', kirghiz: 'asiecentrale',
  tadjik: 'asiecentrale', turkmene: 'asiecentrale', azeri: 'asiecentrale',
  arabe: 'moyenorient', persan: 'moyenorient', israelien: 'moyenorient',
  levantin: 'moyenorient', golfe: 'moyenorient',
  maghrebin: 'afriquenord', egyptien: 'afriquenord', soudanais: 'afriquenord',
  nigerian: 'afrique', ethiopien: 'afrique', tanzanien: 'afrique', somalien: 'afrique',
  senegalais: 'afrique', ivoirien: 'afrique', ghaneen: 'afrique', malien: 'afrique',
  burkinabe: 'afrique', guineens: 'afrique',
  congolais: 'afrique', camerounais: 'afrique', angolais: 'afrique',
  kenyan: 'afrique', ugandais: 'afrique', rwandais: 'afrique',
  zoulou: 'afrique', mozambicain: 'afrique', zimbabween: 'afrique',
  bresilien: 'amerique', argentin: 'amerique', mexicain: 'amerique',
  'anglo-americain': 'amerique', quebecois: 'amerique',
  amerindien: 'amerique', peruvien: 'amerique', chilien: 'amerique',
  australien: 'oceanie', 'neo-zelandais': 'oceanie', caledonien: 'oceanie',
};

export const CULTURES_BY_CONTINENT: Record<Continent, Culture[]> = {
  europe: ['francais','anglais','allemand','italien','espagnol','portugais','grec','hongrois','tcheque','polonais','russe','ukrainien','suedois','neerlandais','roumain','serbe','croate','turc'],
  asie: ['japonais','coreen','chinois','vietnamien','thai','indonesien','indien','cambodgien','birman','philippin','malaisien','ouighour','mongol','siberien'],
  asiecentrale: ['kazakh','ouzbek','kirghiz','tadjik','turkmene','azeri'],
  moyenorient: ['arabe','levantin','golfe','persan','israelien'],
  afriquenord: ['maghrebin','egyptien','soudanais'],
  afrique: [
    'nigerian','ghaneen','ivoirien','senegalais','malien','burkinabe','guineens',
    'camerounais','congolais','angolais',
    'kenyan','ugandais','rwandais','ethiopien','tanzanien','somalien',
    'zoulou','mozambicain','zimbabween',
  ],
  amerique: ['bresilien','argentin','mexicain','anglo-americain','quebecois','amerindien','peruvien','chilien'],
  oceanie: ['australien','neo-zelandais','caledonien'],
};

export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LM' | 'RM' | 'LW' | 'RW' | 'ST';

export const POSITIONS: Position[] = ['GK','CB','LB','RB','DM','CM','AM','LM','RM','LW','RW','ST'];

export const POSITION_LABEL: Record<Position, string> = {
  GK: 'GB', CB: 'DC', LB: 'DG', RB: 'DD',
  DM: 'MDF', CM: 'MC', AM: 'MO', LM: 'MG', RM: 'MD',
  LW: 'AG', RW: 'AD', ST: 'BU',
};

export const POSITION_FULL: Record<Position, string> = {
  GK: 'Gardien de but',
  CB: 'Défenseur central',
  LB: 'Défenseur gauche',
  RB: 'Défenseur droit',
  DM: 'Milieu défensif',
  CM: 'Milieu central',
  AM: 'Milieu offensif',
  LM: 'Milieu gauche',
  RM: 'Milieu droit',
  LW: 'Ailier gauche',
  RW: 'Ailier droit',
  ST: 'Buteur',
};

export type Formation =
  | '4-3-3' | '4-4-2' | '3-5-2' | '4-2-3-1' | '5-3-2' | '4-1-4-1' | '3-4-3' | '4-3-2-1'
  | '4-5-1' | '4-4-1-1' | '3-4-1-2' | '5-4-1' | '3-6-1';

export type TacticStyle =
  | 'possession' | 'contre-attaque' | 'direct' | 'pressing'
  | 'ultra-defensif' | 'gegenpressing' | 'tiki-taka' | 'long-ball' | 'chaos';

export const TACTIC_STYLE_LABEL: Record<TacticStyle, string> = {
  possession: 'Possession',
  'contre-attaque': 'Contre-attaque',
  direct: 'Jeu direct',
  pressing: 'Pressing haut',
  'ultra-defensif': 'Ultra-défensif',
  gegenpressing: 'Gegenpressing',
  'tiki-taka': 'Tiki-taka',
  'long-ball': 'Long ball',
  chaos: 'Chaos',
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
  /** set when player is assigned to a league club */
  clubId?: string;
};

export type TeamTactics = {
  style: TacticStyle;
  formation: Formation;
  lineup: string[];
};

export type TeamKind = 'national' | 'club';

export type Team = {
  id: string;
  slug: string;
  name: string;
  flag: string;
  /** legacy single culture — kept for backward compat */
  culture: Culture;
  /** multi-culture mix; if present, used for name generation instead of culture */
  cultures?: import('@/lib/gen/names').CultureWeight[];
  /** @deprecated use continents */
  continent?: Continent;
  /** up to 2 continents this team belongs to */
  continents?: Continent[];
  kind?: TeamKind;
  /** if kind === 'club', the parent national team slug */
  leagueId?: string;
  globalStrength: number;
  createdAt: string;
  createdBy: string;
  ownerId: string;
  playerCount: number;
  formation: Formation;
  tactics?: TeamTactics;
  /** set when team has been successfully pushed to GitHub */
  publishedAt?: string;
};

export type LeagueClub = {
  id: string;
  slug: string;
  name: string;
  /** data URL PNG 500×500 */
  logo: string;
  culture: Culture;
  cultures?: import('@/lib/gen/names').CultureWeight[];
  globalStrength: number;
  formation: Formation;
  tactics?: TeamTactics;
  /** IDs of the 30 players from the national roster assigned to this club */
  playerIds: string[];
};

export type Division = {
  id: string;
  name: string;
  clubs: LeagueClub[];
};

export type MatchSlot = {
  id: string;
  homeClubId: string;
  awayClubId: string;
  played: boolean;
};

export type StandingsRow = {
  clubId: string;
  pts: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
};

export type MatchResult = {
  homeGoals: number;
  awayGoals: number;
};

export type DivisionSeason = {
  divisionId: string;
  /** journées: each array is one match day */
  schedule: MatchSlot[][];
  results: Record<string, MatchResult>;
  table: StandingsRow[];
};

export type SeasonState = {
  status: 'scheduled' | 'running' | 'cancelled' | 'finished';
  /** ISO date — planned start */
  startDate?: string;
  currentDay: number;
  divisionSeasons: DivisionSeason[];
};

export type League = {
  id: string;
  /** slug of the parent national team */
  nationSlug: string;
  name: string;
  divisions: Division[];
  season?: SeasonState;
  createdAt: string;
  createdBy: string;
  ownerId: string;
};
