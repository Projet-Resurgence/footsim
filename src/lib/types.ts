export type Culture =
  | 'francais' | 'anglais' | 'allemand' | 'italien' | 'espagnol' | 'portugais'
  | 'grec' | 'hongrois' | 'tcheque' | 'polonais' | 'russe' | 'ukrainien'
  | 'suedois' | 'norvegien' | 'danois' | 'finlandais' | 'islandais' | 'groenlandais' | 'inuit'
  | 'neerlandais' | 'belge' | 'luxembourgeois' | 'autrichien' | 'roumain' | 'serbe' | 'croate' | 'turc'
  | 'estonien' | 'letton' | 'lituanien'
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
  | 'cubain' | 'colombien' | 'venezuelien' | 'uruguayen' | 'bolivien' | 'paraguayen'
  | 'haitien' | 'jamaicain' | 'trinidadien'
  | 'australien' | 'neo-zelandais' | 'caledonien';

export const CULTURES: Culture[] = [
  'francais','anglais','allemand','italien','espagnol','portugais',
  'grec','hongrois','tcheque','polonais','russe','ukrainien',
  'suedois','norvegien','danois','finlandais','islandais','groenlandais','inuit',
  'neerlandais','belge','luxembourgeois','autrichien','roumain','serbe','croate','turc',
  'estonien','letton','lituanien',
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
  'cubain','colombien','venezuelien','uruguayen','bolivien','paraguayen',
  'haitien','jamaicain','trinidadien',
  'australien','neo-zelandais','caledonien',
];

export const CULTURE_LABEL: Record<Culture, string> = {
  francais: 'Français', anglais: 'Anglais', allemand: 'Allemand', italien: 'Italien',
  espagnol: 'Espagnol', portugais: 'Portugais', grec: 'Grec', hongrois: 'Hongrois',
  tcheque: 'Tchèque', polonais: 'Polonais', russe: 'Russe', ukrainien: 'Ukrainien',
  suedois: 'Suédois', norvegien: 'Norvégien', danois: 'Danois', finlandais: 'Finlandais',
  islandais: 'Islandais', groenlandais: 'Groenlandais', inuit: 'Inuit',
  neerlandais: 'Néerlandais', belge: 'Belge', luxembourgeois: 'Luxembourgeois', autrichien: 'Autrichien', roumain: 'Roumain', serbe: 'Serbe',
  croate: 'Croate', turc: 'Turc',
  estonien: 'Estonien', letton: 'Letton', lituanien: 'Lituanien',
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
  cubain: 'Cubain', colombien: 'Colombien', venezuelien: 'Vénézuélien',
  uruguayen: 'Uruguayen', bolivien: 'Bolivien', paraguayen: 'Paraguayen',
  haitien: 'Haïtien', jamaicain: 'Jamaïcain', trinidadien: 'Trinidadien',
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
  suedois: 'europe', norvegien: 'europe', danois: 'europe', finlandais: 'europe',
  islandais: 'europe', groenlandais: 'europe', inuit: 'europe',
  neerlandais: 'europe', belge: 'europe', luxembourgeois: 'europe', autrichien: 'europe', roumain: 'europe', serbe: 'europe',
  croate: 'europe', turc: 'europe',
  estonien: 'europe', letton: 'europe', lituanien: 'europe',
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
  cubain: 'amerique', colombien: 'amerique', venezuelien: 'amerique',
  uruguayen: 'amerique', bolivien: 'amerique', paraguayen: 'amerique',
  haitien: 'amerique', jamaicain: 'amerique', trinidadien: 'amerique',
  australien: 'oceanie', 'neo-zelandais': 'oceanie', caledonien: 'oceanie',
};

export const CULTURES_BY_CONTINENT: Record<Continent, Culture[]> = {
  europe: ['francais','anglais','allemand','italien','espagnol','portugais','grec','hongrois','tcheque','polonais','russe','ukrainien','suedois','norvegien','danois','finlandais','islandais','groenlandais','inuit','neerlandais','belge','luxembourgeois','autrichien','roumain','serbe','croate','turc','estonien','letton','lituanien'],
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
  amerique: ['bresilien','argentin','mexicain','anglo-americain','quebecois','amerindien','peruvien','chilien','cubain','colombien','venezuelien','uruguayen','bolivien','paraguayen','haitien','jamaicain','trinidadien'],
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
  | '4-5-1' | '4-4-1-1' | '3-4-1-2' | '5-4-1' | '3-6-1'
  | '4-1-2-1-2' | '3-4-2-1' | '4-2-2-2' | '4-2-4';

export type TacticStyle =
  | 'possession' | 'contre-attaque' | 'direct' | 'pressing'
  | 'ultra-defensif' | 'gegenpressing' | 'tiki-taka' | 'long-ball' | 'chaos'
  | 'ailes' | 'bloc-median' | 'football-total';

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
  ailes: 'Jeu sur les ailes',
  'bloc-median': 'Bloc médian',
  'football-total': 'Football total',
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

/** Nom compact « J.Torres » (initiale du prénom + nom) pour tokens de terrain. */
export function shortPlayerName(p: { firstName?: string; lastName?: string }): string {
  const first = (p.firstName ?? '').trim();
  const last = (p.lastName ?? '').trim();
  const initial = first ? `${first[0].toUpperCase()}.` : '';
  return last ? `${initial}${last}` : initial || '';
}

export type CustomTacticStyle = {
  id: string;
  name: string;
  mods: import('@/lib/sim/types').TacticMods;
};

export type PlannedSub = {
  outId: string;
  inId: string;
  /** minute at which sub is triggered (halftime transition if undefined) */
  minute?: number;
};

/** Déclencheur d'un plan B conditionnel */
export type PlanBTrigger = 'losing' | 'winning' | 'drawing' | 'redCard';

export const PLAN_B_TRIGGER_LABEL: Record<PlanBTrigger, string> = {
  losing: 'Si mené au score',
  winning: 'Si mène au score',
  drawing: 'Si match nul',
  redCard: 'Si carton rouge reçu',
};

/** Plan B conditionnel : bascule automatique de tactique/style en cours de match */
export type PlanBRule = {
  id: string;
  trigger: PlanBTrigger;
  /** minute à partir de laquelle la règle peut se déclencher */
  fromMinute: number;
  /** style appliqué au déclenchement (legacy / fallback quand aucune autre tactique n'existe) */
  style?: TacticStyle;
  /** tactique sauvegardée appliquée au déclenchement (son style/mods) — prioritaire sur style */
  tacticId?: string;
  /** nom de la tactique ciblée — affichage sans lookup */
  tacticName?: string;
  /** condition adversaire : restreint (only) ou annule (except) la règle contre cette équipe */
  vsMode?: 'only' | 'except';
  vsTeamId?: string;
  vsTeamName?: string;
};

/** Tireurs désignés pour les coups de pied arrêtés (player ids) */
export type SetPieceTakers = {
  penalty?: string;
  freeKick?: string;
  corner?: string;
};

export type TeamTactics = {
  style: TacticStyle;
  formation: Formation;
  lineup: string[];
  /** custom bench order — up to 12 player IDs, overrides auto sort */
  bench?: string[];
  /** planned substitutions: applied by engine at halftime or specified minute */
  plannedSubs?: PlannedSub[];
  /** display label when formation was set via free editor (e.g. "5-2-3") */
  formationLabel?: string;
  /** position overrides from free editor: playerId → assigned Position */
  positionMap?: Record<string, Position>;
  /** raw x/y coords (0-100%) from free editor: playerId → {x, y} */
  tokenPositions?: Record<string, { x: number; y: number }>;
  /** user-created custom styles */
  customStyles?: CustomTacticStyle[];
  /** id of active custom style; if set, overrides style */
  activeCustomStyleId?: string;
  /** plans B conditionnels (max 3) — bascule de style automatique en match */
  planB?: PlanBRule[];
  /** tireurs désignés pour penalties / coups francs / corners */
  setPieceTakers?: SetPieceTakers;
  /** capitaine — discipline et résilience quand il est sur le terrain */
  captainId?: string;
};

/** A named saved tactic — superset of TeamTactics */
export type SavedTactic = TeamTactics & {
  id: string;
  name: string;
  /** équipes ciblées : la tactique est chargée automatiquement contre chacune (prioritaire sur la tactique active) */
  vsTeams?: { id: string; name: string }[];
  /** contre-tactiques : cette tactique s'active si l'adversaire joue la tactique désignée (prioritaire sur vsTeams) */
  counterTactics?: { teamId: string; teamName: string; tacticId: string; tacticName: string }[];
  /** @deprecated ancien ciblage mono-équipe — lu en fallback, écrit nulle part */
  vsTeamId?: string;
  /** @deprecated voir vsTeams */
  vsTeamName?: string;
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
  /** Discord ID of the manager allowed to edit tactics for this team */
  managerDiscordId?: string;
  /** Head coach — generated at team creation, editable */
  coach?: import('@/lib/gen/coach').Coach;
  /** Coach suspended for next match (received red card in previous match) */
  coachSuspended?: boolean;
  /** All saved tactics (named slots) */
  savedTactics?: SavedTactic[];
  /** ID of the active saved tactic */
  activeTacticId?: string;
  /** Custom tactic styles shared across all tactics for this team */
  customStyles?: CustomTacticStyle[];
  /** Primary jersey color as CSS hex (e.g. "#e63c3c") */
  jerseyColor?: string;
  /** Away jersey color as CSS hex — worn when both primary kits clash */
  jerseyAwayColor?: string;
  /** Action sur le Foot: funding (M€, capped 250) → strength bonus 0–5 */
  actionFoot?: { rating: number; funding: number };
  /** Competition history — populated when a competition is saved to GitHub */
  compHistory?: import('@/lib/competition/types').CompHistoryEntry[];
  /** Last N match results — appended by saveMatch */
  recentMatches?: import('@/lib/github/matches').RecentMatchSummary[];
  /** Active injuries carried over from previous competition */
  injuries?: import('@/lib/competition/injuries').Injury[];
  /** Active suspensions carried over from previous competition */
  suspensions?: import('@/lib/competition/injuries').Suspension[];
  /** Force match outcome for this team: win/loss/draw regardless of simulation */
  matchOutcome?: 'win' | 'loss' | 'draw' | null;
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
