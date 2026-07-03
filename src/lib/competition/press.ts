/** Press / media system — generates narrative articles after match events. */

import type { Suspension } from './injuries';
import { createSuspension } from './injuries';
import type { Standing } from './types';
import type { Player } from '@/lib/types';
import type { Coach } from '@/lib/gen/coach';
import type { MatchState } from '@/lib/sim/types';
import type { Referee } from '@/lib/sim/referees';
import { refereeTemperament } from '@/lib/sim/referees';

export type PressCategory = 'victoire' | 'defaite' | 'scandale' | 'forme' | 'crise' | 'neutralite' | 'exploit' | 'critique' | 'revolte' | 'drame' | 'cmf' | 'arbitrage';

export type PressMentionPlayer = {
  type: 'player';
  name: string;
  overall: number;
  position: string;
  stats: {
    technical: Record<string, number>;
    mental: Record<string, number>;
    physical: Record<string, number>;
    goalkeeping?: Record<string, number>;
  };
};

export type PressMentionCoach = {
  type: 'coach';
  name: string;
  overall: number;
  stats: {
    motivation: number;
    tactique: number;
    offensive: number;
    defensif: number;
    mentalite: number;
    gestion: number;
  };
  positiveTraits: string[];
  negativeTraits: string[];
};

export type PressMentionReferee = {
  type: 'referee';
  name: string;
  /** 'très sévère' | 'strict' | 'équilibré' | 'laxiste' */
  temperament: string;
  foulStrictness: number;
  cardStrictness: number;
  redTendency: number;
  penaltyTendency: number;
  addedTimeBias: number;
};

export type PressMention = PressMentionPlayer | PressMentionCoach | PressMentionReferee;

export type PressItem = {
  id: string;
  round: number;
  teamId: string | null;   // null = neutral (about the competition)
  category: PressCategory;
  headline: string;
  body: string;
  moraleBefore?: number;
  moraleAfter?: number;
  /** Extra morale penalty applied by hostile press — negative int, e.g. -15 */
  moraleShock?: number;
  /** Extra morale boost from positive press — positive int, e.g. +8 */
  moraleBoost?: number;
  /** If true, the president was destituted — caller should schedule rebound press next round */
  presidentDestitue?: boolean;
  createdAt: string;
  /** Named persons mentioned in headline/body — used for clickable pop-ups */
  mentions?: PressMention[];
  /** Journalist name + affiliation (critique articles) */
  journalist?: { name: string; outlet: string };
  /** Reference to the match that triggered this press item */
  matchId?: string;
  /** Score snapshot for the match card */
  matchSnapshot?: {
    homeTeamId: string;
    awayTeamId: string;
    homeTeamName: string;
    awayTeamName: string;
    homeScore: number;
    awayScore: number;
    stats?: {
      shots: { home: number; away: number };
      possession: { home: number; away: number };
      shotsOnTarget: { home: number; away: number };
      corners: { home: number; away: number };
      fouls: { home: number; away: number };
      yellowCards: { home: number; away: number };
      redCards: { home: number; away: number };
    };
    motm?: {
      playerName: string;
      teamId: string;
      teamName: string;
      rating: number;
    };
    /** Arbitre du match — profil complet pour pop-up cliquable */
    referee?: PressMentionReferee;
    /** Météo du match — libellé FR (ex. « Pluie · 12°C ») */
    weather?: string;
    /** Affluence au stade */
    attendance?: number;
    /** Buteurs du match dans l'ordre chronologique */
    scorers?: { name: string; teamId: string; minute: number; penalty?: boolean }[];
    /** Séance de tirs au but (élimination directe / barrages) */
    penalties?: { home: number; away: number };
  };
  /** Additional match snapshots for forme articles (up to 2 extra link cards) */
  extraMatchSnapshots?: NonNullable<PressItem['matchSnapshot']>[];
  /** CMF article data — favorite teams + top player predictions */
  cmfSnapshot?: {
    phase: string;
    moment: 'debut' | 'fin' | 'palmares';
    favoriteTeams: { teamId: string; teamName: string; overall: number; cote?: number }[];
    topScorer?: { playerName: string; teamId: string; teamName: string; goals: number; overall: number };
    topAssister?: { playerName: string; teamId: string; teamName: string; assists: number; overall: number };
    bestPlayer?: { playerName: string; teamId: string; teamName: string; avgRating: number; overall: number };
    bestGK?: { playerName: string; teamId: string; teamName: string; cleanSheets: number; overall: number };
    winner?: { teamId: string; teamName: string };
    /**
     * For lpm_playoff debut articles — pronostics barrages.
     * Chaque barragiste reçoit son PROPRE % de qualification (P ∝ force²) ;
     * les deux % d'une paire somment à 100. Remplace l'ancienne cote unique par paire.
     */
    playoffPairs?: {
      homeTeamId: string; homeTeamName: string;
      awayTeamId: string; awayTeamName: string;
      favoriteTeamId: string; favoriteTeamName: string;
      underdogTeamId: string; underdogTeamName: string;
      /** Probabilité de qualification (0-100, entier) — home + away = 100 */
      homeQualifyPct: number;
      awayQualifyPct: number;
    }[];
  };
};

function rng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(31, h) + seed.charCodeAt(i) | 0; }
  return () => {
    h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff;
  };
}

function pick<T>(arr: T[], r: () => number): T { return arr[Math.floor(r() * arr.length)]; }

// ── Faits de match — extraits du MatchState pour des articles cohérents ──────

const WEATHER_PRESS_LABEL: Record<string, string> = {
  clair: 'Ciel dégagé',
  couvert: 'Ciel couvert',
  pluie: 'Pluie',
  orage: 'Orage',
  neige: 'Neige',
  vent: 'Vent fort',
  brouillard: 'Brouillard',
  canicule: 'Canicule',
};

export type MatchFacts = {
  /** Buteurs dans l'ordre chronologique */
  scorers: { playerId?: string; name: string; teamId: string; minute: number; penalty?: boolean }[];
  redCards: { home: { name: string; minute: number }[]; away: { name: string; minute: number }[] };
  yellowCount: { home: number; away: number };
  referee?: PressMentionReferee;
  weatherKind?: string;
  weatherLabel?: string;
  attendance: number;
  /** Camp qui a gagné/égalisé après avoir été mené de 2+ buts */
  comeback?: 'home' | 'away';
  /** But décisif (écart final de 1) inscrit à la 85e ou après */
  lateWinner?: { name: string; minute: number; teamId: string };
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  /** Séance de tirs au but (matchs à élimination directe) */
  penaltyScore?: { home: number; away: number };
};

/**
 * Construit les faits marquants d'un match depuis le MatchState final —
 * source unique pour que la presse raconte ce qui s'est réellement passé.
 */
export function buildMatchFacts(
  state: MatchState,
  home: { teamId: string; players: Player[] },
  away: { teamId: string; players: Player[] },
  seed: string,
): MatchFacts {
  const nameOf = (side: 'home' | 'away', pid?: string) => {
    const p = (side === 'home' ? home.players : away.players).find((pl) => pl.id === pid);
    return p ? `${p.firstName} ${p.lastName}` : 'un joueur';
  };
  const teamIdOf = (side: 'home' | 'away') => (side === 'home' ? home.teamId : away.teamId);

  const goalEvents = state.events.filter((e) => e.type === 'goal' && e.side);
  const scorers: MatchFacts['scorers'] = goalEvents.map((e) => {
    const side = e.side as 'home' | 'away';
    // penalty transformé : un événement 'penalty' du même camp à la même minute précède le but
    const penalty = state.events.some((pe) => pe.type === 'penalty' && pe.side === e.side && pe.minute === e.minute && pe.id < e.id);
    return { playerId: e.playerId, name: nameOf(side, e.playerId), teamId: teamIdOf(side), minute: e.minute, penalty: penalty || undefined };
  });

  // Remontada : mené de 2+ puis victoire ou nul
  let h = 0, a = 0, maxDeficitHome = 0, maxDeficitAway = 0;
  for (const e of goalEvents) {
    if (e.side === 'home') h++; else a++;
    maxDeficitHome = Math.max(maxDeficitHome, a - h);
    maxDeficitAway = Math.max(maxDeficitAway, h - a);
  }
  const final = state.score;
  let comeback: MatchFacts['comeback'];
  if (maxDeficitHome >= 2 && final.home >= final.away) comeback = 'home';
  else if (maxDeficitAway >= 2 && final.away >= final.home) comeback = 'away';

  // But décisif tardif : écart final de 1, dernier but du vainqueur à 85' ou après
  let lateWinner: MatchFacts['lateWinner'];
  if (Math.abs(final.home - final.away) === 1 && goalEvents.length > 0) {
    const winnerSide: 'home' | 'away' = final.home > final.away ? 'home' : 'away';
    const last = goalEvents[goalEvents.length - 1];
    if (last.side === winnerSide && last.minute >= 85) {
      lateWinner = { name: nameOf(winnerSide, last.playerId), minute: last.minute, teamId: teamIdOf(winnerSide) };
    }
  }

  const redOf = (side: 'home' | 'away') =>
    state.events
      .filter((e) => e.type === 'red' && e.side === side && e.playerId)
      .map((e) => ({ name: nameOf(side, e.playerId), minute: e.minute }));

  // Affluence déterministe : 12 000 à 80 000, arrondie à la centaine
  const ar = rng(seed + 'attendance');
  const attendance = Math.round((12000 + ar() * 68000) / 100) * 100;

  const ref = state.referee;
  return {
    scorers,
    redCards: { home: redOf('home'), away: redOf('away') },
    yellowCount: { home: state.cards.home.yellow.length, away: state.cards.away.yellow.length },
    referee: ref ? refereeToMention(ref) : undefined,
    weatherKind: state.weather?.kind,
    weatherLabel: state.weather ? `${WEATHER_PRESS_LABEL[state.weather.kind] ?? state.weather.kind} · ${state.weather.tempC}°C` : undefined,
    attendance,
    comeback,
    lateWinner,
    possession: state.possession,
    shots: state.shots,
    penaltyScore: state.penaltyScore,
  };
}

export function refereeToMention(ref: Referee): PressMentionReferee {
  return {
    type: 'referee',
    name: ref.name,
    temperament: refereeTemperament(ref),
    foulStrictness: ref.foulStrictness,
    cardStrictness: ref.cardStrictness,
    redTendency: ref.redTendency,
    penaltyTendency: ref.penaltyTendency,
    addedTimeBias: ref.addedTimeBias,
  };
}

/** Cotes bookmaker pré-match : P ∝ force², cote = 1/P (min 1.01) */
export function computeMatchCotes(homeStrength: number, awayStrength: number): { home: number; away: number } {
  const hs = Math.max(1, homeStrength);
  const as = Math.max(1, awayStrength);
  const total = hs * hs + as * as;
  const coteOf = (s: number) => Math.max(1.01, Math.round((total / (s * s)) * 100) / 100);
  return { home: coteOf(hs), away: coteOf(as) };
}

// ── Template banks ──────────────────────────────────────────────────────────

const WIN_HEADLINES = [
  '{team} écrase ses adversaires et prend confiance',
  'Victoire éclatante de {team} — le moral au beau fixe',
  '{team} impressionne et monte en puissance',
  '{team} confirme ses ambitions avec une belle victoire',
  'Nette victoire de {team} : la dynamique est là',
  '"On a fait le boulot" — la sérénité règne chez {team}',
  '{team} gagne et ne s\'emballe pas — mais l\'élan est là',
  '{team} s\'impose avec maîtrise — un succès qui fait du bien',
  'Victoire méritée pour {team} qui ne lâche rien',
  '{team} prend les trois points et envoie un signal fort',
  'Le collectif {team} fait la différence — victoire solide',
  'Succès précieux pour {team} dans cette compétition serrée',
  '"On savait ce qu\'on avait à faire" — {team} l\'a fait',
  '{team} dans le bon sens — les résultats suivent enfin',
  'Victoire logique de {team} : domination totale ce soir',
];
const WIN_BODIES = [
  'Après ce succès convaincant, les joueurs de {team} affichent une confiance retrouvée. Le vestiaire est soudé.',
  'La victoire fait du bien. L\'ambiance dans le groupe {team} est au plus haut, et ça se voit à l\'entraînement.',
  '{team} enchaîne les bonnes prestations. Les supporters commencent à y croire vraiment.',
  'En conférence de presse, le sélectionneur de {team} a tempéré les ardeurs : "On reste humble. Chaque match sera une guerre." Mais le sourire en coin en disait long.',
  '"Je suis fier de mes joueurs" — le discours d\'après-match du coach de {team} était court, mais les yeux de ses hommes brillaient.',
  'Trois points de plus au compteur. {team} avance sans se retourner et le message est clair : ce groupe est sérieux.',
  'L\'efficacité de {team} ce soir a épaté les observateurs. Peu de déchet, beaucoup d\'intensité. Un schéma qui porte ses fruits.',
  'Après la rencontre, le capitaine de {team} a réuni ses hommes au centre du terrain. Quelques mots, une accolade. Le groupe est là.',
  'Les statistiques donnent tort aux sceptiques. {team} a maîtrisé son sujet de bout en bout. Difficile de leur trouver des défauts ce soir.',
  '{team} marque des points, au sens propre comme au figuré. La cohérence collective commence à payer.',
  'Ce n\'est pas la manière qui a séduit, mais l\'efficacité clinique de {team}. Un groupe qui sait gagner laid, c\'est signe de maturité.',
  '"Victoire bonifiée ou pas, on s\'en fiche — les points comptent", a tranché le sélectionneur de {team} avec un sourire de satisfaction.',
  'Pas de fioritures, pas de blabla : {team} a pris ses trois points et est rentré à la maison. Le genre de soirée dont on ne fait pas un film mais qui construit une saison.',
  'On attendait {team} au tournant. Réponse claire : victoire, propreté défensive, et un message envoyé sans un mot. Le vestiaire respire.',
  'Le sélectionneur de {team} a savouré en silence. "On a fait le job. Point." Rien à ajouter — le tableau d\'affichage parlait pour lui.',
  'Match sérieux, victoire méritée. {team} n\'a rien lâché, rien offert, rien gaspillé. C\'est comme ça qu\'on avance dans une compétition qui ne pardonne rien.',
];

const BIG_WIN_HEADLINES = [
  'EXPLOIT : {team} humilie son adversaire et fait trembler la compétition',
  '{team} en état de grâce — une démonstration de force absolue',
  'Carton plein pour {team} : personne ne les arrête en ce moment',
  '{team} distribue les buts comme des bonbons — la compétition tremble',
  'FESTIVAL : {team} régale et écœure ses adversaires',
  '{team} en fusion — un récital qui restera dans les mémoires',
  'DÉMOLITION : {team} ne fait pas de prisonnier ce soir',
  'Les adversaires tremblent : {team} est en feu',
  '{team} marque les esprits — une victoire qui fait date',
  'Insolent de facilité : {team} écrase tout sur son passage',
];
const BIG_WIN_BODIES = [
  'Score flatteur ou reflet de la réalité ? Pour {team}, peu importe — la confiance est au maximum.',
  'En conférence de presse, le capitaine de {team} n\'a pas mâché ses mots : "On voulait marquer les esprits. C\'est fait." Les adversaires ont été avertis.',
  'La rencontre s\'est transformée en leçon de football. {team} a montré que cette compétition a un favori, et qu\'il ne se cache plus.',
  'Le sélectionneur de {team} avait des larmes aux yeux au coup de sifflet final. "Je n\'ai jamais vu mon groupe aussi fort mentalement", a-t-il confié.',
  'Les adversaires de {team} peuvent se remercier : ils ont assisté ce soir à une leçon de football collectif. Perfection d\'exécution, débordements constants, efficacité clinique.',
  'Des vestiaires aux tribunes, l\'euphorie est totale chez {team}. "On a tout réussi ce soir. Tout", soufflait un joueur du groupe, encore incrédule.',
  'La presse étrangère parle déjà de ce résultat. {team} entre dans une autre dimension. Les adversaires sont prévenus : il faudra être parfaits pour les stopper.',
  'Rarement une équipe aura semblé aussi supérieure dans cette compétition. {team} a transformé ce match en démonstration. Le vestiaire chantait encore une heure après le coup de sifflet final.',
  '"Ce groupe est exceptionnel", a soufflé le préparateur physique de {team} en quittant le stade. Ce soir, difficile de le contredire.',
  'L\'adversaire a passé la soirée à courir après un ballon qu\'il n\'a jamais vu. {team} a joué avec, s\'est amusé, a plié le match — et a laissé une équipe entière sur le carreau. Brutal et magnifique.',
  'Il y a des soirs où le foot ressemble à une punition pour l\'un et à une fête pour l\'autre. {team} était du bon côté, et n\'a montré aucune pitié. Les concurrents ont pris note, et pris peur.',
  'Ça n\'était plus un match, c\'était une cour de récré à sens unique. {team} a humilié, sans forcer, avec le sourire. Le genre de démonstration qui installe une équipe dans la tête des autres pour longtemps.',
];
const MANITA_HEADLINES = [
  'MANITA : {team} signe la performance de la saison',
  'GOLEADA : {team} signe un résultat historique dans cette compétition',
  '{score} : {team} entre dans une autre dimension — la compétition est prévenue',
  'MASSACRE : {team} inflige une correction historique',
];
const MANITA_BODIES = [
  'Une manita. Un résultat qui résonne dans toute la compétition. {team} envoie un message fort à ses concurrents.',
  'Ce score n\'est pas un accident. {team} a construit cette goleada pied à pied, avec méthode. Une domination totale, dans tous les compartiments du jeu.',
  'Cinq buts. Cinq. L\'adversaire n\'a pas existé. {team} a joué à son propre niveau ce soir — et son niveau est bien au-dessus du reste.',
  'Le tableau d\'affichage ne ment pas. {team} a humilié un adversaire entier en 90 minutes. Ce genre de résultat ne s\'oublie pas.',
  '{score}. On relit, on n\'y croit toujours pas. {team} n\'a pas battu son adversaire, il l\'a effacé de la carte. Une leçon d\'arrogance footballistique assumée, et méritée.',
  'Il n\'y avait rien à défendre en face, alors {team} s\'est servi. Encore. Et encore. Cinq fois. L\'adversaire est reparti sans dignité, {team} avec un statut de croque-mort de la compétition.',
];

// ── Narrations factuelles — déclenchées par les faits réels du match ─────────

/** Victoire/nul après avoir été mené de 2+ buts */
const REMONTADA_PAIRS: [string, string][] = [
  [
    'REMONTADA : {team} renverse un match perdu — irrespirable !',
    'Mené de deux buts, {team} aurait pu couler. Il a fait l\'inverse. But après but, l\'équipe a refait son retard puis fait basculer la rencontre ({score}). Un scénario qu\'on ne voit qu\'une poignée de fois par saison — et qui en dit long sur le mental de ce groupe.',
  ],
  [
    '{team} revient de nulle part — le scénario fou de la soirée',
    'À un moment du match, tout semblait plié. Deux buts de retard, un adversaire en confiance. Et puis {team} a décidé que non. La remontée s\'est construite dans l\'intensité, portée par un public médusé. Score final : {score}. Personne n\'a quitté le stade avant le coup de sifflet.',
  ],
  [
    'MENÉ 2-0, {team} S\'EN SORT — un caractère en acier trempé',
    'Les statistiques disent qu\'on ne revient presque jamais de deux buts de retard. {team} n\'a pas lu les statistiques. La réaction a été immédiate, violente, collective. Ce genre de soirée soude un vestiaire pour une compétition entière.',
  ],
];

/** L'équipe menait de 2+ et a laissé filer (défaite ou nul) */
const CHOKE_PAIRS: [string, string][] = [
  [
    '{team} craque : mener de deux buts et tout gâcher',
    'C\'est le genre de scénario qui hante les vestiaires. {team} menait de deux buts et contrôlait le match. Puis tout s\'est délité — le pressing adverse, les jambes lourdes, la panique. Score final : {score}. Il faudra des réponses, pas des excuses.',
  ],
  [
    'Effondrement de {team} — un avantage de deux buts jeté aux orties',
    'Comment perd-on un match qu\'on tenait à deux mains ? Demandez à {team}, qui a réussi ce soir l\'anti-exploit de la journée. L\'avance a fondu, les certitudes avec. Le staff parlera de "accident". Les supporters, eux, parlent déjà de honte.',
  ],
];

/** Victoire d'un gros outsider (cote élevée) */
const UPSET_PAIRS: [string, string][] = [
  [
    'SURPRISE : {team} déjoue tous les pronostics (cote {cote}) !',
    'Les bookmakers donnaient {team} à {cote} contre un. Autant dire : aucune chance. Sauf que le football se joue sur un terrain, pas dans les agences de paris. Victoire {score}, pronostiqueurs ridiculisés, et une équipe qui vient de rappeler à tout le monde pourquoi on aime ce sport.',
  ],
  [
    '{team} fait tomber le favori — les parieurs n\'en reviennent pas',
    'Personne ne l\'avait vu venir. Coté à {cote}, {team} partait avec l\'étiquette de victime consentante. L\'équipe a joué sans complexe, avec un plan clair et une discipline de fer. Résultat : {score}, et une hiérarchie qui vacille.',
  ],
  [
    'EXPLOIT au tableau d\'affichage : {team} renverse la logique',
    'La cote était de {cote}. L\'écart de niveau, réel. Mais {team} a produit le match parfait au moment parfait — et le score ({score}) est là pour l\'éternité. Les favoris sont prévenus : cette équipe ne respecte personne.',
  ],
];

/** But décisif à la 85e ou après ({player}, {minute}) */
const LATE_WINNER_PAIRS: [string, string][] = [
  [
    '{player} délivre {team} à la {minute}e — le stade explose',
    'Le match filait vers un partage des points quand {player} a surgi à la {minute}e minute. Un but qui vaut trois points, arraché dans les tout derniers instants. Sur le banc de {team}, tout le monde a bondi. Ces victoires-là comptent double dans les têtes.',
  ],
  [
    'Coup de théâtre : {team} gagne dans les dernières minutes',
    'Il restait une poignée de secondes à jouer quand {player} a fait basculer la rencontre ({minute}e). Cruauté absolue pour l\'adversaire, délivrance totale pour {team}. Le football tient parfois à un dernier ballon — ce soir, il est tombé du bon côté.',
  ],
  [
    '{minute}e minute : {player} crucifie l\'adversaire — {team} l\'emporte au buzzer',
    'On jouait les arrêts de jeu de la fin de match. {player} n\'a pas tremblé. Ce but tardif offre à {team} une victoire au scénario cruel mais parfaitement légale — c\'est même la définition du sport de haut niveau : tenir jusqu\'à la dernière seconde.',
  ],
];

// Suffixes factuels — ajoutés au corps de l'article selon les faits réels
const FACT_BRACE_SUFFIX = [
  `Auteur d'un doublé, {player} a porté son équipe sur les épaules ce soir.`,
  `Deux buts pour {player} — l'homme en forme du moment ne s'arrête plus.`,
  `{player} a frappé deux fois. Quand un joueur prend feu comme ça, difficile de l'éteindre.`,
];
const FACT_HATTRICK_SUFFIX = [
  `TRIPLÉ de {player} ! Le ballon du match est déjà dans son sac — et son nom dans les mémoires.`,
  `{player} repart avec le ballon : trois buts, une démonstration individuelle rarissime à ce niveau.`,
];
const FACT_RED_LOSS_SUFFIX = [
  `Le tournant ? L'expulsion de {player} à la {minute}e, qui a laissé les siens à dix dans un match encore ouvert.`,
  `Réduits à dix après le rouge de {player} ({minute}e), les coéquipiers n'ont jamais retrouvé leur équilibre.`,
];
const FACT_RED_WIN_SUFFIX = [
  `Et le plus fort : cette victoire a été décrochée à dix, après l'expulsion de {player} à la {minute}e. Chapeau bas.`,
  `Même le rouge de {player} ({minute}e) n'a pas fait dérailler la machine. À dix, l'équipe a serré les rangs et tenu bon.`,
];
const FACT_CLEAN_SHEET_SUFFIX = [
  `Et derrière, rien n'est passé : clean sheet, défense de fer, gardien serein.`,
  `Zéro but encaissé — la solidité défensive affichée ce soir est une base sur laquelle on construit des titres.`,
];
const FACT_STERILE_SUFFIX = [
  `Le paradoxe fait mal : {possession}% de possession, {shots} tirs — et rien au bout. Dominer n'est pas gagner.`,
  `Les chiffres accablent : {possession}% du ballon, {shots} tentatives. Le football ne récompense pas la domination, il récompense les buts.`,
];
const FACT_HOLDUP_SUFFIX = [
  `Soyons honnêtes : avec {possession}% de possession et moins de tirs que l'adversaire, c'est un hold-up parfait. Mais les hold-up rapportent aussi trois points.`,
  `L'adversaire a eu le ballon, les occasions, le contrôle — et {team} a eu les buts. L'efficacité, cette qualité qu'on n'apprend pas.`,
];
const FACT_WEATHER_SUFFIX: Record<string, string[]> = {
  pluie: [
    `Le tout sous une pluie battante qui a transformé la pelouse en patinoire.`,
    `La pluie continue n'a épargné personne — chaque passe était une aventure.`,
  ],
  orage: [
    `Un match disputé sous l'orage, dans des conditions à la limite du praticable.`,
  ],
  neige: [
    `La neige a ajouté son grain de folie : ballon orange, lignes effacées, duels glissants.`,
  ],
  canicule: [
    `Le tout par une chaleur écrasante qui a coupé les jambes des deux équipes en seconde période.`,
  ],
  brouillard: [
    `Dans un brouillard épais où les tribunes devinaient plus qu'elles ne voyaient.`,
  ],
  vent: [
    `Avec un vent violent qui a rendu chaque ballon aérien imprévisible.`,
  ],
};

const DRAW_HEADLINES = [
  'Match nul frustrant pour {team}',
  '{team} partage les points — une occasion manquée ?',
  'Nul serré entre les deux équipes — {team} repart sur sa faim',
  '"On méritait mieux" — {team} n\'accepte pas le partage des points',
  '{team} accroche le nul mais laisse passer une chance en or',
  'Nul logique ou points perdus ? Le débat fait rage chez {team}',
  '{team} s\'arrache le point du nul in extremis',
  'Statu quo après cette rencontre : {team} ne gagne pas',
  '{team} en manque de réalisme — le nul punit les hésitations',
  '"On devait tuer le match" — {team} ne le fait pas et le paie cash',
  'Nul au goût amer pour {team} qui avait fait le plus dur',
  'Le point du nul ne satisfait personne dans le camp {team}',
];
const DRAW_BODIES = [
  'On attendait mieux de {team}. Le vestiaire reste calme, mais les questions commencent à se poser.',
  'Un point pris ou deux points perdus ? {team} repart avec un sentiment mitigé.',
  'En conférence de presse, le coach de {team} n\'a pas caché sa frustration : "On a eu les occasions, il fallait juste les mettre au fond." Son attaquant regardait ses chaussures.',
  '"C\'est un point de pris", a répété le capitaine de {team} sans conviction. Dans les travées, les supporters sifflaient.',
  'Le vestiaire de {team} est partagé entre soulagement et déception. Un point dans ces conditions, c\'est peu et beaucoup à la fois. Mais la tendance n\'est pas idéale.',
  'Il manquait ce soir à {team} cette étincelle qui fait la différence dans les matches fermés. Le talent était là, l\'efficacité non.',
  'Le sélectionneur de {team} a pris le temps de choisir ses mots avant d\'affronter la presse : "On progresse. Mais il faut progresser plus vite." Pas franchement rassurant.',
  'Le match nul est parfois honnête. Pas ce soir. {team} avait les ressources pour l\'emporter, mais n\'a pas su franchir le cap.',
  'L\'avant-centre de {team} aurait pu s\'offrir le doublé. Il a buté sur le poteau, puis sur le gardien. Ces moments-là peuvent peser lourd en fin de compétition.',
  '"On prend, on avance" — la formule du capitaine de {team} sonne comme une prière plus que comme une conviction. La compétition ne pardonnera pas longtemps ce genre de rendez-vous manqués.',
];

const LOSS_HEADLINES = [
  '{team} s\'incline — le groupe doit vite rebondir',
  'Défaite difficile à accepter pour {team}',
  '{team} concède face à un adversaire au-dessus ce soir',
  'Le sélectionneur de {team} sous le feu des critiques après la défaite',
  '{team} plie mais promet de se relever — les mots sonnent creux',
  'Coup dur pour {team} : la défaite fait mal au classement',
  '{team} ne confirme pas — la dynamique se brise',
  'Retour sur terre pour {team} après cette défaite inattendue',
  'La défense de {team} craque — l\'attaque ne sauve pas les meubles',
  '{team} ne trouve pas les réponses face à un adversaire bien en place',
  'Soirée noire pour {team} : sans idées, sans efficacité',
  '"On a été en-dessous" — {team} se flagelle après la défaite',
  '{team} contraint de regarder défiler les regrets',
];
const LOSS_BODIES = [
  'La défaite laisse des traces. {team} va devoir rapidement se remobiliser avant le prochain match.',
  'Le vestiaire de {team} est silencieux. Chaque joueur prend sa part de responsabilité.',
  'Difficile soirée pour {team}. Le staff réclame plus de solidité défensive et de concentration.',
  'En conférence de presse, le sélectionneur de {team} a pris la défense de ses joueurs mais n\'a pas convaincu. "On a manqué de réalisme. C\'est tout." La salle était sceptique.',
  '"Je prends la responsabilité" — le capitaine de {team} a joué les pompiers après la défaite, mais la grogne des supporters enfle dans les tribunes.',
  'Des sources internes révèlent des tensions dans le vestiaire de {team} après la défaite. La question du leadership se pose ouvertement.',
  'Le constat est simple et cruel : {team} a été dominé. Pas dominé au score — dominé tactiquement, physiquement, mentalement. Le staff devra en tirer les leçons.',
  'Pas de miracle ce soir pour {team}. L\'équipe a bien tenté, mais les idées manquaient dans les moments décisifs. Une défaite qui interroge.',
  'Le sélectionneur de {team} a refusé de pointer du doigt ses joueurs en public. En privé, la réunion qui a suivi a duré plus d\'une heure. Certains joueurs en sont ressortis les yeux rouges.',
  '{team} a cédé en seconde période, quand la fatigue a pris le dessus sur l\'organisation. L\'adversaire a su profiter du moindre relâchement. Une leçon à retenir.',
  '"On savait qu\'ils étaient forts. Mais on pensait pouvoir rivaliser", a soufflé un joueur de {team} en quittant le terrain. Ce soir, ça n\'a pas suffi.',
  'La défaite n\'est pas catastrophique sur le papier — elle ne fait pas encore de dégâts irréparables au classement. Mais dans la tête des joueurs de {team}, elle laisse une marque.',
  'Dans les couloirs du stade, un membre du staff de {team} chuchotait : "On a perdu le fil au mauvais moment." Trouver ce fil avant le prochain match sera la priorité.',
];

const HEAVY_LOSS_HEADLINES = [
  'HUMILIATION : {team} s\'effondre — la crise couve',
  'Débâcle de {team} — les questions fusent sur l\'état mental du groupe',
  'Naufrage de {team} : le moral est au plus bas',
  'CATASTROPHE : {team} sombre et entraîne tout le monde dans sa chute',
  'La gifle de trop — {team} au bord du gouffre après ce fiasco',
  'DÉROUTE : {team} impuissant, incapable de réagir',
  'La correction du siècle : {team} ne sait plus où donner de la tête',
  '{team} en miettes — un naufrage collectif sans explication',
  'CRISIS POINT : {team} encaisse et ne répond pas — inquiétant',
  'Avalanche de buts contre {team} — la compétition stupéfaite',
  '"C\'est une honte" — les mots forts après l\'humiliation de {team}',
  'L\'heure des comptes pour {team} : une défaite qui change tout',
];
const HEAVY_LOSS_BODIES = [
  'Difficile de trouver des mots. {team} a sombré, et personne dans le vestiaire ne semblait capable de réagir.',
  'La presse ne ménage pas {team}. Les déclarations d\'après-match sont tendues, les visages fermés.',
  'En conférence de presse, le sélectionneur de {team} a affronté une salve de questions hostiles. "Je ne reconnais pas mon équipe", a-t-il admis, la voix brisée. La salle était silencieuse.',
  'Des joueurs de {team} auraient quitté le vestiaire sans parler à personne. Le capitaine a tenté de rassembler le groupe, sans succès. La fracture est visible.',
  'Les tribunes grondent. Des banderoles hostiles ont été déployées à l\'encontre du staff de {team}. La fédération aurait demandé des explications en urgence.',
  'Une défaite pareille laisse des cicatrices. {team} a été piétiné, bousculé, ridiculisé. Il faudra du temps — et du courage — pour se relever.',
  'Le sélectionneur de {team} n\'a pas voulu parler à la presse. Son assistant a tenté de gérer la situation : "On travaillera. On répondra sur le terrain." La conviction n\'y était pas.',
  'Des supporters de {team} ont attendu le bus de l\'équipe à la sortie du stade. Aucun joueur n\'a eu le courage de sortir pour leur parler. L\'image est terrible.',
  'Dans les vestiaires de {team}, selon un membre du staff ayant requis l\'anonymat, "personne n\'a parlé pendant vingt minutes". Quand le sélectionneur a pris la parole, les larmes étaient visibles.',
  'La compétition n\'a pas vu un tel écart depuis longtemps. {team} a régressé à une vitesse alarmante. Les adversaires qui devaient craindre ce groupe ont désormais toutes les raisons de se réjouir.',
  'La question de l\'avenir du sélectionneur de {team} se pose avec insistance. Les dirigeants auraient exigé une réunion d\'urgence. Rien n\'est officiel encore — mais rien n\'est rassurant non plus.',
  '"Ce n\'était pas {team} ce soir. Ce n\'était pas nous", a murmuré le capitaine en sortant du tunnel. Une phrase qui en dit plus long que n\'importe quelle analyse tactique.',
];

const HIGH_MORALE_HEADLINES = [
  '{team} en pleine confiance avant un choc crucial',
  'Le groupe {team} est uni et ambitieux — gare aux adversaires',
  '{team} vit sur un nuage en ce moment',
  'Révélation : {team} serait l\'équipe la plus soudée de la compétition',
  '"On a peur de personne" — {team} ose l\'ambition',
  '{team} dégage quelque chose de spécial — les observateurs le remarquent',
  'La machine {team} est bien huilée : confiance, cohésion, efficacité',
  '{team} dans la bulle : rien ne semble pouvoir les atteindre en ce moment',
  'Témoin de l\'entraînement de {team} : "Je n\'ai jamais vu un groupe aussi soudé"',
  '{team} inarrêtable ? La question se pose sérieusement',
  '"Ce groupe est différent" — l\'engouement grandit autour de {team}',
  '{team} surfe sur une vague de confiance rare dans cette compétition',
];
const HIGH_MORALE_BODIES = [
  'Après plusieurs belles performances, {team} aborde la suite de la compétition avec un moral exceptionnel.',
  'L\'ambiance dans l\'effectif de {team} est au sommet. Tout le monde est prêt à se battre.',
  'Des sources proches de {team} décrivent une cohésion de groupe rare. Les séances d\'entraînement sont intenses, joyeuses, presque insouciantes. Un détail qui ne trompe pas.',
  'En conférence de presse, le joueur le plus expérimenté de {team} a déclaré : "On n\'est pas venu ici pour participer." Le vestiaire a applaudi.',
  'La presse internationale commence à parler de {team} comme d\'une équipe à part. Ce n\'est pas qu\'une question de résultats — c\'est une question d\'aura.',
  'Des matchs gagnés dans la douleur, des matchs dominés, des moments difficiles surmontés. {team} a traversé tout ça. Et le groupe en est sorti plus fort.',
  'On le lit dans les regards, on l\'entend dans les vestiaires : {team} croit en ce qu\'il fait. Cette foi collective est parfois plus précieuse que n\'importe quelle tactique.',
  'Le staff de {team} tente de garder les pieds sur terre, mais l\'énergie dans le groupe est difficile à contenir. "On se concentre sur le prochain match. Un à la fois." Sauf que tout le monde pense plus loin.',
  '"Ce groupe me rappelle des grandes équipes que j\'ai côtoyées", a confié un observateur qui suit la compétition depuis le début. Pour {team}, difficile d\'imaginer meilleur compliment.',
  'Chaque entraînement est une fête. Chaque match est un défi accepté avec sérénité. {team} est dans cet état rare où tout paraît possible — et les adversaires le sentent.',
];

const LOW_MORALE_HEADLINES = [
  '{team} traverse une zone de turbulences — la pression monte',
  'Malaise dans le groupe {team} : les résultats ne suivent pas',
  '{team} en crise de confiance : le collectif est fragilisé',
  'Révélations sur le vestiaire de {team} : la situation serait pire qu\'annoncée',
  'Le sélectionneur de {team} à bout de nerfs — l\'atmosphère est délétère',
  'Crise de leadership chez {team} — personne ne prend les choses en main',
  '{team} dans le flou : les joueurs cherchent leurs repères',
  'L\'unité de {team} en question — les doutes s\'installent',
  'Signal d\'alarme pour {team} : il faut réagir et vite',
  'Les cadres de {team} silencieux — mauvais signe pour le groupe',
  '{team} en perdition morale — la compétition pourrait leur échapper',
  '"On ne se reconnaît plus" — les aveux d\'un joueur de {team}',
];
const LOW_MORALE_BODIES = [
  'Les rumeurs de tensions internes circulent autour de {team}. Le staff tente de préserver la cohésion.',
  'Les résultats récents pèsent lourd. {team} a besoin d\'une victoire pour retrouver la sérénité.',
  'Plusieurs joueurs de {team} auraient manifesté leur mécontentement en privé. La situation est à surveiller.',
  'Selon nos informations, une réunion de crise aurait eu lieu dans le camp de {team}. Le sélectionneur aurait haussé le ton. "Ce que j\'ai dit restera dans ce vestiaire", a-t-il déclaré, mais la fuite n\'a pas tardé.',
  'Un joueur de {team} aurait demandé à quitter le groupe après une dispute avec le staff. Sa demande aurait été refusée. L\'ambiance reste explosive.',
  'Les entraînements de {team} seraient devenus tendus, sans cette légèreté qui caractérisait le groupe en début de compétition. Un observateur parle d\'une "atmosphère de plomb".',
  'Le staff de {team} multiplie les réunions à huis clos. Aucune information ne filtre — et c\'est souvent mauvais signe. La pression monte à mesure que les résultats s\'accumulent.',
  '{team} perd en déplacement, perd à domicile, perd des têtes dans le vestiaire. La spirale négative s\'accélère. Seule une performance marquante peut briser le cercle vicieux.',
  'Contacté par la presse, un proche du vestiaire de {team} a livré : "Les joueurs ne se parlent plus vraiment. Il y a des clans. C\'est difficile." Une confidence qui en dit long.',
  'La direction de {team} aurait convoqué le sélectionneur pour un entretien en urgence. Les doutes sur sa capacité à relancer le groupe se multiplient. Rien de décidé officiellement — mais rien n\'est serein non plus.',
  '"On sait ce qu\'on doit faire. On n\'arrive juste pas à le faire." Cette phrase du capitaine de {team}, dite à demi-voix, résume à elle seule la crise traversée par le groupe.',
];

/** Each entry is [headline, body] — kept paired so narrative stays coherent. */
const SCANDAL_PAIRS: [string, string][] = [
  [
    'SCANDALE : {team} au cœur d\'une polémique explosive',
    'Des sources proches du groupe font état de tensions internes graves. Plusieurs joueurs auraient été convoqués par la direction en urgence.',
  ],
  [
    '{team} accusé de comportements déplacés — l\'enquête est ouverte',
    'Des témoignages concordants font état d\'insultes à caractère personnel proférées par un joueur de {team} envers un adversaire. La commission d\'éthique a été saisie.',
  ],
  [
    'EXCLU : des stars de {team} au cœur d\'une fête interdite la veille du match',
    'Selon un journaliste d\'investigation, trois joueurs de {team} auraient passé la nuit précédant le match dans un établissement de jeux privé. Le sélectionneur "découvrait la nouvelle en même temps que tout le monde", selon son entourage.',
  ],
  [
    'CHOC : un joueur de {team} visé par une enquête pour corruption d\'arbitre',
    'La presse locale révèle qu\'un intermédiaire aurait approché l\'arbitre du dernier match de {team} avant la rencontre. L\'arbitre aurait refusé, mais l\'affaire est désormais entre les mains des autorités sportives.',
  ],
  [
    'CORRUPTION : l\'arbitre du dernier match de {team} soupçonné d\'avoir été acheté',
    'Des paris suspects auraient été identifiés sur le dernier match impliquant {team}. Une enquête est diligentée par la commission disciplinaire. Le club nie tout lien.',
  ],
  [
    'Trahison dans le camp {team} — une taupe aurait vendu des informations tactiques',
    'L\'ancien capitaine de {team}, écarté en début de compétition, a brisé le silence : "Ce qui se passe dans ce groupe n\'a rien de normal. Je parlerai quand le moment sera venu." Une bombe à retardement.',
  ],
  [
    '{team} dans la tourmente : un membre du staff placé en garde à vue',
    'Un préparateur physique de {team} aurait été interpellé par les autorités pour des motifs encore flous. La fédération refuse de commenter. L\'ombre de la fraude plane.',
  ],
  [
    'INSULTES : le sélectionneur de {team} s\'en prend violemment à l\'arbitre — suspension imminente',
    'En conférence de presse d\'après-match, le sélectionneur de {team} a perdu son calme et s\'en est pris violemment à l\'arbitre central : "C\'est une honte, cet homme n\'a rien à faire sur un terrain." Une plainte disciplinaire serait en cours.',
  ],
  [
    '{team} : le capitaine traite ses coéquipiers de "lâches" — le vestiaire explose',
    'Selon plusieurs témoins, le capitaine de {team} aurait traité ses propres coéquipiers de "lâches et de traîtres" dans le couloir du vestiaire. Des échanges ont dégénéré. Un joueur aurait quitté le camp dans la nuit.',
  ],
  [
    'Bagarre en coulisses après le match — des joueurs de {team} impliqués',
    'Une altercation physique aurait éclaté entre deux joueurs de {team} au retour du match. Le staff aurait dû intervenir. Les deux protagonistes nient, mais les traces sont visibles.',
  ],
  [
    'Révélations fracassantes autour de {team} : la compétition sous le choc',
    'Une conversation entre le sélectionneur et son assistant aurait été surprise et rapportée à la presse. Les propos, particulièrement virulents sur certains joueurs, ont créé un séisme dans le vestiaire de {team}.',
  ],
  [
    'Une affaire trouble éclabousse {team} — le groupe serait déstabilisé',
    'L\'affaire éclate au pire moment pour {team}. Concentration et mental sont mis à rude épreuve avant le prochain match. Le staff tente de faire le black-out médiatique.',
  ],
  [
    'Dopage : un joueur de {team} visé par un contrôle inattendu',
    'Un joueur de {team} aurait été soumis à un contrôle antidopage surprise après le dernier match. Les résultats ne sont pas encore connus, mais la rumeur s\'emballe. Le staff maintient que "tout est dans les règles".',
  ],
  [
    '{team} : le sélectionneur accusé de favoritisme — la grogne monte',
    'Plusieurs joueurs de {team} qui avaient peu de temps de jeu auraient rompu le silence en privé. "Certains jouent parce qu\'ils sont les chouchous du coach, pas parce qu\'ils le méritent." Le groupe se fracture.',
  ],
  [
    'Enquête ouverte sur des virements suspects liés à {team}',
    'Des transferts financiers inhabituels auraient été détectés dans les comptes d\'un intermédiaire lié à {team}. La commission d\'éthique sportive serait en train d\'examiner les documents. Aucune mise en cause directe pour l\'instant — mais l\'ombre de la corruption plane.',
  ],
  [
    'EXCLU : le capitaine de {team} aurait menacé un arbitre en privé',
    'Une source très proche de l\'arbitre du dernier match de {team} affirme avoir entendu le capitaine lui murmurer des menaces après le coup de sifflet final. L\'instance disciplinaire a été alertée. Le joueur dément fermement.',
  ],
  [
    'Scandale de vestiaire chez {team} : des propos compromettants rapportés',
    'Selon plusieurs témoins présents dans les couloirs, des propos très compromettants auraient été tenus dans le vestiaire de {team} après un match. La teneur exacte reste floue, mais les réactions au sein du groupe sont vives. Le staff a formellement nié toute fuite organisée.',
  ],
  [
    '{team} accusé d\'avoir falsifié des documents d\'identité de joueurs',
    'Une enquête administrative est en cours après des doutes sur l\'âge réel de deux joueurs de {team}. Si les faits sont avérés, des sanctions sportives lourdes pourraient tomber. La fédération parle d\'une "affaire extrêmement sérieuse".',
  ],
  [
    'Altercation entre un joueur de {team} et un fan après le match',
    'En quittant le stade, un joueur de {team} aurait répondu de façon virulente à des provocations de supporters adverses. La scène aurait dégénéré. Des témoins ont parlé à la presse. Le joueur "regrette" — selon le communiqué officiel.',
  ],
  [
    'PARIS ILLÉGAUX : un joueur de {team} aurait misé sur ses propres matchs',
    'Des paris liés à un joueur de {team} ont été repérés par la cellule d\'intégrité auprès de plusieurs bookmakers. Des mises auraient été placées sur plusieurs rencontres de la compétition — dont certaines impliquant sa propre équipe. Le joueur nie tout lien avec ces paris. L\'enquête suit son cours.',
  ],
  [
    '{team} : le dérapage d\'un cadre en zone mixte enflamme les tribunes',
    'Au micro des journalistes après le match, un joueur cadre de {team}, visiblement à cran, a ouvertement insulté une partie de ses propres supporters. Ses mots ont fait le tour des tribunes en quelques heures. La fédération a présenté des excuses officielles. Trop tard : la colère gronde.',
  ],
  [
    'Primes impayées chez {team} : les joueurs menacent la grève',
    'Selon nos informations, les primes de qualification promises aux joueurs de {team} n\'auraient jamais été versées. Une réunion houleuse a opposé les cadres du vestiaire à la direction. Le mot "grève" a été prononcé. La fédération assure que "tout sera régularisé". Personne n\'y croit.',
  ],
  [
    '{team} : un agent accusé de double jeu déstabilise le vestiaire',
    'L\'agent de trois joueurs de {team} négocierait en secret leurs départs — en pleine compétition. Des documents ont fuité. Les joueurs concernés jurent n\'être au courant de rien, mais le mal est fait : dans le vestiaire, chacun regarde son voisin autrement.',
  ],
  [
    'Scandale billetterie : des places du match de {team} revendues au marché noir par un salarié',
    'Un employé de la fédération de {team} aurait détourné plusieurs centaines de billets pour les revendre à prix d\'or. Des supporters munis de billets officiels se sont retrouvés refoulés à l\'entrée. La police enquête, la fédération "condamne fermement" — et rembourse au compte-goutte.',
  ],
  [
    '{team} : altercation nocturne à l\'hôtel de la délégation, la police appelée',
    'Aux alentours de 3h du matin, des clients de l\'hôtel où réside {team} ont alerté la réception après des cris et des bruits de mobilier. La police est intervenue. Aucune interpellation, mais des témoins affirment que deux joueurs étaient au centre de l\'incident. Le staff parle d\'un "malentendu".',
  ],
];

// ── Templates contextuels — classement ──────────────────────────────────────

/** Inséré dans body quand l'équipe est leader de groupe/ligue après victoire */
const STANDINGS_LEADER_WIN = [
  '{team} prend la tête — la pression se reporte sur les concurrents.',
  'En tête du classement, {team} dicte son tempo. Les autres suivent ou subissent.',
  '{team} s\'installe au sommet. Le message est limpide.',
  'Leader après ce succès, {team} impose sa loi. Le reste du peloton surveille.',
];

/** Inséré quand l'équipe remonte au classement après victoire */
const STANDINGS_CLIMB_WIN = [
  'Cette victoire propulse {team} dans le haut du classement. Le tournant de la compétition ?',
  '{team} grimpe au classement et se replace dans la course. Les calculs se réajustent.',
  'Trois points précieux qui changent la physionomie du groupe pour {team}.',
];

/** Inséré quand l'équipe est en danger au classement après défaite (générique tous formats) */
const STANDINGS_DANGER_LOSS = [
  '{team} glisse vers la zone dangereuse du classement. L\'urgence est réelle.',
  'La défaite plonge {team} dans une situation critique au classement. Il faut réagir.',
  '{team} regarde désormais vers le bas du tableau. Un scénario cauchemardesque se profile.',
  'La marge se réduit dangereusement pour {team}. Le prochain match sera vital.',
];

// ── Contexte classement par format de compétition ────────────────────────────

/** Championnat pur (format league) — fond de classement. PAS de relégation ni d'élimination dans ce format. */
const LEAGUE_BOTTOM_BODIES = [
  '{team} s\'enfonce dans les profondeurs du classement. Pas de couperet dans ce championnat — mais une saison qui s\'annonce très longue si rien ne change.',
  'Le tableau fait mal : {team} traîne dans le fond du classement. Le titre est un mirage lointain — l\'objectif est désormais de remonter la pente et de sauver l\'honneur.',
  'Au fond du classement, {team} joue pour sa fierté. Chaque journée sans réaction rend la lecture du tableau un peu plus douloureuse.',
  'Lanterne du championnat en ligne de mire pour {team}. Personne ne descend, certes — mais personne n\'oublie non plus une saison pareille.',
];

/** Championnat pur — la course au titre s'éloigne (remplace tout discours de qualification) */
const LEAGUE_TITLE_FADING_BODIES = [
  'Au classement, la course au titre s\'éloigne sérieusement pour {team}. Les points perdus ne se rattrapent pas — il faudrait un parcours parfait pour y croire encore.',
  'Chaque point laissé en route creuse l\'écart avec le haut du tableau. {team} voit le titre s\'éloigner journée après journée.',
  'Le haut du classement devient une ligne d\'horizon pour {team}. Sans une série immédiate, cette saison se jouera dans le ventre mou.',
];

/** Phase de groupes (coupe / groupes+KO / CdM) — la qualification se complique */
const GROUP_DANGER_BODIES = [
  'Au classement du groupe, la qualification se complique sérieusement pour {team}. Les prochains matchs n\'offriront aucun droit à l\'erreur.',
  '{team} se retrouve sous la ligne de qualification. Tout reste jouable, mais il faudra désormais prendre des points là où personne ne les attend.',
  'Le groupe se resserre et {team} est du mauvais côté de la barre. La sortie de phase de groupes, personne n\'y pense à voix haute — mais tout le monde y pense.',
];

/** Inséré quand l'équipe est déjà quasi éliminée après défaite */
const STANDINGS_ELIMINATED_RISK = [
  'Mathématiquement, {team} n\'est pas encore éliminé — mais presque. Le miracle reste possible, mais fragile.',
  'Les calculettes s\'affolent du côté de {team}. L\'élimination se rapproche à grands pas.',
  '{team} doit gagner tous ses matchs restants et espérer des miracles. L\'équation est cruelle.',
];

/** Élimination mathématique confirmée — groupe ou ligue */
const ELIMINATED_HEADLINES = [
  '{team} officiellement éliminé — le cauchemar est total',
  'C\'est fini pour {team} — élimination mathématique confirmée',
  '{team} dit adieu à la compétition — l\'heure du bilan',
  'Fin de parcours pour {team} : les maths sont sans pitié',
  '{team} éliminé — une campagne à oublier',
  'Rideau pour {team} — une élimination précoce et humiliante',
];
const ELIMINATED_BODIES = [
  'C\'est mathématiquement acté. {team} ne peut plus se qualifier. Une compétition à oublier au plus vite, dont les leçons devront pourtant être tirées. Le bilan est lourd : manque de caractère, résultats insuffisants, prestation globale indigne des attentes.',
  'Les calculettes peuvent s\'arrêter. {team} est éliminé. Pas de miracle, pas de remontada — juste une succession de déceptions qui aboutissent à ce constat brutal. Le groupe va devoir se regarder en face.',
  'Fini. Terminé. Éliminé. {team} quitte cette compétition par la petite porte, avec un bilan catastrophique que les joueurs devront digérer longtemps. Le staff a du travail cet été.',
  'L\'élimination de {team} est officielle. Dans les coulisses, les questions fusent : qu\'est-ce qui a merdé ? Tout, ou presque. Une campagne à décortiquer dans les moindres détails pour ne plus jamais revivre ça.',
  'On espérait mieux. {team} méritait mieux. Mais les résultats parlent d\'eux-mêmes : cette élimination est la conséquence logique d\'une compétition ratée de bout en bout. Amère conclusion.',
];

// ── Templates LPM spécifiques ─────────────────────────────────────────────────

/** Victoire en LPM avec contexte qualification directe */
const LPM_WIN_ZONE_OR_BODIES = [
  '{team} consolide sa place en Zone Or. La qualification directe pour la Coupe du Monde se dessine — mais rien n\'est acté. Les prochaines journées seront décisives.',
  'Trois points précieux pour {team} qui reste dans la course à la qualification directe. La Zone Or est là, tangible. Il faut maintenant la tenir.',
  '{team} tient la bonne position au classement LPM. Cette victoire est bien plus qu\'un résultat — c\'est un message envoyé aux concurrents directs pour la Zone Or.',
  'À ce stade de la LPM, chaque point en Zone Or est une promesse de Coupe du Monde. {team} le sait. Et ce soir, il a agi en conséquence.',
];

/** Victoire en LPM Zone Rouge — équipe qui se bat pour les barrages */
const LPM_WIN_ZONE_ROUGE_BODIES = [
  'Victoire cruciale pour {team} qui reste dans la course aux barrages A/R. Le combat pour éviter la Zone Noire continue — mais ce soir, l\'espoir est intact.',
  '{team} se maintient dans la zone des barrages. C\'est pas la qualification directe, mais c\'est encore une chance. Et ce groupe s\'y accroche.',
  'Trois points importants pour {team} dans la lutte acharnée de la Zone Rouge. Les barrages A/R, c\'est au moins ça — une deuxième chance que ce groupe mérite.',
  'La Zone Noire recule. {team} maintient son rang dans les barrages et garde un fil d\'espoir pour la Coupe du Monde. Tout reste à jouer.',
];

/** Défaite en LPM avec contexte classement dramatique */
const LPM_LOSS_ZONE_OR_HEADLINES = [
  '{team} glisse de la Zone Or — le cauchemar des barrages se rapproche',
  'Chute au classement LPM pour {team} — la qualification directe s\'éloigne',
  '{team} sort du top 24 — l\'angoisse des barrages A/R pointe le bout du nez',
  'LPM : {team} lâche sa place en Zone Or — catastrophe au classement',
];
const LPM_LOSS_ZONE_OR_BODIES = [
  'La défaite fait mal, mais le classement est encore plus cruel. {team} quitte la Zone Or et glisse dans l\'inconnu. La qualification directe pour la Coupe du Monde n\'est plus garantie. La pression est maximale.',
  'Une seule défaite et tout s\'emballe. {team} tombe sous la 24e place et voit les barrages A/R se dessiner à l\'horizon. Ce n\'était pas le plan. Il va falloir réagir vite.',
  'Le classement LPM est sans pitié. {team} sort du top 24 après cette défaite. Chaque point perdu ici peut signifier des barrages supplémentaires — ou pire, l\'élimination directe. Le staff est en état d\'urgence.',
  'Zone Or ce matin, Zone Rouge ce soir. {team} a vécu une journée cauchemardesque au classement LPM. La Coupe du Monde n\'est plus qu\'une promesse en danger. Il faut réagir — maintenant.',
];

/** Critique LPM — équipe sous-performante dans grande compétition */
const LPM_CRITIQUE_HEADLINES = [
  '{team} : cette LPM mérite mieux que cette médiocrité',
  'LPM — {team} : le niveau affiché est une insulte à la compétition',
  '{team} en LPM : honteux d\'être là et de jouer comme ça',
  'La LPM révèle {team} pour ce qu\'il est vraiment — insuffisant',
  '{team} en LPM : trop juste, trop mou, trop peu — et ça se voit',
  'CMF : {team} salit l\'image de la Ligue Préliminaire Mondiale',
  '{team} : la LPM c\'est pas un tournoi de village — réveille-toi',
  'Disqualifié moralement : {team} n\'a pas sa place parmi les 48',
];
const LPM_CRITIQUE_BODIES = [
  'La Ligue Préliminaire Mondiale met en scène les 48 meilleures nations — ou censées l\'être. Ce soir, {team} a démontré qu\'il n\'a peut-être pas sa place dans ce tableau. Aucune intensité, aucune ambition, aucune idée. La CMF se pose des questions. On se les pose aussi.',
  'Ce n\'est pas un tournoi de quartier. C\'est la LPM. La compétition qui décide qui va à la Coupe du Monde. Et {team} joue ça comme si c\'était un amical de présaison. Pas de pressing, pas de réaction, pas de dignité. Choquant.',
  'On ne sait pas ce qui est plus affligeant : le niveau de jeu de {team}, ou l\'absence totale de réaction du staff face à cette déroute. La LPM impose un standard. {team} est en dessous du sol. Et le classement le dit clairement.',
  'La LPM était une chance pour {team} de prouver sa valeur sur la scène internationale. À mi-compétition, le verdict est cinglant : ils n\'ont pas saisi cette chance. Pire — ils l\'ont gaspillée avec une nonchalance qui dépasse l\'entendement.',
  'Quelqu\'un dans le staff de {team} peut expliquer ce qu\'on a vu ce soir ? Parce que si c\'est le plan, c\'est un plan pour perdre. La LPM est impitoyable pour les équipes sans caractère. Et {team} vient de confirmer qu\'il en fait partie.',
];

/** Scandale LPM — enjeux énormes, tensions dramatisées */
const LPM_SCANDAL_PAIRS: [string, string][] = [
  [
    'SCANDALE LPM : {team} accusé de match arrangé — la CMF enquête',
    'Des paris suspects ont été détectés sur le dernier match de {team} en LPM. Les cotes s\'effondraient avant le coup d\'envoi. La Commission d\'Intégrité de la CMF a ouvert une enquête d\'urgence. Si les faits sont confirmés, l\'élimination directe de {team} serait envisagée. La LPM a son premier grand scandale.',
  ],
  [
    '{team} en LPM : le capitaine accuse le staff de "sabotage tactique délibéré"',
    'Une bombe éclate dans le camp {team}. Selon nos sources, le capitaine aurait envoyé un message privé à plusieurs coéquipiers accusant le staff d\'adopter délibérément une tactique perdante pour protéger des intérêts financiers liés aux paris sportifs. Le staff dément. La CMF surveille. La LPM tremble.',
  ],
  [
    'RÉVÉLATIONS : des joueurs de {team} auraient snobé la préparation LPM',
    'Un rapport interne révèle que plusieurs joueurs cadres de {team} auraient volontairement réduit leur engagement à l\'entraînement dans les semaines précédant la LPM. Des sources proches du vestiaire évoquent des "arrangements avec des agents et des clubs acheteurs". La CMF prend les informations au sérieux.',
  ],
  [
    'FUITE : les notes tactiques secrètes de {team} vendues à des adversaires LPM',
    'Un membre du staff de {team} aurait vendu les plans de jeu confidentiels de l\'équipe à deux nations adverses en LPM. Les transactions auraient été substantielles. L\'affaire est entre les mains de la justice sportive. La CMF pourrait annuler des résultats. Cauchemar total pour {team}.',
  ],
  [
    '{team} LPM : bagarre dans le vestiaire, deux joueurs mis à l\'écart',
    'Deux titulaires de {team} se sont violemment accrochés lors d\'une séance d\'entraînement, deux jours avant un match LPM crucial. L\'altercation, qui a dégénéré en bagarre physique, a conduit le staff à écarter les deux joueurs. Résultat : une équipe amputée de ses meilleurs éléments pour un match qui vaut une qualification. Irresponsable.',
  ],
  [
    'LPM — {team} : le sélectionneur démissionne en pleine compétition',
    'Coup de tonnerre. Le sélectionneur de {team} a remis sa démission ce matin, en plein cœur de la LPM, invoquant des "désaccords profonds avec la fédération sur la gestion du groupe". Il part sans adjoint désigné, sans plan de succession, et avec une équipe qui n\'a plus de leader technique à mi-compétition. Un abandon que personne n\'oubliera.',
  ],
  [
    'AFFAIRE {team} : des primes de défaite évoquées dans le vestiaire LPM',
    'Selon un joueur anonyme de {team} ayant contacté nos rédactions, des membres du groupe auraient évoqué entre eux l\'idée de "lâcher certains matchs" pour éviter des adversaires plus forts en phase éliminatoire. Si rien de concret n\'a été prouvé, la CMF a été alertée et l\'atmosphère dans le camp {team} est explosive.',
  ],
  [
    '{team} en LPM : une délégation infiltrée par un agent double',
    'La fédération de {team} a confirmé avoir découvert qu\'un membre accrédité de sa délégation officielle en LPM transmettait des informations internes à des tiers non identifiés. Identités des bénéficiaires encore inconnues. L\'impact sur les résultats de {team} reste à évaluer. La CMF réclame un rapport complet sous 48h.',
  ],
];

/** Tension barrage A/R — match aller */
const LPM_BARRAGE_ALLER_WIN_BODIES = [
  'L\'avantage est acquis, mais rien n\'est joué. En barrage A/R, le match retour sera une autre guerre. {team} a gagné la première manche — il doit maintenant la transformer en qualification.',
  'Victoire à l\'aller — mais l\'adversaire viendra tout faire pour renverser ça au retour. {team} le sait. Le staff l\'a martelé dans le vestiaire : "Ce n\'est pas fini. Rien n\'est fini tant qu\'on n\'a pas signé la qualification." Rendez-vous au retour.',
  '{team} prend l\'avantage mais c\'est une guerre de deux matchs. La tension des barrages A/R ne sera totalement dissipée qu\'après le coup de sifflet final du retour. Ce groupe a fait le plus dur — reste à confirmer.',
];
const LPM_BARRAGE_ALLER_LOSS_BODIES = [
  'Défaite à l\'aller — mais tout reste possible au retour. Les barrages A/R sont impitoyables, mais c\'est ça leur magie : aucune équipe n\'est mathématiquement éliminée après le match aller. {team} doit y croire. Le retour sera une finale.',
  '{team} est dos au mur, mais pas encore éliminé. Le match retour sera une montagne à gravir. L\'histoire de la LPM regorge de remontadas — la question est de savoir si ce groupe a le caractère pour en écrire une nouvelle page.',
  'C\'est mauvais, mais pas fatal. {team} perd à l\'aller dans ces barrages A/R. Il devra marquer au moins un but au retour et limiter les dégâts. La Coupe du Monde n\'est pas encore perdue — mais elle demande un dernier sursaut d\'orgueil.',
];

/** Tension barrage A/R — match retour */
const LPM_BARRAGE_RETOUR_WIN_BODIES = [
  '{team} QUALIFIÉ ! Le retour de barrage est remporté — la Coupe du Monde est là ! Des scènes de joie indescriptibles dans le vestiaire. Ce groupe a traversé l\'enfer des barrages A/R pour décrocher son billet. Une qualification qui a un goût d\'exploit.',
  'La remontada est accomplie. {team} renverse l\'adversaire au match retour et décroche sa qualification pour la Coupe du Monde. Les joueurs n\'y croient pas encore. Mais le score, lui, est sans appel. Qualifié.',
  'Il fallait un exploit. {team} l\'a fait. Match retour de barrage A/R remporté, qualification obtenue. Dans le vestiaire, les larmes se mêlent aux cris. La Coupe du Monde attendait — {team} lui répond présent.',
];
const LPM_BARRAGE_RETOUR_LOSS_BODIES = [
  'Éliminé au retour des barrages A/R. {team} ne verra pas la Coupe du Monde. La désillusion est immense pour un groupe qui y avait cru jusqu\'au bout. Ces barrages auront été un chemin de croix que ce groupe n\'aura pas réussi à parcourir jusqu\'au bout.',
  'La Coupe du Monde s\'éloigne définitivement. {team} est éliminé au match retour des barrages A/R. Après avoir survécu onze journées de LPM, c\'est dans ces matchs décisifs que tout s\'est brisé. Une fin de parcours cruelle pour un groupe qui méritait peut-être mieux.',
  '{team} s\'arrête aux portes de la Coupe du Monde. Les barrages A/R auront été fatals. La défaite au retour est la conclusion amère d\'une LPM qui promettait plus. Le bilan sera lourd à digérer.',
];

/** Danger zone — LPM barrages (25-40) ou fond de tableau ligue */
const DANGER_ZONE_BODIES = [
  'Le classement ne ment pas. {team} se retrouve dans une position délicate, avec le spectre des barrages qui se précise. Le prochain match aura des allures de finale. La pression est maximale.',
  'Ce n\'était pas le scénario prévu. {team} se retrouve aspiré vers le bas, et chaque défaite rend la situation un peu plus critique. Il faut une réaction immédiate, forte, collective. Avant qu\'il ne soit trop tard.',
  'La zone rouge. {team} la regarde désormais de très près. Un faux pas de plus et le scénario catastrophe devient réalité. Le vestiaire doit se serrer les coudes — ou tout s\'effondre.',
  'Mauvaise passe pour {team} qui se retrouve dans les profondeurs du classement. La qualification est encore possible, mais le chemin va être long et douloureux. Il faut gagner, et vite.',
];

/** LPM élimination directe (41+) */
const LPM_ELIMINATED_HEADLINES = [
  '{team} relégué directement — fin de l\'aventure LPM',
  'Disqualification sportive pour {team} — trop loin au classement',
  '{team} éliminé sans même les barrages — une déroute totale',
  'Le verdict est sans appel : {team} est sorti par le fond',
];
const LPM_ELIMINATED_BODIES = [
  'Pas même les barrages. {team} termine si loin dans le classement qu\'aucune deuxième chance ne lui est accordée. Une campagne catastrophique que les mots peinent à décrire. L\'équipe rentre à la maison avec zéro point de plus et beaucoup de questions.',
  '{team} n\'aura pas droit aux barrages A/R. Le classement est sans appel : cette élimination directe est la sanction d\'une compétition ratée de A à Z. Dans les tribunes, les supporters ne cachent pas leur colère et leur honte.',
  'Sortie par le fond. {team} termine dans les dernières places et dit au revoir à la compétition sans avoir jamais existé vraiment. Un résultat cruel mais mérité au vu des prestations affichées.',
];

// ── Templates contextuels — phases finales ───────────────────────────────────

/** Qualification/titre décroché aux tirs au but ({tab} = score de la séance vu du camp de l'équipe) */
const TAB_WIN_BODIES = [
  'Il a fallu aller jusqu\'aux tirs au but ({tab}) pour départager les deux équipes. {team} a gardé son sang-froid dans la loterie — et ce n\'est pas un hasard : gardien décisif, tireurs impeccables, nerfs d\'acier.',
  'Une séance de tirs au but, c\'est une éternité condensée. {team} l\'a traversée sans trembler ({tab}). Tout s\'est joué à onze mètres — et ce groupe a répondu présent.',
  '120 minutes n\'ont pas suffi. Aux tirs au but, {team} a été le plus solide ({tab}). On dit que les séances de penaltys sont une loterie — ceux qui les gagnent savent que c\'est faux.',
  'Les nerfs, le froid, la peur — {team} a tout dompté dans la séance ({tab}). Onze mètres qui séparent l\'enfer du paradis, et ce groupe a choisi le bon côté. Le gardien restera le héros de la soirée.',
  'Rien de plus cruel, rien de plus beau qu\'une séance de tirs au but. {team} l\'a gagnée ({tab}) avec un sang-froid qui force le respect. Quand tout se joue sur un geste, ce sont les caractères qui parlent — et celui de {team} a hurlé.',
];
const TAB_LOSS_BODIES = [
  'La cruauté du football à l\'état pur : {team} s\'incline aux tirs au but ({tab}) après avoir tenu tête pendant tout le match. Personne ne mérite de perdre comme ça — mais quelqu\'un devait avancer.',
  'Éliminé à onze mètres. {team} a tout donné, mais la séance de tirs au but ({tab}) a tourné du mauvais côté. Les joueurs sont restés de longues minutes au centre du terrain, incapables de quitter la pelouse.',
  'Les tirs au but ont rendu leur verdict : {team} sort par la plus petite des portes ({tab}). Dans le vestiaire, un silence de cathédrale. Ce genre de défaite ne s\'explique pas — elle se digère, lentement.',
];

const KNOCKOUT_PHASE_LABEL: Record<string, string> = {
  R64: 'trente-deuxièmes de finale',
  R32: 'seizièmes de finale',
  R16: 'huitièmes de finale',
  QF: 'quarts de finale',
  SF: 'demi-finales',
  F: 'finale',
  '3rd': 'match pour la troisième place',
};

const KO_WIN_HEADLINES: Record<string, string[]> = {
  R64: [
    '{team} passe les trente-deuxièmes — l\'aventure continue',
    'Premier cap franchi : {team} verra les seizièmes de finale',
    '{team} entre dans le tableau final par la grande porte',
  ],
  R32: [
    '{team} franchit les seizièmes de finale — les huitièmes en ligne de mire',
    'Qualification de {team} : le rendez-vous des huitièmes est pris',
    '{team} passe le cap des seizièmes avec autorité',
  ],
  R16: [
    '{team} en quarts de finale — la compétition prend une autre dimension',
    'Historique : {team} atteint les quarts de finale !',
    '{team} se qualifie et vise encore plus haut',
  ],
  QF: [
    '{team} en demi-finales — l\'euphorie est totale',
    'EXPLOIT : {team} décroche sa place dans le dernier carré !',
    '{team} rêve à voix haute — les demi-finales sont là',
    'Le dernier carré accueille {team} — une performance historique',
  ],
  SF: [
    '{team} EN FINALE — un exploit retentissant !',
    'FINALE ! {team} a réalisé l\'impossible et jouera le titre',
    '{team} à un match du sacre — la nation retient son souffle',
    'Scène de liesse : {team} disputera la grande finale !',
  ],
  F: [
    'CHAMPION ! {team} soulève le trophée au bout d\'un match épique !',
    '{team} SACRÉ CHAMPION — une victoire qui restera dans l\'histoire !',
    'LE TITRE ! {team} réalise son rêve et entre dans la légende !',
    'SUR LE TOIT DU MONDE : {team} est CHAMPION, la nation explose de joie !',
    '{team} au sommet — un sacre pour l\'éternité, gravé dans le marbre !',
    'ILS L\'ONT FAIT ! {team} triomphe et écrit la plus belle page de son histoire !',
  ],
  '3rd': [
    '{team} termine troisième — une médaille de bronze bien méritée',
    '{team} s\'offre la troisième place — la compétition s\'achève en beauté',
  ],
};

const KO_WIN_BODIES: Record<string, string[]> = {
  R64: [
    'Premier tour éliminatoire, première réponse : {team} a fait le travail. Le tableau est encore long, mais l\'aventure est lancée.',
    '{team} passe les trente-deuxièmes sans trembler. Le staff a fait tourner intelligemment — la suite demandera davantage.',
  ],
  R32: [
    'La qualification est acquise et c\'est amplement mérité. {team} a montré qu\'il avait les arguments pour aller loin dans cette compétition.',
    'En seizièmes de finale, {team} a su faire le travail. Le groupe est serein, le staff déjà tourné vers la suite.',
    '{team} avance dans le tableau et chaque victoire renforce la croyance collective. Les huitièmes de finale se profilent.',
  ],
  R16: [
    'Les quarts de finale sont l\'objectif minimum que s\'était fixé {team}. C\'est dans la poche. Maintenant, il faut voir jusqu\'où ce groupe peut aller.',
    'En atteignant les quarts, {team} entre dans une nouvelle dimension de la compétition. Les matchs seront plus serrés, les enjeux plus lourds. Le groupe semble prêt.',
    'Qualification obtenue. {team} savoure, mais le staff tempère : "Il reste les matchs les plus difficiles." Le vestiaire acquiesce — et attend la suite avec impatience.',
  ],
  QF: [
    'Le dernier carré. {team} n\'est plus qu\'à deux matchs du titre. Dans le vestiaire, les mots "finale" et "champion" commencent à circuler timidement. Le staff les laisse rêver — un peu.',
    '{team} en demi-finales, c\'est une performance que personne n\'aurait osé prédire au début de la compétition. Et pourtant. Ce groupe écrit sa propre histoire.',
    'Qualifier. Savourer. Recommencer. {team} suit cette philosophie depuis le début. Elle les a portés jusqu\'aux demi-finales. Elle peut les porter encore plus loin.',
  ],
  SF: [
    'La finale. Ce mot résonne comme un tonnerre dans le camp {team}. Des joueurs pleuraient dans le vestiaire. Le sélectionneur regardait ses hommes et ne trouvait pas les mots. Il n\'en avait pas besoin.',
    '{team} jouera la finale. Un fait. Une réalité que ce groupe a construite match après match, avec foi, avec travail, avec caractère. La compétition a son premier finaliste.',
    '"Je l\'ai dit dès le premier jour : ces joueurs sont capables de tout." Le sélectionneur de {team} avait raison. La finale le prouvera une dernière fois.',
  ],
  F: [
    'Le trophée est dans les mains de {team}. Une compétition entière condensée dans ce moment. Des larmes, des cris, des accolades. Une équipe, un titre, une légende.',
    '{team} champion. Le sélectionneur, les joueurs, le staff — tous épuisés, tous heureux, tous ensemble. Ce groupe restera dans les mémoires pour longtemps.',
    'La finale était un chef-d\'œuvre de tension. {team} a su tenir, souffrir, puis frapper. Un titre qui résume parfaitement cette incroyable aventure collective.',
    'Champions. Le mot claque, définitif, immense. {team} n\'a pas volé ce sacre — il l\'a arraché avec les tripes, dans la douleur et la beauté d\'une finale qu\'on racontera longtemps. Les enfants qui regardaient ce soir savent désormais quel maillot ils porteront demain.',
    'Il y a des équipes qui gagnent, et des équipes qui entrent dans l\'Histoire. {team} vient de basculer dans la seconde catégorie. Le trophée brandi vers le ciel, les larmes qui coulent, un peuple entier debout — ce moment-là est éternel. Personne ne pourra jamais le leur prendre.',
    '{team} tout en haut. Après des semaines de sueur, de doutes et de nuits blanches, le voilà le sommet. Le sélectionneur, agenouillé au centre du terrain, n\'a pas dit un mot — il pleurait. Parfois, le football offre des instants qui valent toutes les phrases du monde.',
  ],
  '3rd': [
    '{team} repart avec une médaille de bronze. Ce n\'était pas l\'objectif premier, mais dans les circonstances, ce résultat représente une belle récompense pour un groupe qui a tout donné.',
    'La déception de la demi-finale est derrière eux. {team} a répondu présent et termine sur une note positive. Les joueurs quittent la compétition la tête haute.',
  ],
};

const KO_LOSS_HEADLINES: Record<string, string[]> = {
  R64: [
    '{team} sorti dès les trente-deuxièmes — la douche froide',
    'Élimination d\'entrée de tableau pour {team} — brutal',
  ],
  R32: [
    '{team} éliminé dès les seizièmes — l\'aventure s\'arrête trop tôt',
    'Au revoir trop précoce pour {team} — seizièmes fatals',
    '{team} tombe en seizièmes : une élimination amère',
  ],
  R16: [
    '{team} s\'arrête en quarts de finale — si près, si loin',
    'Élimination en quarts pour {team} : le rêve s\'efface',
    '{team} éliminé en quarts — une compétition qui laisse des regrets',
  ],
  QF: [
    '{team} sort en demi-finales — cruel mais logique ?',
    'La demi-finale de trop pour {team} — l\'élimination fait mal',
    '{team} à une victoire de la finale et ne peut pas la franchir',
  ],
  SF: [
    '{team} battu en finale — la douleur de l\'argent',
    'Défaite en finale pour {team} — si proche du sacre',
    '{team} s\'incline en finale : la gloire était là, elle a filé',
  ],
  F: [
    '{team} battu en finale — la douleur de l\'argent',
    'Finaliste mais pas champion : {team} repart avec des regrets immenses',
  ],
  '3rd': [
    '{team} ne décroche pas la médaille de bronze — fin d\'aventure',
    'Défaite dans le match pour la troisième place : {team} rentre bredouille',
  ],
};

const KO_LOSS_BODIES: Record<string, string[]> = {
  R64: [
    'Sortir dès les trente-deuxièmes, c\'est le scénario que personne n\'avait envisagé chez {team}. L\'adversaire a saisi sa chance — pas eux. Le tableau final se fera sans eux.',
    'Un seul match éliminatoire, et déjà la sortie. {team} quitte la compétition par la première porte. Difficile de faire plus court, difficile de faire plus frustrant.',
  ],
  R32: [
    'L\'aventure de {team} s\'arrête aux seizièmes. Une élimination prématurée qui laissera des traces. Le groupe s\'était donné les moyens d\'aller plus loin — il n\'a pas su franchir ce cap.',
    'Seizièmes fatals pour {team}. Difficile d\'expliquer ce qui s\'est passé. L\'adversaire a été meilleur, et {team} n\'a pas trouvé les ressources pour inverser la tendance.',
  ],
  R16: [
    'Les quarts de finale étaient à portée. {team} ne les atteindra pas. Cette élimination laisse un goût amer, et les questions sur ce qui aurait pu être différent hanteront longtemps les joueurs.',
    'Éliminé en quarts, {team} rentre à la maison. Le staff reconnaît que l\'équipe aurait pu faire mieux. "On avait les armes. On n\'a pas su s\'en servir au bon moment."',
  ],
  QF: [
    'La demi-finale était là, visible, presque tangible. {team} n\'a pas pu la saisir. Dans le vestiaire, les visages sont défaits. Le sélectionneur a pris la parole, mais les mots ne consolent pas ce soir.',
    'À une victoire de la finale, {team} trébuche. C\'est le football dans ce qu\'il a de plus cruel. Ce groupe méritait peut-être plus — mais la compétition ne récompense pas les mérites, elle récompense les résultats.',
  ],
  SF: [
    'La finale était si proche. {team} a tout donné, mais l\'adversaire a été au-dessus ce soir. La médaille d\'argent ne consolera personne dans ce groupe — mais elle témoigne d\'un parcours exceptionnel.',
    'Perdre une finale, c\'est une douleur à part. {team} en fera l\'expérience amère. Les larmes dans le vestiaire résument tout : l\'ambition était là, la détermination aussi. Il manquait juste ce rien qui fait les champions.',
    '"On aurait dû gagner." Le capitaine de {team} ne mâchait pas ses mots après la finale. Dans d\'autres circonstances, peut-être. Ce soir, ce n\'était pas leur soir.',
  ],
  F: [
    'Perdre une finale, c\'est une douleur à part. {team} en fera l\'expérience amère. Les larmes dans le vestiaire résument tout : l\'ambition était là, la détermination aussi. Il manquait juste ce rien qui fait les champions.',
    '"On aurait dû gagner." Le capitaine de {team} ne mâchait pas ses mots après la finale. Dans d\'autres circonstances, peut-être. Ce soir, ce n\'était pas leur soir.',
  ],
  '3rd': [
    '{team} repart sans médaille. Un épilogue décevant pour une compétition qui promettait plus. Le groupe rentrera avec des regrets, mais aussi avec des souvenirs que peu d\'équipes peuvent s\'offrir.',
  ],
};

// ── Templates spécifiques Coupe du Monde ─────────────────────────────────────

// Phase de groupes — victoire
const WC_GROUP_WIN_HEADLINES = [
  '{team} démarre sa Coupe du Monde du bon pied',
  'Victoire cruciale de {team} dans le groupe — la qualification se dessine',
  '{team} prend les trois points : le Mondial sourit déjà',
  'Premier succès mondial pour {team} — le groupe retient son souffle',
  '{team} s\'impose et met la pression sur le reste du groupe',
  'Coup d\'envoi réussi : {team} débute son Mondial en fanfare',
  '{team} l\'emporte et garde son destin en main dans ce groupe',
  'Victoire capitale de {team} : trois points d\'or dans cette poule serrée',
];
const WC_GROUP_WIN_BODIES = [
  'Trois points, c\'est le nerf de la guerre à ce stade. {team} les a pris avec sérieux et application. Le Mondial peut commencer pour de bon.',
  'Dans la fournaise d\'une phase de groupes sans pitié, {team} a su faire le dos rond et saisir sa chance. Le vestiaire exulte, mais le staff tempère : "Le plus dur reste à faire."',
  'Cette victoire en phase de poules pourrait bien être le tournant de la compétition pour {team}. L\'équipe avait besoin de ce succès pour installer sa confiance. C\'est chose faite.',
  'Le stade bruissait d\'impatience. {team} n\'a pas déçu. Une victoire sobre mais essentielle dans la course à la qualification. Chaque point compte à la Coupe du Monde.',
  'Sur la scène mondiale, {team} a prouvé ce soir qu\'il avait sa place. Victoire méritée, organisation irréprochable, et un vestiaire qui commence à y croire vraiment.',
  '"On sait ce qu\'on vaut. On l\'a montré." Le capitaine de {team} avait les mots justes après cette victoire fondatrice dans la compétition planétaire.',
];

// Phase de groupes — défaite
const WC_GROUP_LOSS_HEADLINES = [
  '{team} perd en phase de groupes — le Mondial commence mal',
  'Défaite amère pour {team} : la qualification prend une claque',
  '{team} trébuche d\'entrée sur la scène mondiale',
  'Le rêve mondial de {team} déjà menacé après cette défaite',
  '{team} mal embarqué dans ce Mondial — la réaction est urgente',
  'Coup dur pour {team} : trois points perdus qui font mal dans ce groupe',
  '{team} n\'a pas trouvé les ressources : élimination qui se profile',
  'Début de Mondial raté pour {team} — le groupe s\'impatiente',
];
const WC_GROUP_LOSS_BODIES = [
  'La Coupe du Monde est impitoyable. {team} vient de l\'apprendre à ses dépens. Une défaite en phase de groupes qui remet tout en question — il faudra gagner les prochains matchs sans état d\'âme.',
  'Les supporters de {team} avaient fait le voyage en espérant autre chose. Ils repartent silencieux. La qualification est encore possible, mais le chemin vient de se compliquer sérieusement.',
  'Sur la plus grande scène du football mondial, {team} n\'a pas été à la hauteur. La pression, l\'enjeu, l\'adversaire — tout a semblé peser trop lourd. Il faudra une autre équipe pour le prochain match.',
  '"On n\'a pas le droit de refaire ça." Le sélectionneur de {team} n\'a pas mâché ses mots après la défaite. Le vestiaire est plongé dans le silence. Le Mondial n\'attend pas.',
  'Une défaite en phase de poules à la Coupe du Monde, ça marque. {team} devra puiser dans ses ressources mentales pour rebondir. Le temps presse, les points manquent.',
];

// Phase de groupes — nul
const WC_GROUP_DRAW_HEADLINES = [
  '{team} se contente du nul — est-ce suffisant pour la qualification ?',
  'Partage des points pour {team} : un résultat qui interroge à ce stade',
  '{team} accroche le match nul mais reste sur sa faim en phase de groupes',
  'Nul décevant de {team} : le compte à rebours de la qualification est lancé',
  '{team} n\'avance pas — un nul qui complique les calculs de qualification',
];
const WC_GROUP_DRAW_BODIES = [
  'Un point. Est-ce suffisant ? Dans une poule aussi serrée, {team} ne peut pas se permettre trop de nuls. La qualification reste ouverte, mais le scénario se complique.',
  'On attendait que {team} fasse le jeu, prenne des risques, aille chercher les trois points. Il a reculé, calculé, et reparti avec un match nul. À ce niveau, ça ne suffit peut-être pas.',
  'Le nul n\'est pas un drame, mais il n\'est pas non plus un exploit. {team} doit impérativement gagner son prochain match de phase de groupes pour garder son destin en main. La pression monte.',
];

// 8ème de finale (R16 = round of 16 = 16 équipes = 8ème)
const WC_R16_WIN_HEADLINES = [
  '{team} qualifié pour les quarts de finale de la Coupe du Monde !',
  'MONDIAL : {team} passe les 8èmes et s\'offre un quart de finale !',
  '{team} en quarts de finale — la folie mondiale commence',
  'Qualification historique pour {team} : les quarts de finale sont là !',
  '{team} franchit les 8èmes de finale — le rêve continue',
  'Scènes de liesse : {team} se qualifie pour les quarts de la Coupe du Monde',
];
const WC_R16_WIN_BODIES = [
  'Les 8èmes de finale de la Coupe du Monde, c\'est déjà un piège. {team} en est sorti la tête haute. Les quarts de finale se profilent, et avec eux, une nouvelle dimension de compétition.',
  'Ce soir, {team} a montré qu\'il avait le caractère d\'un quart de finaliste mondial. Rien n\'a été facile, tout a été bataillé — mais la victoire est là, et elle compte double sur la scène planétaire.',
  'Le monde entier regardait. {team} n\'a pas vacillé. Qualification méritée, match âprement disputé, vestiaire en délire. Les quarts de finale de la Coupe du Monde, c\'est une autre planète — et {team} y est.',
  '"Je suis tellement fier de ces joueurs." Le sélectionneur de {team} avait les yeux humides au coup de sifflet final. Ses hommes venaient de décrocher une place en quarts de finale mondiale. Un accomplissement immense.',
];
const WC_R16_LOSS_HEADLINES = [
  '{team} éliminé en 8èmes de finale — le Mondial s\'arrête là',
  'Fin du rêve mondial pour {team} : sortie aux 8èmes de finale',
  '{team} ne verra pas les quarts — l\'aventure mondiale est terminée',
  'Élimination en 8èmes pour {team} : la Coupe du Monde est cruelle',
  '{team} aux portes des quarts, mais la porte s\'est fermée',
];
const WC_R16_LOSS_BODIES = [
  'Les 8èmes de finale de la Coupe du Monde ont eu raison de {team}. L\'aventure s\'arrête ici, dans ce stade qui restera gravé dans les mémoires. La déception est immense, mais le parcours méritait mieux que ça.',
  '{team} rentre à la maison. Les valises se font en silence dans le vestiaire. Les 8èmes de finale d\'un Mondial, c\'est déjà une performance — mais dans la tête des joueurs, c\'est une occasion manquée qui ne reviendra pas.',
  'Cruel. {team} avait tout pour passer ce tour. La préparation, le talent, la cohérence — mais le football est parfois injuste. L\'élimination aux 8èmes laisse un goût amer que les années ne feront qu\'amplifier.',
];

// Quarts de finale
const WC_QF_WIN_HEADLINES = [
  '{team} EN DEMI-FINALE DE LA COUPE DU MONDE — exploit retentissant !',
  'MONDIAL : {team} fait tomber les géants et file en demies !',
  '{team} dans le dernier carré mondial — le pays est en fête !',
  'HISTORIQUE : {team} atteint les demi-finales de la Coupe du Monde !',
  'Scènes de folie : {team} qualifié pour les demies du Mondial !',
  '{team} écrit l\'histoire : les demi-finales mondiales sont là !',
];
const WC_QF_WIN_BODIES = [
  'Les demi-finales de la Coupe du Monde. Ces quatre mots ont une résonance particulière pour {team}. Ce soir, ils sont devenus réalité. Un exploit que peu auraient prédit en début de tournoi.',
  'Dans les rues, les gens pleuraient de joie. Sur le terrain, les joueurs de {team} s\'étreignaient, incrédules. Demi-finaliste d\'un Mondial — c\'est une phrase que ce groupe gardera toute sa vie.',
  '"C\'est le plus beau jour de ma carrière." Ces mots, dits par le capitaine de {team} dans le vestiaire, résument tout. Les demi-finales d\'un Mondial, c\'est une promesse tenue. Et cette équipe a promis des choses.',
  'Le sélectionneur de {team} a fondu en larmes. Ses joueurs l\'ont entouré. La demi-finale d\'un Mondial — c\'était le rêve secret que personne n\'osait formuler. Ce soir, il est devenu réalité.',
];
const WC_QF_LOSS_HEADLINES = [
  '{team} sort en quarts de finale — si proche des demies',
  'Le Mondial s\'arrête en quarts pour {team} — cruel épilogue',
  '{team} éliminé aux quarts de finale : le rêve demi-finale s\'envole',
  'Quarts fatals pour {team} — la Coupe du Monde prend fin ici',
  '{team} n\'ira pas en demi-finale : défaite douloureuse en quarts',
];
const WC_QF_LOSS_BODIES = [
  'Les demi-finales étaient si proches. {team} a tout donné, mais l\'adversaire a été plus fort. C\'est la loi des quarts de finale mondiaux — il n\'y a pas de place pour les regrets, seulement pour les certitudes : ce groupe a marqué l\'histoire de son football national.',
  'Sortir en quarts de finale d\'un Mondial, c\'est à la fois une réussite et une déchirure. Pour {team}, les deux coexistent ce soir. Les larmes dans le vestiaire disent tout ce que les mots ne peuvent pas.',
  '"On avait notre chance. On n\'a pas su la saisir." Le sélectionneur de {team} était droit dans ses bottes, malgré la douleur. Son équipe avait atteint les quarts d\'un Mondial — c\'est déjà une performance historique pour ce pays.',
];

// Demi-finales
const WC_SF_WIN_HEADLINES = [
  '{team} EN FINALE DE LA COUPE DU MONDE — LA NATION EST EN DÉLIRE !',
  'FINALE MONDIALE POUR {team} — LE RÊVE EST DEVENU RÉALITÉ !',
  '{team} DISPUTERA LA FINALE DU MONDIAL — ÉVÉNEMENT HISTORIQUE !',
  'LE PAYS RETIENT SON SOUFFLE : {team} est en finale de la Coupe du Monde !',
  'INCROYABLE : {team} en finale mondiale après un parcours épique !',
];
const WC_SF_WIN_BODIES = [
  'La finale de la Coupe du Monde. Quatre mots qui résonnent comme un tonnerre dans tout le pays de {team}. Dans les rues, les gens ne dormiront pas cette nuit. Sur le terrain, les joueurs ont du mal à réaliser ce qu\'ils viennent d\'accomplir. La finale mondiale est là.',
  'Il était une fois une équipe qui croyait. {team} disputera la finale de la Coupe du Monde. Ce n\'est plus un rêve, ce n\'est plus un objectif — c\'est une réalité. Et cette équipe l\'a construite point par point, match après match, avec foi et caractère.',
  'Le sélectionneur de {team} cherchait ses mots dans le vestiaire. Autour de lui, ses joueurs pleuraient, criaient, s\'étreignaient. La finale de la Coupe du Monde arrive rarement dans une carrière. Ces hommes la vivront. Ensemble.',
  '"On ne lâche rien, jamais." La devise de {team} tout au long de ce Mondial. Elle leur a valu une place en finale mondiale. La plus belle récompense que le football puisse offrir.',
];
const WC_SF_LOSS_HEADLINES = [
  '{team} battu en demi-finale — le titre mondial attendra',
  'La finale de la Coupe du Monde s\'échappe pour {team}',
  '{team} éliminé à une victoire de la finale mondiale',
  'Demi-finale cruelle pour {team} : le rêve d\'une finale s\'éteint',
  '{team} ne sera pas en finale — douleur immense après les demies',
];
const WC_SF_LOSS_BODIES = [
  'La finale était à portée de main. {team} ne la jouera pas. C\'est probablement la plus grande douleur qu\'un footballeur puisse ressentir — être à une victoire du plus grand match du monde, et ne pas pouvoir y accéder. Le groupe repartira avec une médaille de bronze à jouer, mais les cœurs seront ailleurs.',
  'Dans le vestiaire, le silence était total. Personne n\'osait bouger. Puis le capitaine a pris la parole : "On a tout donné. Tout. Levez la tête." Les larmes coulaient quand même. {team} ne jouera pas la finale de la Coupe du Monde — et ça fait mal comme jamais.',
  'Perdre une demi-finale de Coupe du Monde, c\'est une blessure qui ne se referme pas vraiment. {team} devra trouver la force de jouer le match pour la troisième place avec dignity. Pas facile quand le rêve de finale vient de s\'écrouler.',
];

// Finale
const WC_F_WIN_HEADLINES = [
  'CHAMPION DU MONDE ! {team} SOULÈVE LE TROPHÉE — LÉGENDE !',
  '{team} CHAMPION DU MONDE — UNE NUIT QUI RESTERA DANS L\'HISTOIRE POUR TOUJOURS !',
  'LE TITRE MONDIAL POUR {team} — UN SACRE DIGNE DES PLUS GRANDS !',
  'SACRÉ : {team} EST CHAMPION DU MONDE — LA PLANÈTE ENTIÈRE A LES YEUX SUR EUX !',
  'IMMORTELS : {team} CHAMPION DU MONDE, LES JOUEURS ENTRENT DANS LA LÉGENDE !',
];
const WC_F_WIN_BODIES = [
  'Champions du Monde. {team}. Ces trois mots forment désormais une phrase qui ne s\'effacera jamais. Le trophée est dans leurs mains, les larmes sur leurs visages, et l\'histoire dans leurs cœurs. Ce groupe a accompli l\'impossible — et ils le savaient depuis le début.',
  'Le coup de sifflet final. L\'explosion de joie. Les joueurs de {team} s\'effondraient les uns sur les autres, épuisés et heureux. Champions du Monde. La plus haute distinction que le football puisse offrir. Ils l\'ont méritée chaque minute de chaque match.',
  'Dans les rues, les gens pleuraient, chantaient, s\'embrassaient. {team} venait de décrocher le titre mondial, et le pays entier le vivait comme un rêve éveillé. Le sélectionneur, les joueurs, le staff — une génération dorée qui entrera dans l\'histoire.',
  '"Je ne sais pas quoi dire. On est champions du monde." Le capitaine de {team} tenait le trophée, tremblant. Derrière lui, ses coéquipiers criaient, pleuraient, riaient. Il n\'y a rien au-dessus d\'un titre de Coupe du Monde. Rien.',
  'Cette Coupe du Monde avait un roi. Il s\'appelle {team}. Un parcours sans faute, un caractère en acier, une qualité collective au-dessus de tout le monde. Champions du Monde — et pour longtemps dans les mémoires.',
];
const WC_F_LOSS_HEADLINES = [
  '{team} vice-champion du monde — la douleur de la finale',
  'La Coupe du Monde échappe à {team} en finale — déchirement immense',
  '{team} s\'incline en finale du Mondial — si proche du sacre mondial',
  'Finaliste mais pas champion : {team} repartira avec le cœur brisé',
  '{team} perd la finale de la Coupe du Monde — la plus cruelle des défaites',
];
const WC_F_LOSS_BODIES = [
  'Vice-champion du monde. C\'est un titre qui n\'existe pas, et pourtant {team} devra vivre avec. La finale de la Coupe du Monde, c\'est soit le paradis soit l\'enfer. Ce soir, c\'est l\'enfer. Et il faudra du temps — beaucoup de temps — pour s\'en remettre.',
  'Perdre une finale de Coupe du Monde, c\'est une blessure à part. {team} avait tout pour gagner. Le talent, la préparation, le mental. Mais ce soir, l\'adversaire a été légèrement au-dessus. "Légèrement" — un mot qui résume toute la cruauté du football.',
  '"Je suis fier de chacun d\'eux." Le sélectionneur de {team} avait les yeux rouges mais la voix ferme. Finaliste d\'une Coupe du Monde, c\'est extraordinaire. Les joueurs le savent. Mais ce soir, la douleur est plus forte que la fierté.',
  'Dans le vestiaire, les médailles d\'argent traînaient au sol. Personne ne voulait les regarder. {team} avait rêvé d\'or et repartait avec de l\'argent. Le football peut être terriblement injuste. Ce soir, il l\'était.',
];

// Scandales spécifiques CdM
const WC_SCANDAL_PAIRS: [string, string][] = [
  [
    'CORRUPTION À LA COUPE DU MONDE — {team} au cœur d\'une affaire explosive',
    'Une enquête de la CMF vise des membres de la délégation de {team}. Des soupçons de corruption lors du tirage au sort et des arrangements d\'avant-match circulent dans les couloirs. L\'équipe nie en bloc, mais la machine médiatique est lancée. Le Mondial a son premier scandale.',
  ],
  [
    'AFFAIRE {team} : des paris suspects entourent leur dernier match',
    'Le bureau de la lutte contre la manipulation des matchs a ouvert une enquête après des anomalies détectées sur les cotes de paris avant la rencontre de {team}. Le joueur concerné nie toute implication. La fédération internationale a été saisie. L\'ombre du scandale plane sur ce Mondial.',
  ],
  [
    '{team} : incident diplomatique en pleine Coupe du Monde',
    'Ce qui devait rester dans le vestiaire est sorti dans les médias. Des propos tenus par un joueur de {team} à l\'encontre d\'une nation adverse ont provoqué un incident diplomatique. La CMF a ouvert une procédure disciplinaire. Les deux fédérations tentent de calmer le jeu.',
  ],
  [
    'BAGARRE GÉNÉRALE dans les couloirs du stade — {team} au centre de la polémique',
    'Des images de vidéosurveillance ont fuité : des membres de la délégation {team} étaient impliqués dans une altercation avec des officiels d\'une nation concurrente après le match. Les deux parties campent sur leurs positions. La CMF est en train d\'examiner les images. Le Mondial a son scandale du jour.',
  ],
  [
    '{team} accusé de triche — l\'arbitrage au cœur de la polémique mondiale',
    'La rencontre de {team} laisse un arrière-goût amer. Plusieurs décisions arbitrales controversées, des accusations de simulation flagrante, et une communauté footballistique en ébullition. La presse mondiale s\'enflamme. La CMF promet une "analyse approfondie". {team} préfère ne pas commenter.',
  ],
  [
    'FUITE DE VESTIAIRE : des secrets de {team} révélés à la presse mondiale',
    'Un document confidentiel contenant les plans tactiques et les informations médicales privées de {team} a été transmis à plusieurs médias internationaux. Une taupe dans le groupe ? Un espionnage organisé ? L\'enquête interne est ouverte. Le staff de {team} est sous le choc.',
  ],
  [
    '{team} : le gardien suspendu pour geste grossier envers le public adverse',
    'La scène a fait le tour des tribunes en un éclair. Le gardien de {team}, à l\'issue du match, a adressé un geste obscène aux supporters adverses. Convoqué en urgence par la commission disciplinaire de la CMF, il écope d\'une suspension immédiate. Le staff de {team} présente ses excuses, mais le mal est fait.',
  ],
  [
    'SCANDALE RACISTE : un joueur de {team} visé par une enquête internationale',
    'Des propos à caractère raciste auraient été tenus par un membre de la sélection {team} lors d\'une altercation sur le terrain. La CMF a ouvert une enquête. Le joueur en question nie les faits. Les associations antiracisme du monde entier réclament une sanction exemplaire. Le Mondial s\'arrête ce soir pour de mauvaises raisons.',
  ],
];

// Critiques CdM
const WC_CRITIQUE_HEADLINES = [
  '{team} : prestation honteuse sur la scène mondiale',
  '{team} — venu pour quoi, au juste ? La honte du Mondial',
  '{team} ridiculisé devant la planète entière',
  '{team} : ce qu\'on a vu ce soir ne méritait pas d\'être vu',
  'La pire équipe de ce Mondial ? {team} postule sérieusement',
  '{team} devrait rembourser les téléspectateurs du monde entier',
  'Nulle, inutile, sans âme : {team} salit son image mondiale',
  '{team} : une honte internationale confirmée ce soir',
];
const WC_CRITIQUE_BODIES = [
  'Sur la scène du football mondial, {team} a livré une prestation que personne n\'osait imaginer aussi catastrophique. Pas de pressing, pas d\'organisation, pas de volonté. La planète entière a regardé. La planète entière a vu. Honteux.',
  'On ne participe pas à une Coupe du Monde pour faire de la figuration. {team} semble l\'avoir oublié. Ce soir, face au monde entier, cette équipe a montré l\'étendue de ses lacunes. Les chroniqueurs s\'enflamment. La presse internationale fustige. Et c\'est mérité.',
  'Chronique d\'un désastre annoncé. {team} arrive dans ce Mondial sans préparation sérieuse, sans cohérence tactique, et repart avec exactement ce qu\'il méritait. Une correction. Mondiale. Publique. Méritée.',
  '{team} a eu la chance d\'être sur la plus grande scène du football. Il n\'en a pas profité. Une équipe sans idées, sans combativité, sans caractère — et surtout, sans aucune excuse valable. Sur un plateau mondial, ce niveau est inacceptable.',
];

// Exploit / grande victoire CdM
const WC_EXPLOIT_HEADLINES = [
  'SÉISME MONDIAL : {team} réalise le résultat du siècle à la Coupe du Monde !',
  'CHOC : {team} humilie un favori et affole la planète football !',
  '{team} fait tomber un géant — le Mondial a son premier exploit !',
  'INCROYABLE : {team} signe la performance de cette Coupe du Monde !',
  'LE MIRACLE EXISTE : {team} atomise son adversaire sur la scène mondiale !',
  'CARNAGE MONDIAL : {team} inflige un résultat qui restera dans les annales !',
];
const WC_EXPLOIT_BODIES = [
  'Les statistiques ne mentent pas. {team} vient d\'infliger l\'une des défaites les plus lourdes de l\'histoire récente de ce tournoi à son adversaire du soir. La planète football est sous le choc. Les favoris tremblent. {team} est désormais une équipe à craindre.',
  'Ce résultat va traverser les décennies. {team} n\'a pas seulement gagné ce soir — il a dominé, écrasé, humilié. Sur la scène mondiale. Devant des milliards de téléspectateurs. Un exploit qui dépasse tout ce qu\'on pouvait espérer.',
  'Dans les vestiaires adverses, c\'est la sidération. {team} a mis un coup de pied dans la fourmilière mondiale. Ce groupe déborde de talent, de confiance, et d\'une envie dévorante de bousculer les hiérarchies établies. Ce soir, c\'est mission accomplie.',
  '"On était là pour gagner, pas pour participer." Ces mots du capitaine de {team}, prononcés avant le tournoi, prennent ce soir une résonance particulière. Cette démonstration de force va marquer ce Mondial. Pour longtemps.',
];

// Élimination de groupe (après le dernier match)
const WC_ELIMINATED_HEADLINES = [
  '{team} éliminé de la Coupe du Monde — le rêve mondial s\'achève',
  'Le Mondial dit au revoir à {team} — une aventure trop courte',
  '{team} rentre à la maison — la phase de groupes l\'a eu',
  'Élimination en phase de poules pour {team} : la CdM est cruelle',
  '{team} quitte la Coupe du Monde — une sortie par la petite porte',
  'Fin du voyage mondial pour {team} — l\'élimination est officielle',
];
const WC_ELIMINATED_BODIES = [
  'Le billet de retour est pris. {team} quitte la Coupe du Monde après la phase de groupes. Une élimination qui fait mal, car ce groupe avait les arguments pour aller plus loin. Mais dans le football mondial, les intentions ne suffisent pas.',
  'Le Mondial continue sans {team}. Dans le vestiaire, les joueurs peinent à réaliser. Ils sont venus avec des rêves plein la tête — certains ne reviendront jamais sur cette scène. La Coupe du Monde est sans pitié pour ceux qui ne saisissent pas leur chance.',
  '{team} était venu pour marquer les esprits à la Coupe du Monde. Il repart avec une élimination précoce et beaucoup de questions. Qu\'est-ce qui a raté ? Les résultats. Et les résultats, sur la scène mondiale, ne mentent pas.',
  '"On a tout donné, mais ce n\'était pas assez." Le capitaine de {team} avait le regard vide en quittant le terrain pour la dernière fois dans ce Mondial. Une élimination en phase de groupes reste une blessure qui met du temps à cicatriser.',
];

// Templates dopage — joueur (suspension individuelle) ──────────────────────

const DOPING_PAIRS: [string, string][] = [
  [
    'DOPAGE : {player} ({team}) contrôlé positif — suspension immédiate',
    'Le contrôle antidopage effectué après le dernier match de {team} a révélé la présence d\'une substance interdite chez {player}. La commission disciplinaire a prononcé une suspension pour le reste de la compétition. Le joueur conteste les résultats.',
  ],
  [
    'SCANDALE DOPAGE chez {team} — {player} suspendu, la compétition sous le choc',
    'Un résultat de contrôle positif tombe comme un couperet sur {team}. {player} est suspendu pour l\'intégralité de la compétition. La fédération parle d\'un "signal fort envoyé à tous les participants".',
  ],
  [
    '{team} frappé par un cas de dopage — {player} écarté définitivement',
    'La nouvelle a éclaté dans la nuit : {player} a été contrôlé positif lors d\'un test inopiné. Suspension immédiate et définitive pour cette compétition. Le staff de {team} dit n\'avoir "rien su, rien vu".',
  ],
  [
    'Contrôle antidopage positif chez {team} — {player} visé, une ombre sur la compétition',
    '{player} ({team}) a été contrôlé positif à une substance anabolisante. La fédération a statué rapidement : suspension immédiate pour le reste de la compétition. L\'entourage du joueur prépare un recours, mais la sanction s\'applique sans délai.',
  ],
  [
    '{team} : {player} suspendu pour dopage — le vestiaire sous le choc',
    'L\'annonce est tombée en plein milieu de la compétition. {player} a été testé positif lors d\'un contrôle surprise. Le joueur est suspendu immédiatement. Ses coéquipiers, visiblement ébranlés, n\'ont pas souhaité commenter.',
  ],
];

// ── Templates dopage — équipe (disqualification collective) ──────────────────

const TEAM_DOPING_PAIRS: [string, string][] = [
  [
    'DISQUALIFICATION : {team} exclu de la compétition pour dopage systématique',
    'La commission antidopage a conclu à des pratiques organisées au sein de {team}. Plusieurs membres du groupe auraient bénéficié d\'un protocole de dopage coordonné. La sanction est immédiate et sans appel : {team} est disqualifié. Tous ses résultats sont annulés.',
  ],
  [
    'CHOC : {team} expulsé de la compétition — affaire de dopage collectif',
    'Ce que tout le monde redoutait est arrivé. Une enquête approfondie a révélé que le dopage au sein de {team} n\'était pas un cas isolé. C\'est le staff médical entier qui est visé. La fédération n\'a pas hésité : exclusion immédiate. Les matchs restants de {team} seront attribués 3-0 à leurs adversaires.',
  ],
  [
    'SCANDALE HISTORIQUE : {team} rayé de la compétition après enquête antidopage',
    'La décision de la commission est tombée comme un couperet : {team} est disqualifié pour le reste de la compétition. L\'enquête a mis au jour un système de dopage organisé impliquant plusieurs joueurs et membres du staff. Une page sombre pour cette édition de la compétition.',
  ],
  [
    '{team} banni — la compétition perd l\'un de ses participants dans des circonstances effroyables',
    'Le rêve de {team} s\'arrête brutalement, non pas sur le terrain, mais dans les coulisses. La fédération a prononcé la disqualification après avoir établi l\'existence d\'un programme de dopage institutionnalisé. Les matchs à venir de {team} seront forfaits. Une honte pour le sport.',
  ],
];


// Niveau 3 supplémentaires — ton encore plus cru
const CRITIQUE_HEADLINES_L3_EXTRA = [
  '{team} : une dégelée que le football n\'oubliera pas de sitôt',
  'MASSACRE : {team} ne joue plus au football, il subit',
  '{team} — c\'est pas du foot, c\'est une correction infligée à des touristes',
  '{team} : rentrez chez vous, vous n\'avez rien à faire ici',
  'Honte nationale : {team} se fait démolir sans bouger un sourcil',
  '{team} désintégré — une catastrophe industrielle de 90 minutes',
  'Ce qu\'on a vu ce soir avec {team} dépasse l\'entendement humain',
  '{team} : l\'équipe qui a inventé la capitulation comme style de jeu',
  '{team} : bande de branquignols en short — le foutage de gueule intégral',
  'Onze mecs, zéro couille : {team} a chié dans les grandes largeurs',
  '{team}, c\'est même plus une équipe, c\'est un guichet à buts encaissés',
  'Que quelqu\'un rende leur dignité aux supporters de {team} — eux au moins étaient venus',
];

const CRITIQUE_BODIES_L3_EXTRA = [
  'Qu\'est-ce qu\'on vient de voir ? {team} s\'est fait ouvrir en deux comme une bûche. Chaque contre adverse finissait au fond. Chaque balle en profondeur traversait la défense comme du papier mouillé. Aucun duel gagné, aucune réaction, aucune fierté. Ce groupe est fini.',
  'C\'est pas une défaite, c\'est une autopsie. {team} est mort tactiquement dès la 10e minute et personne n\'a bougé. Le coach a changé des joueurs — de nuls contre des nuls. Résultat identique. On se demande sincèrement ce que ces gens foutent là.',
  'Chaque fois qu\'on pensait que {team} ne pouvait pas tomber plus bas, ils trouvaient un étage en dessous. Ce soir, ils ont découvert le sous-sol. Passons : il n\'y a rien à analyser ici. Rien à sauver. Juste à tirer la chasse.',
  'Les adversaires s\'amusaient. Littéralement. Ils ricanaient entre eux en se passant le ballon face à {team} planté au milieu du terrain comme des poteaux. Et la réaction ? Quelques jurons, deux-trois gestes d\'énervement, retour à l\'hôtel. Scandaleux.',
  'On a compté les duels gagnés par {team} en seconde mi-temps. Deux. Deux sur quarante-cinq minutes. C\'est pas une stat de football, c\'est un crime contre le sport. Ce résultat est une punition juste et insuffisante à la fois.',
  'Faut le dire clairement : {team} nous a chié une purge de 90 minutes qu\'on aurait payé pour ne pas voir. Aucune intensité, aucune idée, aucune honte. Ils touchent un salaire pour ça ? Qu\'on nous rembourse.',
  'Le niveau affiché par {team} ce soir insulte quiconque a déjà tapé dans un ballon. Des piquets auraient mieux défendu. Des enfants auraient mieux couru. On ne perd pas comme ça — on abandonne. Et {team} a abandonné.',
  'Y a des défaites qu\'on encaisse et des défaites qui puent. Celle de {team} pue. Pue le renoncement, pue le je-m\'en-foutisme, pue une équipe qui a déjà la tête aux vacances. Écœurant, du premier au dernier.',
  'Comment on appelle onze types payés pour courir et qui refusent de courir ? Des imposteurs. {team} a aligné onze imposteurs ce soir, et l\'adversaire s\'est servi comme dans un buffet à volonté. Pathétique.',
];

// ── Crise niveau supplémentaire — ton plus cru et direct ─────────────────────
const CRISE_HEADLINES_EXTRA = [
  '{team} à la ramasse : le groupe s\'effondre en direct',
  'Putain mais qu\'arrive-t-il à {team} ? Naufrage collectif total',
  '{team} : plus rien ne tourne rond — c\'est la panique dans les rangs',
  'Catastrophe {team} : ambiance de fin de règne dans le vestiaire',
  '{team} en chute libre — le groupe perd les pédales',
  'Tout fout le camp chez {team} — et personne ne sait comment stopper l\'hémorragie',
  '{team} : le vestiaire est un champ de mines, le terrain un désastre',
  'C\'est foutu ? Les questions qui font mal chez {team}',
  '{team} part en couilles : clans, coups bas et un coach dépassé',
  'Le bordel total chez {team} — plus personne ne tient la baraque',
  '{team} : ça se tire dans les pattes pendant que le bateau coule',
  'Fin de règne puante chez {team} — l\'odeur du sabotage interne',
];

const CRISE_BODIES_EXTRA = [
  'La situation chez {team} dépasse les simples mauvais résultats. C\'est une crise profonde, systémique, qui touche tout le monde — joueurs, staff, dirigeants. Des sources internes parlent de "chaos organisé". Plus personne ne sait qui décide quoi, pourquoi, et comment. Et ça se voit sur le terrain.',
  'Des noms claquent dans le vestiaire de {team}. Des accusations fusent entre joueurs. Deux clans se regardent en chiens de faïence depuis plusieurs jours. Le staff fait semblant de ne pas voir. Mais tout le monde voit. Et tout le monde sait que ça ne peut pas durer.',
  'Le sélectionneur de {team} a convoqué l\'ensemble du groupe pour une réunion de crise. Deux heures de huis clos. À l\'issue : aucune déclaration, aucune image, aucun mot. Juste des visages fermés et des regards qui ne se croisent plus. On tire ses propres conclusions.',
  'Un joueur de {team} a refusé de participer à l\'échauffement ce matin. Le staff a géré en interne. Un autre aurait demandé à être libéré du groupe. Ces informations, démenties officiellement, sont confirmées par plusieurs sources proches du vestiaire. {team} est en train d\'imploser.',
  'Ce n\'est plus de la mauvaise passe — c\'est de la décomposition. {team} ne joue plus pour gagner. Il joue pour que ça finisse. Les automatismes ont disparu, la confiance aussi. Ce qui reste, c\'est une collection d\'individualités qui cohabitent sans se parler. Une équipe qui s\'effondre à petit feu.',
  'Appelons un chat un chat : {team} est en train de crever de l\'intérieur. Les joueurs se détestent, le staff ment, les dirigeants planquent la merde sous le tapis. Et sur le terrain, ça donne le naufrage qu\'on voit chaque semaine. Personne ne veut prendre ses responsabilités — alors tout le monde coule.',
  'Un joueur cadre de {team}, sous couvert d\'anonymat : "On n\'en peut plus, c\'est le bordel du matin au soir." Voilà l\'état réel du groupe. Pas une crise de résultats — une faillite humaine. Et ça ne se répare pas avec un discours de motivation à deux balles.',
  'Le vestiaire de {team} pue la trahison. Des joueurs qui balancent en off, un coach qui se sait condamné et qui s\'accroche, des dirigeants aux abonnés absents. C\'est plus une équipe de foot, c\'est une émission de télé-réalité pourrie où tout le monde poignarde tout le monde.',
];

// ── Révolte niveau supplémentaire — ultra-cru ────────────────────────────────
const REVOLTE_HEADLINES_EXTRA = [
  'La fédération {team} prise d\'assaut — nuit de chaos total',
  '{team} : les supporters pètent les plombs, la fédération barricadée',
  'RÉVOLUTION : {team} à feu et à sang devant la fédération',
  '"Tous dehors !" — les ultras de {team} n\'ont plus de limites',
  '{team} : émeute nocturne, la fédération sous les projectiles',
  'ON EN PEUT PLUS : {team} déclenche la révolution populaire',
  '{team} : les supporters ont pété un câble — scènes surréalistes cette nuit',
  '"On va tout brûler si vous partez pas" — le message des fans de {team}',
  '"Cassez-vous, bande de parasites" — {team} au bord de l\'insurrection',
  '{team} : la fédé assiégée, les dirigeants planqués comme des rats',
  'Nuit de guerre chez {team} — les fans ne veulent plus de prisonniers',
  '"Dégagez ou on vous sort" — les ultras de {team} passent à l\'ultimatum',
];

const REVOLTE_BODIES_EXTRA = [
  'On n\'avait jamais vu ça. Des centaines de supporters de {team} ont convergé vers la fédération dans la nuit, équipés de fumigènes, de cornes de brume et d\'une rage froide. Vitres brisées au rez-de-chaussée. Portes forcées. La police antiémeute a été déployée à 3h du matin. Les membres du comité n\'ont pas bougé de leurs bureaux. Des lâches retranchés derrière des vitres blindées pendant que leur sport brûle.',
  '"Vous nous avez menti, vous nous avez volé, vous nous avez humiliés." La banderole déployée devant la fédération de {team} résumait le sentiment général. Les supporters n\'étaient pas venus manifester — ils étaient venus exiger. Aucun délégué fédéral n\'a daigné se montrer. L\'erreur de leur vie.',
  'La nuit de {team} restera dans les annales. Bouteilles, fumigènes, chants de mort contre le comité. Un ancien international a tenté de calmer la foule depuis un mégaphone improvisé — il s\'est fait huer. Personne ne représente plus rien dans cette fédération. La rue a pris le pouvoir. Et la rue n\'est pas rassasiée.',
  'C\'est pas un mouvement de colère. C\'est un verdict populaire. Les supporters de {team} ont condamné le comité à mort publique ce soir devant la fédération. Cocktails Molotov pas encore lancés, mais l\'atmosphère y était. La police parle de "situation explosive". Un responsable local confie : "On ne sait pas jusqu\'où ça peut aller." Signe que personne ne contrôle plus rien.',
  '"Remboursez nos larmes." Ce message tagué sur la facade de la fédération {team} résume une décennie d\'humiliation. Les supporters n\'ont plus rien à perdre — et ça se voyait cette nuit. Aucune crainte, aucun recul, aucune retenue. Le point de rupture est dépassé depuis longtemps. Ce soir, il a juste été rendu visible.',
  '"Ces enculés nous prennent pour des cons depuis des années." La phrase, hurlée dans un mégaphone devant la fédération de {team}, a été reprise en chœur par des milliers de gorges. Fumigènes, barrières arrachées, tôles défoncées. Les dirigeants planqués n\'ont pas osé montrer un cheveu. Bande de lâches jusqu\'au bout.',
  'On ne manifeste plus chez {team} — on assiège. Le siège fédéral a passé la nuit sous les projectiles, les insultes et les menaces de mort à peine voilées. "Ils ont tué notre club, on va leur rendre la monnaie", crachait un ultra encagoulé. La haine est totale, froide, définitive. Rien ne l\'apaisera à part des démissions.',
  'Ce n\'est plus de la colère, c\'est de la rage pure. Les supporters de {team} veulent des têtes, et ils l\'ont dit sans détour : "Qu\'ils crèvent, ces voleurs." La fédé, retranchée, appelle au calme depuis un communiqué lâche. Personne n\'écoute. Personne ne pardonne. La rue a tranché, et le verdict est sans appel.',
];

// ── Journalistes fictifs pour les critiques ───────────────────────────────────
const JOURNALISTS: { name: string; outlet: string }[] = [
  { name: 'Marco Ferreira', outlet: 'Gazette Sportive Mondiale' },
  { name: 'Élodie Marchetti', outlet: 'Le Quotidien du Ballon' },
  { name: 'Dmitri Volkov', outlet: 'Sport Tribune International' },
  { name: 'Hassan Al-Rashid', outlet: 'Revue Football Global' },
  { name: 'Ingrid Svensson', outlet: 'Le Monde du Football' },
  { name: 'Paulo Nascimento', outlet: 'Football Hebdomadaire' },
  { name: 'Yuki Tanaka', outlet: 'Analyse Sport' },
  { name: 'Christophe Duval', outlet: 'L\'Observateur Sportif' },
  { name: 'Amara Diallo', outlet: 'Tribune des Nations' },
  { name: 'Elena Kovaleva', outlet: 'Sport & Vérité' },
  { name: 'Jorge Mendoza', outlet: 'Le Panorama Footballistique' },
  { name: 'Lukas Bauer', outlet: 'Foot Analyse Europe' },
  { name: 'Fatima Okonkwo', outlet: 'L\'Indépendant Sportif' },
  { name: 'René Delacroix', outlet: 'La Plume du Stade' },
  { name: 'Soo-Jin Park', outlet: 'Revue Internationale du Sport' },
  { name: 'Aurélien Vasseur', outlet: 'Le Sifflet' },
  { name: 'Nadia Benkacem', outlet: 'Contre-Pied Magazine' },
  { name: 'Björn Eriksen', outlet: 'Stade & Vestiaires' },
  { name: 'Camille Fontaine', outlet: 'La Minute de Jeu' },
  { name: 'Ademola Adeyemi', outlet: 'Planète Crampons' },
];

// ── Polémique arbitrale — article dédié quand l'arbitre marque le match ──────
const ARBITRAGE_PAIRS: [string, string][] = [
  [
    'Arbitrage en question : {referee} a-t-il tué le match {homeTeam} – {awayTeam} ?',
    '{cards} cartons. C\'est le bilan de {referee} sur cette rencontre. Réputé {temperament}, l\'homme en noir a haché le jeu coup de sifflet après coup de sifflet. Les deux bancs ont terminé la soirée debout à protester. Le corps arbitral défendra son homme — comme toujours. Mais les images, elles, sont éloquentes.',
  ],
  [
    '{referee} au centre de toutes les conversations après {homeTeam} – {awayTeam}',
    'On devrait parler du score ({score}). On ne parle que de l\'arbitre. {referee}, connu pour être {temperament}, a rythmé le match à coups de cartons — {cards} au total. À chaque décision, la tension montait d\'un cran. Certains arbitres apaisent les matchs. D\'autres les électrisent. Ce soir, chacun jugera dans quelle catégorie il se range.',
  ],
  [
    'Cartons en rafale : la soirée agitée de {referee}',
    'Le tableau disciplinaire de {homeTeam} – {awayTeam} donne le tournis : {cards} cartons distribués par {referee}. Un arbitrage {temperament} qui a fini par prendre le pas sur le football. Les deux staffs, une fois n\'est pas coutume, sont d\'accord sur un point : "On n\'a jamais pu jouer."',
  ],
];
const ARBITRAGE_RED_PAIRS: [string, string][] = [
  [
    'Rouge polémique : {referee} a sorti le carton qui a tout changé',
    'L\'expulsion sifflée par {referee} restera comme LE tournant de {homeTeam} – {awayTeam} ({score}). Décision sévère ou justifiée ? Le débat fait rage dans les tribunes et les rédactions. Une chose est sûre : avec un arbitre réputé {temperament}, mieux vaut éviter le moindre geste limite.',
  ],
  [
    '{homeTeam} – {awayTeam} : le match a basculé sur un carton rouge',
    'Un match à onze contre onze, puis plus rien. Le rouge brandi par {referee} a déséquilibré la rencontre et relégué le football au second plan. Score final : {score}. La commission d\'arbitrage examinera la décision — les supporters, eux, ont déjà rendu leur verdict.',
  ],
];

/**
 * Article dédié à l'arbitrage — déclenché quand le match a été marqué par les
 * cartons (≥7) ou une expulsion d'un arbitre au profil marqué. ~50% des cas.
 */
export function generateRefereePressItem(opts: {
  round: number;
  seed: string;
  facts: MatchFacts;
  matchId?: string;
  matchSnapshot: NonNullable<PressItem['matchSnapshot']>;
}): PressItem | null {
  const ref = opts.facts.referee;
  if (!ref) return null;
  const reds = opts.facts.redCards.home.length + opts.facts.redCards.away.length;
  const totalCards = opts.facts.yellowCount.home + opts.facts.yellowCount.away + reds;
  const hotProfile = ref.cardStrictness >= 1.25 || ref.redTendency >= 1.4;
  const triggered = totalCards >= 7 || (reds >= 1 && hotProfile) || reds >= 2;
  if (!triggered) return null;
  const r = rng(opts.seed + 'arbitrage');
  if (r() >= 0.5) return null;

  const snap = opts.matchSnapshot;
  const inject = (s: string) => s
    .replace(/{referee}/g, ref.name)
    .replace(/{temperament}/g, ref.temperament)
    .replace(/{cards}/g, String(totalCards))
    .replace(/{homeTeam}/g, snap.homeTeamName)
    .replace(/{awayTeam}/g, snap.awayTeamName)
    .replace(/{score}/g, `${snap.homeScore}-${snap.awayScore}`);
  const [h, b] = pick(reds >= 1 ? ARBITRAGE_RED_PAIRS : ARBITRAGE_PAIRS, r);
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: null,
    category: 'arbitrage',
    headline: inject(h),
    body: inject(b),
    createdAt: new Date().toISOString(),
    matchId: opts.matchId,
    matchSnapshot: snap,
    mentions: [ref],
    journalist: pick(JOURNALISTS, r),
  };
}

/** Communiqué CMF discipline — match très haché (2 rouges ou ≥9 cartons), ~50% des cas */
export function generateCmfDisciplineItem(opts: {
  round: number;
  seed: string;
  facts: MatchFacts;
  matchId?: string;
  matchSnapshot?: NonNullable<PressItem['matchSnapshot']>;
}): PressItem | null {
  const reds = opts.facts.redCards.home.length + opts.facts.redCards.away.length;
  const total = opts.facts.yellowCount.home + opts.facts.yellowCount.away + reds;
  if (!(reds >= 2 || total >= 9)) return null;
  const r = rng(opts.seed + 'cmfdiscipline');
  if (r() >= 0.5) return null;
  return generateCmfCommunique({
    round: opts.round,
    seed: opts.seed,
    type: 'discipline',
    matchId: opts.matchId,
    matchSnapshot: opts.matchSnapshot,
  });
}

// ── Presse hostile / critique ─────────────────────────────────────────────────
// Niveau 1 : défaite normale — ton journalistique acerbe
const CRITIQUE_HEADLINES_L1 = [
  '{team} : la honte de la journée',
  '{team} sombres, sans âme, sans idées',
  'Nuls, ternes, inutiles : {team} au fond du gouffre',
  '{team} : prestation indigne, résultat logique',
  '{team} ne méritait pas de gagner — et ça s\'est vu',
  'Zéro, néant, rien : {team} n\'existe plus sur un terrain',
  '{team} : encore une débâcle collective à oublier',
  'Catastrophe {team} : le niveau est alarmant',
  '{team} en mode figurant — encore une fois',
  'L\'effarante médiocrité de {team} confirmée ce soir',
];

const CRITIQUE_BODIES_L1 = [
  'On cherche encore où était {team} sur ce terrain. Absents physiquement, inexistants tactiquement, incapables de produire le moindre football digne de ce nom. Ce n\'est pas une défaite, c\'est un aveu d\'impuissance. Le staff doit se poser des questions sérieuses.',
  'Aucune envie, aucun pressing, aucune solution. {team} a rendu une copie blanche et s\'en est tiré avec un score qui flatte encore leur prestation. La direction technique ne peut pas rester les bras croisés face à une telle régression.',
  '{team} confirme ce que tout le monde voit depuis plusieurs matchs : ce groupe est en crise profonde. Les automatismes n\'existent pas, la confiance est en miettes, et les individualités ne compensent plus le manque de collectif.',
  'On attendait un sursaut d\'orgueil. On a eu droit à la même soupe tiède, molle et sans saveur. {team} joue sans conviction, sans intensité, sans le moindre signe d\'une équipe qui veut vraiment aller de l\'avant.',
  'Les supporters de {team} méritent mieux que ça. Beaucoup mieux. Ce groupe ne se bat pas, ne court pas, ne joue pas. Il subit. Et ce soir, tout le monde l\'a vu.',
];

// Niveau 2 : grosse défaite (-3) — supporters en colère
const CRITIQUE_HEADLINES_L2 = [
  '{team} : bande de bras cassés',
  '{team} — une honte, une vraie honte',
  'Scandaleux : {team} se fait massacrer sans réagir',
  '{team} : des touristes en compétition internationale',
  'Nuls à chier : {team} se ridiculise',
  '{team} : la pire prestation de la saison, et c\'est dire',
  'Allez vous cacher : {team} est une catastrophe ambulante',
  '{team} démonté, humilié, écœurant',
  'On a honte pour eux : {team} n\'est plus une équipe',
  '{team} : ce groupe ne sait pas ce qu\'est la compétition',
];

const CRITIQUE_BODIES_L2 = [
  'C\'est quoi ce football de merde ? {team} s\'est fait découper en morceaux sans opposer la moindre résistance. Pas de pressing, pas de duels gagnés, pas de tirs cadrés. Rien. Des joueurs payés pour jouer au football qui n\'ont pas foutu grand-chose sur ce terrain. La honte.',
  '{team} s\'est couché dès la première mi-temps. Ces gars-là ont l\'air de s\'en foutre royalement. Pas de réaction, pas d\'orgueil, pas de caractère. C\'est une bande de joueurs sans couilles qui méritent exactement ce qu\'ils récoltent ce soir.',
  'On peut pas appeler ça du football. {team} a couru à côté des ballons, raté ses passes, subi chaque duel. À un moment, faut avoir la décence de se remettre en question plutôt que de serrer des mains et rentrer à l\'hôtel comme si de rien n\'était. Affligeant.',
  'Les supporters qui ont fait le déplacement méritent un remboursement et des excuses. {team} n\'a pas joué ce soir. Il a juste été présent physiquement sur un terrain, sans âme, sans combativité, sans le début d\'une idée de football. Une honte collective.',
  'Désastre total pour {team}. Vous pouvez mettre ça sur le compte de la malchance ou de la fatigue si ça vous fait du bien — mais la vérité c\'est que cette équipe est nulle. Nulle collectivement, nulle tactiquement, et quelques-uns sont nuls individuellement. Voilà.',
];

// Niveau 3 : humiliation (-4 et plus) — ultra-cru
const CRITIQUE_HEADLINES_L3 = [
  '{team} au poteau — exécution publique',
  'Putain mais c\'est quoi ce cirque ? {team} désintégré',
  '{team} : on vient d\'assister à une scène de crime',
  'Dissolution immédiate demandée : {team} n\'a pas sa place ici',
  '{team} tartinés dans tous les sens — humiliation totale',
  '{team} — score de correctionnelle, prestation de honte absolue',
  'Ces joueurs de {team} devraient avoir honte de sortir du vestiaire',
  '{team} atomisé : une déroute historique qui va laisser des traces',
  '{team} : ça méritait une raclée, ils l\'ont eue. Et encore.',
  'Qui a envoyé {team} en compétition ? Une blague de mauvais goût.',
];

const CRITIQUE_BODIES_L3 = [
  'On ne sait même pas par où commencer. {team} s\'est fait massacrer dans tous les compartiments du jeu. C\'est catastrophique, c\'est une humiliation absolue, et c\'est totalement mérité. Ces joueurs ne méritent pas de fouler un terrain international. Point.',
  'C\'est une scène de crime. {team} s\'est fait éventrer, découper, ridiculiser. Et le pire dans tout ça ? Personne n\'a réagi. Pas de rage, pas de fierté blessée, rien. Des fantômes en maillot qui regardent les buts rentrer sans même avoir l\'air d\'en avoir quelque chose à faire.',
  'Allez, on va être honnête : {team} n\'avait rien à faire dans cette compétition. Cette raclée le confirme. Des joueurs à la ramasse, un coach dépassé par les événements, un système de jeu inexistant. Le score reflète parfaitement l\'écart de niveau. Et encore, c\'est gentil.',
  'Cette défaite devrait entrer dans les annales de la médiocrité. {team} n\'a pas seulement perdu — il s\'est désintégré, effondré, sabordé. Chaque joueur a sa part de responsabilité dans cette déroute honteuse qui va marquer les esprits longtemps. Rentrez chez vous.',
  'Y\'a des soirées où on ferme les yeux et on essaie d\'oublier. Ce soir avec {team}, c\'est raté : impossible d\'oublier une telle boucherie. Cette équipe est une insulte au football. Les supporters qui ont eu la malchance de regarder ça ont droit à des excuses publiques.',
];

// Suffixes coach virulents pour critiques
const CRITIQUE_COACH_L1 = [
  `Les choix tactiques de {coach} sont incompréhensibles depuis plusieurs matchs.`,
  `{coach} n'a pas les solutions. Ça commence à se voir.`,
  `La question de l'avenir de {coach} à ce poste se pose sérieusement.`,
  `{coach} sort de ce match sans réponses et sans crédibilité.`,
];
const CRITIQUE_COACH_L2 = [
  `{coach} est responsable de ce naufrage. Ses choix sont catastrophiques.`,
  `Comment {coach} peut encore aligner cette équipe dans cet état ? Mystère.`,
  `{coach} est dépassé, dépassé, dépassé. Le groupe ne croit plus en lui.`,
  `Après ça, {coach} doit se remettre en question — ou se faire remplacer.`,
];
const CRITIQUE_COACH_L3 = [
  `{coach} devrait démissionner ce soir même. Cette équipe ne va nulle part sous sa direction.`,
  `C'est quoi le plan de {coach} ? Parce que là, y'en a manifestement pas.`,
  `{coach} est complètement perdu et son équipe avec lui. Un désastre humain et tactique.`,
  `{coach} a perdu son groupe, perdu ses idées, perdu la face. L'heure du bilan a sonné.`,
];

// Suffixes joueur virulents pour critiques
const CRITIQUE_PLAYER_L1 = [
  `{player} a encore disparu quand l'équipe en avait besoin.`,
  `On attendait que {player} se lève — il est resté assis.`,
  `{player} en deçà de tout ce soir. Très en deçà.`,
];
const CRITIQUE_PLAYER_L2 = [
  `{player} a été inexistant. Fantôme. Absent total.`,
  `Ce soir, {player} n'a rien apporté. Strictement rien.`,
  `{player} est passé complètement à côté de sa soirée — et ce n'est pas la première fois.`,
];
const CRITIQUE_PLAYER_L3 = [
  `{player} aurait mieux fait de rester au vestiaire.`,
  `On paie {player} pour ça ? Affligeant.`,
  `{player} : prestation catastrophique dans un collectif catastrophique.`,
];

// ─────────────────────────────────────────────────────────────────────────────

// ── Templates corruption arbitre — révèle le scandale ────────────────────────
const REFEREE_REVEALS_PAIRS: [string, string][] = [
  [
    'BOMBE : l\'arbitre du match de {team} révèle une tentative de corruption',
    'L\'arbitre central a brisé le silence : un intermédiaire lié à {team} l\'aurait approché avant la rencontre pour lui offrir une somme conséquente en échange d\'un arbitrage favorable. Il a refusé et décidé de tout révéler. L\'affaire est désormais entre les mains de la CMF.',
  ],
  [
    'CHOC : l\'arbitre dénonce {team} — une tentative de corruption confirmée',
    'Dans une déclaration fracassante, l\'arbitre de la rencontre affirme avoir été sollicité par des proches de {team} pour infléchir ses décisions. Il a conservé les preuves et les a transmises à la fédération. La CMF a ouvert une enquête en urgence.',
  ],
  [
    '{team} dans la tourmente : l\'arbitre révèle tout à la presse',
    'Il a choisi de parler. L\'arbitre du dernier match de {team} a accordé une interview exclusive révélant qu\'il avait reçu des propositions financières en échange d\'une aide discrète lors de la rencontre. Refus immédiat de sa part. Tempête sur {team}.',
  ],
];

// ── Templates corruption arbitre — refuse & dénonce → sanction ───────────────
const REFEREE_REPORTED_POINTS_PAIRS: [string, string][] = [
  [
    'CMF — Corruption avérée : {team} sanctionné de 3 points',
    'Après enquête express, la CMF a établi qu\'un représentant de {team} a tenté de corrompre l\'arbitre de la rencontre. Sanction immédiate : retrait de 3 points au classement. L\'arbitre est salué pour son intégrité. {team} conteste mais la décision est irrévocable.',
  ],
  [
    'OFFICIEL CMF : {team} perd 3 points pour tentative de corruption d\'arbitre',
    'La commission disciplinaire a statué en 24h : la tentative de corruption avérée coûte 3 points à {team}. L\'arbitre, qui a transmis les preuves dès le lendemain du match, est protégé et salué. Un signal fort envoyé à l\'ensemble de la compétition.',
  ],
];

const REFEREE_REPORTED_DISQUALIF_PAIRS: [string, string][] = [
  [
    'CMF — Corruption en phase finale : {team} disqualifié sur décision disciplinaire',
    'La tentative de corruption de l\'arbitre par des membres de la délégation de {team} a été prouvée. En phase finale de compétition, la CMF applique la tolérance zéro : {team} est immédiatement disqualifié. Son adversaire avance. Une décision historique et dévastratrice pour {team}.',
  ],
  [
    'SANCTION MAXIMALE : {team} exclu de la compétition pour corruption d\'arbitre',
    'L\'enquête diligentée après le signalement de l\'arbitre n\'a laissé aucun doute. {team} est éliminé de la compétition sur décision disciplinaire. La CMF rappelle que l\'intégrité sportive est non négociable. Un scénario cauchemardesque pour {team}.',
  ],
];

const REFEREE_REPORTED_WALKOVER_PAIRS: [string, string][] = [
  [
    'CMF — Corruption avérée : l\'adversaire de {team} vainqueur sur tapis vert',
    'L\'arbitre du barrage opposant {team} à son adversaire a dénoncé une tentative de corruption. La CMF a statué en urgence : le match est annulé, l\'adversaire de {team} est déclaré qualifié sur tapis vert (3-0). {team} est éliminé sans recours possible.',
  ],
  [
    'BARRAGE ANNULÉ : {team} perd sur tapis vert après dénonciation d\'arbitre',
    'Une tentative de corruption dénoncée par l\'arbitre du barrage a conduit la CMF à annuler le résultat du terrain. L\'adversaire de {team} est qualifié d\'office. La commission disciplinaire a agi en 48h. Pour {team}, le cauchemar est total.',
  ],
];

// ── Templates CMF — enquête ouverte (ref dénonce, avant jugement) ─────────────
const CMF_ENQUETE_PAIRS: [string, string][] = [
  [
    'CMF — Enquête ouverte : {team} visé après dénonciation arbitrale',
    'L\'arbitre de la rencontre impliquant {team} a transmis à la CMF une déclaration officielle faisant état d\'une tentative de corruption avant le coup d\'envoi. Une enquête disciplinaire est désormais ouverte. Le verdict est attendu lors de la prochaine journée.',
  ],
  [
    'CHOC : l\'arbitre dénonce {team} — la CMF saisie en urgence',
    'Coup de théâtre : l\'arbitre central a refusé un pot-de-vin proposé par des représentants de {team} et a immédiatement saisi la commission disciplinaire de la CMF. Une enquête express est lancée. La sanction pourrait tomber dès le prochain match.',
  ],
  [
    '{team} sous enquête CMF après approche d\'arbitre avortée',
    'Des informations troublantes circulent : l\'arbitre désigné pour le match de {team} aurait été approché et aurait tout refusé avant de dénoncer les faits. La CMF a confirmé l\'ouverture d\'une procédure d\'enquête accélérée. Le spectre du tapis vert plane.',
  ],
];

// ── Templates CMF — jugement rendu, walkover appliqué ────────────────────────
const CMF_JUGEMENT_WALKOVER_PAIRS: [string, string][] = [
  [
    'CMF — Jugement rendu : {team} perd le match sur tapis vert',
    'L\'enquête ouverte suite à la dénonciation de l\'arbitre s\'est conclue rapidement. La CMF a statué : la tentative de corruption est avérée. Le match de {team} est annulé, son adversaire déclaré vainqueur 3-0. Une sanction historique qui marque durablement cette compétition.',
  ],
  [
    'OFFICIEL : {team} disqualifié du match pour corruption après enquête CMF',
    'La commission disciplinaire a rendu son verdict : {team} perd le bénéfice du résultat obtenu sur le terrain. La tentative de corruption de l\'arbitre, dénoncée en amont, est considérée comme prouvée. Tapis vert 3-0 pour l\'adversaire. {team} peut faire appel, sans effet suspensif.',
  ],
  [
    '{team} sanctionné : tapis vert après jugement CMF express',
    'En moins de 48h, la CMF a bouclé son enquête sur la tentative de corruption visant l\'arbitre de la rencontre précédente de {team}. Verdict sans appel : le résultat du terrain est annulé, le match attribué 3-0 à l\'adversaire. L\'intégrité de la compétition est sauve.',
  ],
];

// ── Templates CMF — jugement rendu, classé sans suite ────────────────────────
const CMF_JUGEMENT_ACQUITTE_PAIRS: [string, string][] = [
  [
    'CMF — Enquête classée : {team} blanchi malgré les soupçons',
    'La commission disciplinaire a conclu son enquête sans retenir de charges suffisantes contre {team}. Les preuves transmises par l\'arbitre n\'ont pas permis d\'établir formellement la culpabilité du club. L\'affaire est classée sans suite, mais le doute subsiste.',
  ],
  [
    'Rebondissement : {team} échappe à la sanction CMF — enquête classée',
    'Contre toute attente, la CMF a décidé de classer l\'enquête visant {team}. Les éléments factuels recueillis n\'étaient pas suffisants pour prononcer une sanction sportive. {team} retrouve sa sérénité, mais son image reste ternie. La compétition continue.',
  ],
  [
    'CMF — Jugement : {team} acquitté, résultat maintenu',
    'L\'enquête disciplinaire ouverte après la dénonciation de l\'arbitre s\'est soldée par un non-lieu. La commission n\'a pas pu établir avec certitude la responsabilité de {team}. Le résultat du terrain est donc maintenu. Une décision qui fera débat.',
  ],
];

export type RefereeCorruptionOutcome =
  | { kind: 'revealed' }       // arbitre révèle — CMF communiqué corruption (ancien comportement)
  | { kind: 'refused_reported'; penalty: 'points' | 'disqualified' | 'walkover' };

export type MatchPressResult = {
  item: PressItem;
  dopingSuspension: Suspension | null;
  teamDisqualified: boolean;
  refereeCorruption?: RefereeCorruptionOutcome;
};

export function generateMatchPressItem(opts: {
  round: number;
  teamId: string;
  teamName: string;
  goalsFor: number;
  goalsAgainst: number;
  moraleBefore: number;
  moraleAfter: number;
  seed: string;
  /** CompMatch.phase — 'group' | 'league' | 'R32' | 'R16' | 'QF' | 'SF' | 'F' | '3rd' */
  phase?: string;
  /** Format de la compétition — conditionne le discours (titre vs qualification vs zones LPM) */
  format?: 'league' | 'cup' | 'groups_knockout' | 'lpm';
  /** Current standing of this team in its group/league */
  standing?: Standing;
  /** Total teams in the group/league (to compute rank context) */
  totalTeams?: number;
  /** Rank of this team in its group/league (1 = first) */
  rank?: number;
  /** True if team is mathematically eliminated from qualification */
  isEliminated?: boolean;
  /** True if team is in relegation/playoff danger zone (LPM 25-40, league bottom) */
  isInDangerZone?: boolean;
  /** teamIds already banned for doping this competition — prevents re-roll */
  dopingBannedTeamIds?: string[];
  /** If another team already had a doping event this match, skip player doping roll */
  dopingAlreadyThisMatch?: boolean;
  /** Roster of this team — used to mention a player by name in press body */
  players?: Player[];
  /** Head coach of this team — mentioned in body with overall */
  coach?: Coach;
  /** True if this match is part of a Coupe du Monde competition */
  isWorldCup?: boolean;
  /** True if a corruption deal was active on this match (CorruptionDeal.accepted) */
  corruptionEnabled?: boolean;
  /** True if the corruption was revealed (DCP check passed) — required to generate corruption scandal press */
  corruptionRevealed?: boolean;
  /** ID of the CompMatch that generated this press item */
  matchId?: string;
  /** Match snapshot for the clickable match card */
  matchSnapshot?: PressItem['matchSnapshot'];
  /** Faits réels du match — buteurs, rouges, arbitre, météo, remontada… */
  facts?: MatchFacts;
  /** Cote bookmaker pré-match de CETTE équipe (≥3 = outsider) */
  cote?: number;
}): MatchPressResult {
  const r = rng(opts.seed);
  const diff = opts.goalsFor - opts.goalsAgainst;
  const scoreStr = `${opts.goalsFor}-${opts.goalsAgainst}`;
  const sub = (s: string) => s.replace(/{team}/g, opts.teamName).replace(/{score}/g, scoreStr);
  // Camp de cette équipe dans le snapshot (pour lire les faits côté équipe)
  const mySide: 'home' | 'away' | null = opts.matchSnapshot
    ? (opts.matchSnapshot.homeTeamId === opts.teamId ? 'home' : opts.matchSnapshot.awayTeamId === opts.teamId ? 'away' : null)
    : null;
  const facts = opts.facts;
  const isBigWin = diff >= 3;
  const isManita = diff >= 5;
  const isBigLoss = diff <= -3;
  const phase = opts.phase ?? 'league';
  const isKnockout = !['group', 'league', 'lpm_playoff'].includes(phase);
  const isWorldCup = opts.isWorldCup ?? false;
  // Contexte compétition — le discours doit coller au format.
  // Format connu = source de vérité ; heuristique 40+ équipes seulement en legacy (format absent).
  const isLPMComp = opts.format
    ? opts.format === 'lpm'
    : ((phase === 'league' || phase === 'lpm_playoff') && (opts.totalTeams ?? 0) >= 40);
  // Championnat pur : pas de qualification, pas de relégation, pas d'élimination — seul le titre compte
  const isPureLeague = opts.format === 'league' && phase === 'league' && !isLPMComp;
  const isEliminated = isPureLeague ? false : (opts.isEliminated ?? false);

  let category: PressCategory;
  let headline: string;
  let body: string;
  let dopingSuspension: Suspension | null = null;
  let teamDisqualified = false;
  let refereeCorruption: RefereeCorruptionOutcome | undefined;
  const mentions: PressMention[] = [];

  // Pick a notable player to mention in body (non-GK preferred)
  const nonGK = opts.players?.filter((p) => p.position !== 'GK') ?? [];
  const pool = nonGK.length > 0 ? nonGK : (opts.players ?? []);
  // Sort by overall desc, pick from top 5 so it's a key player, weighted by seed
  const top5 = pool.slice().sort((a, b) => b.overall - a.overall).slice(0, 5);
  // Buteurs réels de cette équipe (cohérence : la presse cite celui qui a marqué)
  const myScorers = (facts?.scorers ?? []).filter((s) => s.teamId === opts.teamId);
  const goalsByScorer = new Map<string, { name: string; playerId?: string; count: number; minutes: number[] }>();
  for (const s of myScorers) {
    const key = s.playerId ?? s.name;
    const e = goalsByScorer.get(key) ?? { name: s.name, playerId: s.playerId, count: 0, minutes: [] };
    e.count++; e.minutes.push(s.minute);
    goalsByScorer.set(key, e);
  }
  const topScorerEntry = [...goalsByScorer.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  const topScorerPlayer = topScorerEntry
    ? (opts.players ?? []).find((p) => p.id === topScorerEntry.playerId || `${p.firstName} ${p.lastName}` === topScorerEntry.name) ?? null
    : null;
  // En cas de victoire/but marqué, le joueur mis en avant est le buteur — sinon top 5 overall
  const rollFeatured = top5.length > 0 ? pick(top5, r) : null;
  const featuredPlayer = (diff >= 0 && topScorerPlayer) ? topScorerPlayer : rollFeatured;
  const playerMention = featuredPlayer
    ? `${featuredPlayer.firstName} ${featuredPlayer.lastName}`
    : null;

  const alreadyDisqualified = opts.dopingBannedTeamIds?.includes(opts.teamId) ?? false;
  // Jamais si déjà disqualifié ou phase finale
  const baseAllowed = !alreadyDisqualified && !isKnockout && !opts.dopingAlreadyThisMatch;

  // Dopage joueur : 0.1% fixe (rare — max 1 par match via dopingAlreadyThisMatch)
  const playerDopingChance = baseAllowed ? 0.001 : 0;
  const isPlayerDoping = r() < playerDopingChance;

  // Dopage équipe : 0.01% indépendant, seulement si pas de dopage joueur ce tour
  const teamDopingChance = baseAllowed && !isPlayerDoping ? 0.0001 : 0;
  const isTeamDoping = r() < teamDopingChance;

  // Scandale classique : seulement si corruption activée ET révélée (DCP)
  const corruptionActive = opts.corruptionEnabled && opts.corruptionRevealed;
  const scandalChance = (isPlayerDoping || isTeamDoping || !corruptionActive) ? 0 : (diff < 0 ? 0.03 : 0.008);
  const scandalize = r() < scandalChance;

  // Presse hostile : uniquement sur défaite, jamais si autre événement spécial
  const isHumiliation = diff <= -4;
  const isBrutalLoss = diff <= -3 && diff > -4;
  const critiqueable = !isPlayerDoping && !isTeamDoping && !scandalize && !isEliminated && diff < 0;
  const critiqueChance = critiqueable
    ? (isHumiliation ? 0.40 : isBrutalLoss ? 0.22 : 0.10)
    : 0;
  const isCritique = r() < critiqueChance;
  let moraleShock: number | undefined;
  let moraleBoost: number | undefined;

  if (isTeamDoping) {
    category = 'scandale';
    const [h, b] = pick(TEAM_DOPING_PAIRS, r);
    headline = sub(h);
    body = sub(b);
    teamDisqualified = true;
  } else if (scandalize && isWorldCup) {
    category = 'scandale';
    const [h, b] = pick(WC_SCANDAL_PAIRS, r);
    headline = sub(h);
    body = sub(b);
  } else if (isPlayerDoping) {
    category = 'scandale';
    // Pick a specific player (non-GK, from pool already computed)
    const dopingVictim = pool.length > 0 ? pick(pool, r) : null;
    const victimName = dopingVictim ? `${dopingVictim.firstName} ${dopingVictim.lastName}` : null;
    const [hTpl, bTpl] = pick(DOPING_PAIRS, r);
    const fallback = 'un joueur';
    headline = sub(hTpl).replace(/{player}/g, victimName ?? fallback);
    body = sub(bTpl).replace(/{player}/g, victimName ?? fallback);
    dopingSuspension = createSuspension(
      opts.teamId,
      dopingVictim?.id ?? `doping-${opts.teamId}`,
      victimName ?? 'Joueur contrôlé positif',
      999,
      'Dopage — contrôle positif',
      opts.round,
    );
    // Ajouter mention cliquable
    if (dopingVictim && victimName) {
      mentions.push({
        type: 'player',
        name: victimName,
        overall: dopingVictim.overall,
        position: dopingVictim.position,
        stats: {
          technical: dopingVictim.stats.technical as unknown as Record<string, number>,
          mental: dopingVictim.stats.mental as unknown as Record<string, number>,
          physical: dopingVictim.stats.physical as unknown as Record<string, number>,
          ...(dopingVictim.stats.goalkeeping ? { goalkeeping: dopingVictim.stats.goalkeeping as unknown as Record<string, number> } : {}),
        },
      });
    }
  } else if (scandalize) {
    category = 'scandale';
    // 30% chance the referee reveals/reports corruption → sanction; 70% generic scandal
    const isRefereeScandale = r() < 0.30;
    if (isRefereeScandale) {
      const refuseAndReport = r() < 0.5; // 50/50 : révèle seul vs refuse+dénonce avec sanction
      if (refuseAndReport) {
        // Arbitre refuse ET dénonce → sanction CMF selon la phase
        const isBarrage = phase === 'lpm_playoff' || phase.toLowerCase().includes('playoff') || phase.toLowerCase().includes('barrage');
        const penaltyKind: RefereeCorruptionOutcome['kind'] = 'refused_reported';
        let penalty: 'points' | 'disqualified' | 'walkover';
        let templatePairs: [string, string][];
        if (isBarrage) {
          penalty = 'walkover';
          templatePairs = REFEREE_REPORTED_WALKOVER_PAIRS;
          teamDisqualified = true;
        } else if (isKnockout) {
          penalty = 'disqualified';
          templatePairs = REFEREE_REPORTED_DISQUALIF_PAIRS;
          teamDisqualified = true;
        } else {
          penalty = 'points';
          templatePairs = REFEREE_REPORTED_POINTS_PAIRS;
        }
        refereeCorruption = { kind: penaltyKind, penalty };
        const [h, b] = pick(templatePairs, r);
        headline = sub(h);
        body = sub(b);
      } else {
        // Arbitre révèle seul — communiqué CMF corruption sans sanction immédiate
        refereeCorruption = { kind: 'revealed' };
        const [h, b] = pick(REFEREE_REVEALS_PAIRS, r);
        headline = sub(h);
        body = sub(b);
      }
    } else {
      const [h, b] = pick(SCANDAL_PAIRS, r);
      headline = sub(h);
      body = sub(b);
    }
  } else if (isCritique) {
    category = 'critique';
    if (isHumiliation) {
      const allL3H = [...CRITIQUE_HEADLINES_L3, ...CRITIQUE_HEADLINES_L3_EXTRA];
      const allL3B = [...CRITIQUE_BODIES_L3, ...CRITIQUE_BODIES_L3_EXTRA];
      headline = sub(pick(allL3H, r));
      body = sub(pick(allL3B, r));
      moraleShock = -(18 + Math.floor(r() * 8)); // -18 à -25
    } else if (isBrutalLoss) {
      headline = sub(pick(CRITIQUE_HEADLINES_L2, r));
      body = sub(pick(CRITIQUE_BODIES_L2, r));
      moraleShock = -(12 + Math.floor(r() * 6)); // -12 à -17
    } else {
      headline = sub(pick(CRITIQUE_HEADLINES_L1, r));
      body = sub(pick(CRITIQUE_BODIES_L1, r));
      moraleShock = -(8 + Math.floor(r() * 5)); // -8 à -12
    }
    // Suffix coach critique
    const coach = opts.coach;
    if (coach) {
      const coachLabel = `${coach.firstName} ${coach.lastName}`;
      const coachBank = isHumiliation ? CRITIQUE_COACH_L3 : isBrutalLoss ? CRITIQUE_COACH_L2 : CRITIQUE_COACH_L1;
      body += ' ' + pick(coachBank, r).replace(/{coach}/g, coachLabel);
      mentions.push({
        type: 'coach',
        name: coachLabel,
        overall: coach.overall,
        stats: coach.stats,
        positiveTraits: coach.positiveTraits,
        negativeTraits: coach.negativeTraits,
      });
    }
    // Suffix joueur critique
    if (playerMention && featuredPlayer) {
      const playerBank = isHumiliation ? CRITIQUE_PLAYER_L3 : isBrutalLoss ? CRITIQUE_PLAYER_L2 : CRITIQUE_PLAYER_L1;
      body += ' ' + pick(playerBank, r).replace(/{player}/g, playerMention);
      mentions.push({
        type: 'player',
        name: playerMention,
        overall: featuredPlayer.overall,
        position: featuredPlayer.position,
        stats: {
          technical: featuredPlayer.stats.technical as unknown as Record<string, number>,
          mental: featuredPlayer.stats.mental as unknown as Record<string, number>,
          physical: featuredPlayer.stats.physical as unknown as Record<string, number>,
          ...(featuredPlayer.stats.goalkeeping ? { goalkeeping: featuredPlayer.stats.goalkeeping as unknown as Record<string, number> } : {}),
        },
      });
    }
  } else if (isKnockout) {
    // ── Phase finale : templates spécifiques ─────────────────────────────────
    const koWinHeads = KO_WIN_HEADLINES[phase] ?? KO_WIN_HEADLINES['QF'];
    const koWinBodies = KO_WIN_BODIES[phase] ?? KO_WIN_BODIES['QF'];
    const koLossHeads = KO_LOSS_HEADLINES[phase] ?? KO_LOSS_HEADLINES['QF'];
    const koLossBodies = KO_LOSS_BODIES[phase] ?? KO_LOSS_BODIES['QF'];
    const phaseLabel = KNOCKOUT_PHASE_LABEL[phase] ?? phase;

    // Tables CdM par phase (50% chance d'utiliser si isWorldCup)
    const wcWinHeads: Record<string, string[]> = { R16: WC_R16_WIN_HEADLINES, QF: WC_QF_WIN_HEADLINES, SF: WC_SF_WIN_HEADLINES, F: WC_F_WIN_HEADLINES };
    const wcWinBodies: Record<string, string[]> = { R16: WC_R16_WIN_BODIES, QF: WC_QF_WIN_BODIES, SF: WC_SF_WIN_BODIES, F: WC_F_WIN_BODIES };
    const wcLossHeads: Record<string, string[]> = { R16: WC_R16_LOSS_HEADLINES, QF: WC_QF_LOSS_HEADLINES, SF: WC_SF_LOSS_HEADLINES, F: WC_F_LOSS_HEADLINES };
    const wcLossBodies: Record<string, string[]> = { R16: WC_R16_LOSS_BODIES, QF: WC_QF_LOSS_BODIES, SF: WC_SF_LOSS_BODIES, F: WC_F_LOSS_BODIES };

    if (diff > 0) {
      category = isBigWin ? 'exploit' : 'victoire';
      moraleBoost = isBigWin ? (8 + Math.floor(r() * 7)) : (4 + Math.floor(r() * 5));
      if (isWorldCup && isBigWin && r() < 0.65) {
        headline = sub(pick(WC_EXPLOIT_HEADLINES, r));
        body = sub(pick(WC_EXPLOIT_BODIES, r));
      } else if (isWorldCup && wcWinHeads[phase] && r() < 0.70) {
        headline = sub(pick(wcWinHeads[phase], r));
        body = sub(pick(wcWinBodies[phase] ?? BIG_WIN_BODIES, r));
      } else if (r() < 0.5 && koWinHeads.length) {
        headline = sub(pick(koWinHeads, r));
        body = sub(pick(koWinBodies.length ? koWinBodies : BIG_WIN_BODIES, r));
      } else {
        headline = sub(pick(isManita ? MANITA_HEADLINES : isBigWin ? BIG_WIN_HEADLINES : WIN_HEADLINES, r));
        body = sub(pick(isManita ? MANITA_BODIES : isBigWin ? BIG_WIN_BODIES : WIN_BODIES, r));
        body += sub(` En ${phaseLabel}, chaque erreur se paie cash — {team} n'en a pas commis.`);
      }
    } else if (diff < 0) {
      category = isBigLoss ? 'crise' : 'defaite';
      if (isWorldCup && isBigLoss && r() < 0.65) {
        headline = sub(pick(WC_CRITIQUE_HEADLINES, r));
        body = sub(pick(WC_CRITIQUE_BODIES, r));
        moraleShock = -(12 + Math.floor(r() * 8));
      } else if (isWorldCup && wcLossHeads[phase] && r() < 0.70) {
        headline = sub(pick(wcLossHeads[phase], r));
        body = sub(pick(wcLossBodies[phase] ?? HEAVY_LOSS_BODIES, r));
      } else if (r() < 0.5 && koLossHeads.length) {
        headline = sub(pick(koLossHeads, r));
        body = sub(pick(koLossBodies.length ? koLossBodies : HEAVY_LOSS_BODIES, r));
      } else {
        headline = sub(pick(isBigLoss ? HEAVY_LOSS_HEADLINES : LOSS_HEADLINES, r));
        body = sub(pick(isBigLoss ? HEAVY_LOSS_BODIES : LOSS_BODIES, r));
        body += sub(` En ${phaseLabel}, il n'y a pas de lendemain. {team} le sait désormais.`);
      }
    } else {
      // Nul en élimination directe : le sort s'est joué aux tirs au but
      const pens = facts?.penaltyScore;
      const oppPensSide = mySide === 'home' ? 'away' : 'home';
      if (pens && mySide && pens[mySide] !== pens[oppPensSide]) {
        const wonPens = pens[mySide] > pens[oppPensSide];
        const tabStr = `${pens[mySide]}-${pens[oppPensSide]} aux t.a.b.`;
        if (wonPens) {
          category = phase === 'F' ? 'exploit' : 'victoire';
          moraleBoost = 8 + Math.floor(r() * 7);
          headline = (isWorldCup && wcWinHeads[phase] && r() < 0.7)
            ? sub(pick(wcWinHeads[phase], r))
            : sub(pick(koWinHeads, r));
          body = sub(pick(TAB_WIN_BODIES, r)).replace(/{tab}/g, tabStr);
        } else {
          category = 'defaite';
          headline = (isWorldCup && wcLossHeads[phase] && r() < 0.7)
            ? sub(pick(wcLossHeads[phase], r))
            : sub(pick(koLossHeads, r));
          body = sub(pick(TAB_LOSS_BODIES, r)).replace(/{tab}/g, tabStr);
        }
      } else {
        category = 'neutralite';
        headline = sub(pick(DRAW_HEADLINES, r));
        body = sub(pick(DRAW_BODIES, r));
      }
    }
  } else {
    // ── Phase de groupe ou ligue ─────────────────────────────────────────────
    const isLPM = isLPMComp;
    const isLPMEliminated = isLPM && opts.rank !== undefined && opts.rank > 40;
    const isLPMDanger = isLPM && opts.rank !== undefined && opts.rank >= 25 && opts.rank <= 40;
    const isLPMZoneOr = isLPM && opts.rank !== undefined && opts.rank <= 24;
    const isLPMBarrage = phase === 'lpm_playoff';
    const isLPMBarrageAller = isLPMBarrage && opts.matchId !== undefined && /leg.*1|aller/i.test(opts.matchId ?? '');

    // Critiques spéciales LPM — 18% sur défaite normale, 35% sur grosse défaite
    const lpmCritiqueChance = isLPM && !isKnockout && diff < 0 && !isEliminated
      ? (isBigLoss ? 0.35 : 0.18) : 0;
    const isLPMCritique = !isCritique && r() < lpmCritiqueChance;

    // Scandales spécifiques LPM — 0.8% sur n'importe quel résultat en LPM
    const lpmScandalChance = isLPM && !isEliminated && !isPlayerDoping && !isTeamDoping && !scandalize ? 0.008 : 0;
    const isLPMScandal = r() < lpmScandalChance;

    // Élimination mathématique confirmée (groupe/ligue standard) — article dédié
    if (isLPMScandal) {
      category = 'scandale';
      const [h, b] = pick(LPM_SCANDAL_PAIRS, r);
      headline = sub(h);
      body = sub(b);
      moraleShock = -(8 + Math.floor(r() * 10));
    } else if (isEliminated) {
      category = 'crise';
      moraleShock = -(10 + Math.floor(r() * 8));
      if (isLPMEliminated) {
        headline = sub(pick(LPM_ELIMINATED_HEADLINES, r));
        body = sub(pick(LPM_ELIMINATED_BODIES, r));
      } else if (isWorldCup) {
        headline = sub(pick(WC_ELIMINATED_HEADLINES, r));
        body = sub(pick(WC_ELIMINATED_BODIES, r));
      } else {
        headline = sub(pick(ELIMINATED_HEADLINES, r));
        body = sub(pick(ELIMINATED_BODIES, r));
      }
    } else if (isLPMCritique && diff < 0) {
      // Critique LPM contextualisée — ton journalistique spécifique à la compétition
      category = 'critique';
      headline = sub(pick(LPM_CRITIQUE_HEADLINES, r));
      body = sub(pick(LPM_CRITIQUE_BODIES, r));
      moraleShock = -(10 + Math.floor(r() * 8));
      if (isLPMDanger) body += ' ' + sub(pick(DANGER_ZONE_BODIES, r));
      else if (isLPMZoneOr) body += ' ' + sub(pick(LPM_LOSS_ZONE_OR_BODIES, r));
    } else if (diff > 0) {
      category = isBigWin ? 'exploit' : 'victoire';
      moraleBoost = isBigWin ? (8 + Math.floor(r() * 7)) : (4 + Math.floor(r() * 5));
      if (isWorldCup && isBigWin && r() < 0.65) {
        headline = sub(pick(WC_EXPLOIT_HEADLINES, r));
        body = sub(pick(WC_EXPLOIT_BODIES, r));
      } else if (isWorldCup && r() < 0.55) {
        headline = sub(pick(isBigWin ? WC_EXPLOIT_HEADLINES : WC_GROUP_WIN_HEADLINES, r));
        body = sub(pick(isBigWin ? WC_EXPLOIT_BODIES : WC_GROUP_WIN_BODIES, r));
      } else {
        headline = sub(pick(isManita ? MANITA_HEADLINES : isBigWin ? BIG_WIN_HEADLINES : WIN_HEADLINES, r));
        body = sub(pick(isManita ? MANITA_BODIES : isBigWin ? BIG_WIN_BODIES : WIN_BODIES, r));
      }
      // Contexte classement LPM
      if (isLPM && !isEliminated && r() < 0.55) {
        if (isLPMBarrage) {
          body += ' ' + sub(pick(isLPMBarrageAller ? LPM_BARRAGE_ALLER_WIN_BODIES : LPM_BARRAGE_RETOUR_WIN_BODIES, r));
        } else if (isLPMZoneOr && r() < 0.5) {
          body += ' ' + sub(pick(LPM_WIN_ZONE_OR_BODIES, r));
        } else if (isLPMDanger) {
          body += ' ' + sub(pick(LPM_WIN_ZONE_ROUGE_BODIES, r));
        } else if (opts.rank === 1 && r() < 0.6) {
          body += ' ' + sub(pick(STANDINGS_LEADER_WIN, r));
        } else if (opts.rank && opts.rank >= 2 && r() < 0.5) {
          body += ' ' + sub(pick(STANDINGS_CLIMB_WIN, r));
        }
      } else if (!isLPM && !isEliminated) {
        if (opts.rank === 1 && r() < 0.6) {
          body += ' ' + sub(pick(STANDINGS_LEADER_WIN, r));
        } else if (opts.rank && opts.rank >= 2 && r() < 0.5) {
          body += ' ' + sub(pick(STANDINGS_CLIMB_WIN, r));
        }
      }
    } else if (diff < 0) {
      category = isBigLoss ? 'crise' : 'defaite';
      if (isWorldCup && isBigLoss && r() < 0.65) {
        headline = sub(pick(WC_CRITIQUE_HEADLINES, r));
        body = sub(pick(WC_CRITIQUE_BODIES, r));
        moraleShock = -(12 + Math.floor(r() * 8));
      } else if (isWorldCup && r() < 0.55) {
        headline = sub(pick(WC_GROUP_LOSS_HEADLINES, r));
        body = sub(pick(WC_GROUP_LOSS_BODIES, r));
      } else if (isLPM && isLPMZoneOr && r() < 0.50) {
        // Perd la Zone Or — headlines dramatiques spécifiques
        headline = sub(pick(LPM_LOSS_ZONE_OR_HEADLINES, r));
        body = sub(pick(isBigLoss ? HEAVY_LOSS_BODIES : LOSS_BODIES, r));
        body += ' ' + sub(pick(LPM_LOSS_ZONE_OR_BODIES, r));
      } else {
        headline = sub(pick(isBigLoss ? HEAVY_LOSS_HEADLINES : LOSS_HEADLINES, r));
        body = sub(pick(isBigLoss ? HEAVY_LOSS_BODIES : LOSS_BODIES, r));
      }
      // Suffixes standings/danger seulement si encore en course et réellement en danger
      if (!isEliminated) {
        if (isLPMBarrage) {
          body += ' ' + sub(pick(isLPMBarrageAller ? LPM_BARRAGE_ALLER_LOSS_BODIES : LPM_BARRAGE_RETOUR_LOSS_BODIES, r));
        } else if (opts.isInDangerZone || isLPMDanger) {
          // Discours selon le format : barrages (LPM), qualification (groupes), fond de tableau (championnat)
          const dangerBank = isLPM ? DANGER_ZONE_BODIES : isPureLeague ? LEAGUE_BOTTOM_BODIES : GROUP_DANGER_BODIES;
          body += ' ' + sub(pick(dangerBank, r));
        } else if (opts.standing && opts.rank && opts.totalTeams && opts.rank > Math.ceil(opts.totalTeams / 2)) {
          // Seulement si team est dans la moitié basse du tableau
          const ptsPerGame = opts.standing.played > 0 ? opts.standing.points / opts.standing.played : 0;
          if (ptsPerGame < 1 && opts.standing.played >= 2 && r() < 0.55) {
            // Championnat pur : la course au titre s'éloigne — jamais de « qualification »
            body += ' ' + sub(pick(isPureLeague ? LEAGUE_TITLE_FADING_BODIES : STANDINGS_ELIMINATED_RISK, r));
          }
        }
      }
    } else {
      // Barrage LPM décidé aux tirs au but : le nul n'existe pas, quelqu'un se qualifie
      const pens = facts?.penaltyScore;
      const oppPensSide = mySide === 'home' ? 'away' : 'home';
      if (isLPMBarrage && pens && mySide && pens[mySide] !== pens[oppPensSide]) {
        const wonPens = pens[mySide] > pens[oppPensSide];
        const tabStr = `${pens[mySide]}-${pens[oppPensSide]} aux t.a.b.`;
        if (wonPens) {
          category = 'victoire';
          moraleBoost = 8 + Math.floor(r() * 7);
          headline = sub(pick(WIN_HEADLINES, r));
          body = sub(pick(TAB_WIN_BODIES, r)).replace(/{tab}/g, tabStr);
          if (!isLPMBarrageAller) body += ' ' + sub(pick(LPM_BARRAGE_RETOUR_WIN_BODIES, r));
        } else {
          category = 'defaite';
          headline = sub(pick(LOSS_HEADLINES, r));
          body = sub(pick(TAB_LOSS_BODIES, r)).replace(/{tab}/g, tabStr);
          if (!isLPMBarrageAller) body += ' ' + sub(pick(LPM_BARRAGE_RETOUR_LOSS_BODIES, r));
        }
      } else {
        category = 'neutralite';
        if (isWorldCup && r() < 0.60) {
          headline = sub(pick(WC_GROUP_DRAW_HEADLINES, r));
          body = sub(pick(WC_GROUP_DRAW_BODIES, r));
        } else {
          headline = sub(pick(DRAW_HEADLINES, r));
          body = sub(pick(DRAW_BODIES, r));
        }
      }
      // Nul en danger zone = mauvaise nouvelle (seulement si encore en course)
      if (!isEliminated && (opts.isInDangerZone || isLPMDanger)) {
        const drawDangerBank = isPureLeague ? LEAGUE_BOTTOM_BODIES : isLPM ? STANDINGS_DANGER_LOSS : GROUP_DANGER_BODIES;
        body += ' ' + sub(pick(drawDangerBank, r));
      }
    }
  }

  // ── Narrations factuelles — le scénario réel du match prime sur le générique ─
  const isPerfCategory = ['victoire', 'exploit', 'defaite', 'crise', 'neutralite'].includes(category);
  const pushPlayerMention = (p: Player) => {
    const nm = `${p.firstName} ${p.lastName}`;
    if (mentions.some((m) => m.name === nm)) return;
    mentions.push({
      type: 'player',
      name: nm,
      overall: p.overall,
      position: p.position,
      stats: {
        technical: p.stats.technical as unknown as Record<string, number>,
        mental: p.stats.mental as unknown as Record<string, number>,
        physical: p.stats.physical as unknown as Record<string, number>,
        ...(p.stats.goalkeeping ? { goalkeeping: p.stats.goalkeeping as unknown as Record<string, number> } : {}),
      },
    });
  };
  if (facts && mySide && isPerfCategory && !isEliminated) {
    const isFinalPhase = phase === 'F' || phase === '3rd';
    // Remontada / effondrement / exploit d'outsider : remplace titre + corps
    if (facts.comeback === mySide && diff > 0 && !isFinalPhase) {
      const [h, b] = pick(REMONTADA_PAIRS, r);
      headline = sub(h); body = sub(b);
      category = 'exploit';
      moraleBoost = Math.max(moraleBoost ?? 0, 10 + Math.floor(r() * 7));
    } else if (diff > 0 && (opts.cote ?? 0) >= 3 && !isFinalPhase && r() < 0.8) {
      const [h, b] = pick(UPSET_PAIRS, r);
      const coteStr = (opts.cote ?? 3).toFixed(2);
      headline = sub(h).replace(/{cote}/g, coteStr);
      body = sub(b).replace(/{cote}/g, coteStr);
      category = 'exploit';
      moraleBoost = Math.max(moraleBoost ?? 0, 8 + Math.floor(r() * 6));
    } else if (facts.comeback && facts.comeback !== mySide && diff < 0) {
      const [h, b] = pick(CHOKE_PAIRS, r);
      headline = sub(h); body = sub(b);
      category = 'crise';
      if (!moraleShock) moraleShock = -(6 + Math.floor(r() * 7));
    } else if (diff > 0 && facts.lateWinner && facts.lateWinner.teamId === opts.teamId && !isFinalPhase && r() < 0.6) {
      const [h, b] = pick(LATE_WINNER_PAIRS, r);
      const inject = (s: string) => sub(s)
        .replace(/{player}/g, facts.lateWinner!.name)
        .replace(/{minute}/g, String(facts.lateWinner!.minute));
      headline = inject(h); body = inject(b);
      const lw = (opts.players ?? []).find((p) => `${p.firstName} ${p.lastName}` === facts.lateWinner!.name);
      if (lw) pushPlayerMention(lw);
    }

    // Suffixes factuels (2 max) — doublé/triplé, rouge, clean sheet, stats, météo
    let factSuffixes = 0;
    const addSuffix = (s: string) => { if (factSuffixes < 2) { body += ' ' + s; factSuffixes++; } };
    if (diff > 0 && topScorerEntry && topScorerEntry.count >= 2) {
      const bank = topScorerEntry.count >= 3 ? FACT_HATTRICK_SUFFIX : FACT_BRACE_SUFFIX;
      addSuffix(pick(bank, r).replace(/{player}/g, topScorerEntry.name));
      if (topScorerPlayer) pushPlayerMention(topScorerPlayer);
    }
    const myReds = facts.redCards[mySide];
    if (myReds.length > 0 && diff !== 0) {
      const red = myReds[0];
      const bank = diff < 0 ? FACT_RED_LOSS_SUFFIX : FACT_RED_WIN_SUFFIX;
      addSuffix(pick(bank, r).replace(/{player}/g, red.name).replace(/{minute}/g, String(red.minute)));
      const rp = (opts.players ?? []).find((p) => `${p.firstName} ${p.lastName}` === red.name);
      if (rp) pushPlayerMention(rp);
    }
    const myPoss = facts.possession[mySide];
    const myShots = facts.shots[mySide];
    const oppShots = facts.shots[mySide === 'home' ? 'away' : 'home'];
    const wonOverall = category === 'victoire' || category === 'exploit'; // victoire aux t.a.b. incluse
    if (diff <= 0 && !wonOverall && myPoss >= 58 && myShots >= oppShots + 4) {
      addSuffix(pick(FACT_STERILE_SUFFIX, r).replace(/{possession}/g, String(myPoss)).replace(/{shots}/g, String(myShots)));
    } else if (diff > 0 && myPoss <= 42 && myShots < oppShots) {
      addSuffix(sub(pick(FACT_HOLDUP_SUFFIX, r)).replace(/{possession}/g, String(myPoss)));
    } else if (diff > 0 && opts.goalsAgainst === 0 && r() < 0.5) {
      addSuffix(pick(FACT_CLEAN_SHEET_SUFFIX, r));
    }
    const weatherBank = facts.weatherKind ? FACT_WEATHER_SUFFIX[facts.weatherKind] : undefined;
    if (weatherBank && r() < 0.35) addSuffix(pick(weatherBank, r));
    // Arbitre pointé du doigt quand le match a dégénéré en cartons
    const totalCards = facts.yellowCount.home + facts.yellowCount.away + facts.redCards.home.length + facts.redCards.away.length;
    if (facts.referee && (totalCards >= 7 || facts.redCards.home.length + facts.redCards.away.length >= 2) && r() < 0.35) {
      addSuffix(`Un mot enfin sur l'arbitrage : ${facts.referee.name} (réputé ${facts.referee.temperament}) a distribué ${totalCards} cartons — le match a souvent viré au bras de fer.`);
      if (!mentions.some((m) => m.name === facts.referee!.name)) mentions.push(facts.referee);
    }
  }

  // ── Désillusion moral élevé ──────────────────────────────────────────────
  // Équipe avec bon moral qui perd ou fait nul → presse amplifie la déception
  if (!moraleShock && (diff <= 0) && opts.moraleBefore !== undefined) {
    const mb = opts.moraleBefore;
    // Seuils : moral ≥ 75 → 55% shock, 65-74 → 30%, 55-64 → 12%
    const shockChance = mb >= 75 ? 0.55 : mb >= 65 ? 0.30 : mb >= 55 ? 0.12 : 0;
    if (shockChance > 0 && r() < shockChance) {
      // Amplitude proportionnelle au moral et à l'écart
      const baseShock = mb >= 75 ? 8 : mb >= 65 ? 5 : 3;
      const diffPenalty = Math.abs(diff) >= 3 ? 4 : Math.abs(diff) >= 2 ? 2 : 0;
      moraleShock = -(baseShock + diffPenalty + Math.floor(r() * 4));
    }
  }

  // Coach mention (40% chance, performance categories only)
  const coach = opts.coach;
  if (coach && r() < 0.4 && ['victoire', 'exploit', 'defaite', 'crise', 'neutralite', 'scandale'].includes(category)) {
    const coachLabel = `${coach.firstName} ${coach.lastName}`;
    const coachSuffixes: Record<string, string[]> = {
      victoire: [
        `Le sélectionneur ${coachLabel} a su trouver les bons réglages tactiques.`,
        `${coachLabel} peut savourer — ses choix ont payé ce soir.`,
        `Le plan de jeu de ${coachLabel} a parfaitement fonctionné.`,
      ],
      exploit: [
        `${coachLabel} entre dans la légende de ce tournoi avec cette victoire magistrale.`,
        `La préparation méticuleuse de ${coachLabel} se voit dans chaque action de son équipe.`,
        `${coachLabel} a livré un chef-d'œuvre tactique ce soir.`,
      ],
      defaite: [
        `${coachLabel} devra trouver des réponses rapidement.`,
        `Les choix de ${coachLabel} sont remis en question après cette contre-performance.`,
        `${coachLabel} n'a pas su trouver les mots pour relancer les siens.`,
      ],
      crise: [
        `L'avenir de ${coachLabel} à la tête du groupe est sérieusement en question.`,
        `${coachLabel} est sous pression maximale après ce naufrage collectif.`,
        `${coachLabel} a reconnu ses erreurs — trop tard pour changer le cours du match.`,
      ],
      neutralite: [
        `${coachLabel} repart frustré — ses plans n'ont pas suffi à débloquer la situation.`,
        `${coachLabel} a multiplié les changements tactiques sans succès.`,
      ],
      scandale: [
        `${coachLabel} dit n'avoir "rien su" de l'affaire. La presse reste sceptique.`,
        `La position de ${coachLabel} est désormais très délicate après ces révélations.`,
      ],
    };
    const s = coachSuffixes[category];
    if (s) {
      body += ' ' + pick(s, r);
      mentions.push({
        type: 'coach',
        name: `${coach.firstName} ${coach.lastName}`,
        overall: coach.overall,
        stats: coach.stats,
        positiveTraits: coach.positiveTraits,
        negativeTraits: coach.negativeTraits,
      });
    }
  }

  // Player mention (50% chance, perf categories only)
  if (playerMention && featuredPlayer && r() < 0.5 && ['victoire', 'exploit', 'defaite', 'crise', 'neutralite'].includes(category)) {
    const suffixes: Record<string, string[]> = {
      victoire: [
        `En grande forme, ${playerMention} a été l'un des artisans de ce succès.`,
        `${playerMention} s'est particulièrement distingué ce soir.`,
        `Le niveau affiché par ${playerMention} donne de l'espoir pour la suite.`,
      ],
      exploit: [
        `${playerMention} a éclaboussé ce match de son talent.`,
        `On retiendra la prestation XXL de ${playerMention} dans cette démonstration collective.`,
        `${playerMention} a été omniprésent — ses adversaires n'ont pas trouvé la parade.`,
      ],
      defaite: [
        `Même ${playerMention} n'a pas pu renverser la tendance.`,
        `Les efforts de ${playerMention} n'ont pas suffi à éviter la défaite.`,
        `On attendait plus de ${playerMention} dans les moments décisifs.`,
      ],
      crise: [
        `${playerMention} n'a pas pu limiter les dégâts malgré ses efforts.`,
        `Même les meilleurs éléments comme ${playerMention} ont été dépassés.`,
        `Le match de ${playerMention} illustre les difficultés traversées par l'ensemble du groupe.`,
      ],
      neutralite: [
        `${playerMention} a tenté de faire la différence, sans succès.`,
        `L'activité de ${playerMention} n'a pas suffi pour débloquer la situation.`,
      ],
    };
    const s = suffixes[category];
    if (s) {
      body += ' ' + pick(s, r);
      mentions.push({
        type: 'player',
        name: `${featuredPlayer.firstName} ${featuredPlayer.lastName}`,
        overall: featuredPlayer.overall,
        position: featuredPlayer.position,
        stats: {
          technical: featuredPlayer.stats.technical as unknown as Record<string, number>,
          mental: featuredPlayer.stats.mental as unknown as Record<string, number>,
          physical: featuredPlayer.stats.physical as unknown as Record<string, number>,
          ...(featuredPlayer.stats.goalkeeping ? { goalkeeping: featuredPlayer.stats.goalkeeping as unknown as Record<string, number> } : {}),
        },
      });
    }
  }

  // Byline : critiques toujours signées, scandales souvent, articles de match parfois
  const journalist = category === 'critique'
    ? pick(JOURNALISTS, r)
    : category === 'scandale' && r() < 0.6
      ? pick(JOURNALISTS, r)
      : ['victoire', 'exploit', 'defaite', 'crise', 'neutralite'].includes(category) && r() < 0.45
        ? pick(JOURNALISTS, r)
        : undefined;

  return {
    item: {
      id: crypto.randomUUID(),
      round: opts.round,
      teamId: opts.teamId,
      category,
      headline,
      body,
      moraleBefore: opts.moraleBefore,
      moraleAfter: opts.moraleAfter,
      moraleShock,
      moraleBoost,
      createdAt: new Date().toISOString(),
      mentions: mentions.length > 0 ? mentions : undefined,
      journalist,
      matchId: opts.matchId,
      matchSnapshot: opts.matchSnapshot,
    },
    dopingSuspension,
    teamDisqualified,
    refereeCorruption,
  };
}

const REVOLTE_HEADLINES = [
  'SCANDALE : les supporters de {team} envahissent la fédération',
  '{team} : la rue gronde, le comité dans le collimateur',
  'Émeute devant la fédération de {team} — le peuple en a marre',
  '{team} : des centaines de supporters réclament la tête du comité',
  'La révolte gronde : les fans de {team} mettent le feu devant la fédération',
  '{team} : le comité sous haute tension, les supporters dans la rue',
  'Ras-le-bol : les supporters de {team} bloquent le siège de la fédération',
  '{team} : scènes de chaos devant la fédération, le comité planqué à l\'intérieur',
];

const REVOLTE_BODIES = [
  'La coupe est pleine. Des centaines de supporters de {team}, en colère noire, se sont rassemblés devant le siège de la fédération ce soir. Banderoles injurieuses, fumigènes rouges, chants hostiles : l\'ambiance était à la révolution. "Démission ! Démission !" scandait la foule. Le comité n\'a pas daigné se montrer. Une honte de plus.',
  'C\'est la goutte d\'eau. Après des semaines de résultats catastrophiques, les supporters de {team} ont décidé de passer à l\'action. Manifestation sauvage devant la fédération, vitres brisées, portes bloquées. La police a dû intervenir pour disperser la foule. À l\'intérieur, les membres du comité attendaient retranchés dans leurs bureaux. Leur crédibilité est morte ce soir.',
  'Ils en peuvent plus. Les supporters de {team} ont investi les abords de la fédération nationale en fin de soirée, réclamant à corps et à cris la démission du comité et le remplacement du staff. Des fumigènes, des bouteilles, des insultes — et une résolution claire : cette direction ne peut plus rester en place. La pression est maximale.',
  'Le peuple de {team} a craqué. Des centaines de personnes ont convergé vers le siège de la fédération après la débâcle du soir. Banderoles : "Dehors les incapables", "Remboursez-nous", "Vous nous faites honte". La nuit a été longue pour les dirigeants. Certains sources indiquent que le comité envisage sérieusement de démissionner.',
  'URGENT — Des scènes inédites devant la fédération de {team} ce soir. Supporters en colère, fumigènes, chants de honte. "On veut des gens compétents !" criait un supporter, le visage rouge. "On en a marre de payer pour regarder ces tocards !" La fédération a publié un communiqué laconique. Insuffisant. Très insuffisant.',
];

const DESTITUTION_HEADLINES = [
  '{team} : le comité destitué sous la pression populaire',
  'Chute du comité de la fédération {team} — une page se tourne',
  '{team} : démission forcée, le comité plié bagage',
  'Révolution à la fédération {team} — le comité dehors',
];

const DESTITUTION_BODIES = [
  'C\'est officiel : le comité de la fédération de {team} a remis sa démission ce matin, sous la pression des supporters et des instances. Une décision qui intervient après les scènes de chaos devant le siège fédéral. Un intérim est mis en place. L\'espoir renaît timidement dans les rangs des supporters — et dans le vestiaire.',
  'Sous la pression populaire, il a craqué. Le comité de la fédération de {team} a quitté son poste dans la nuit. Les supporters crient victoire dans les rues. L\'intérimaire nommé dans l\'urgence a promis "un nouveau souffle" et "un soutien total au groupe". Les joueurs ont été informés ce matin. L\'air dans le vestiaire semble différent.',
  'Ils sont partis. Le comité de la fédération de {team} a rendu son tablier après la pression des événements. Une cellule de transition prend les rênes. Premier message envoyé au vestiaire : "Vous avez notre confiance totale. Redressez la tête." Simple. Mais parfois, les mots suffisent.',
  'Départ précipité du comité directeur de la fédération {team}. La révolution des tribunes a fonctionné. De nouveaux visages arrivent à la tête de l\'institution, avec une promesse : remettre le football au centre, pas la politique. Le groupe y croit. Il faudra le prouver sur le terrain.',
];

const REBOUND_HEADLINES = [
  '{team} : nouvelle direction, nouveau souffle — l\'heure de la renaissance',
  'Après la tempête, {team} repart de l\'avant',
  '{team} : le vestiaire galvanisé par le renouveau du comité',
  'Réveil de {team} — la nouvelle direction insuffle une énergie nouvelle',
];

const REBOUND_BODIES = [
  'Le nouveau comité de la fédération {team} a rencontré les joueurs ce matin. Long discours, ambiance studieuse, poignées de main sincères. "On repart de zéro. Ensemble." Le groupe a semblé réceptif. L\'entraîneur a confirmé : "L\'ambiance est différente. Les gars ont l\'air de vouloir se battre à nouveau." À confirmer sur le terrain.',
  'Nouveau contexte, nouvelles sensations pour {team}. La direction de crise est derrière eux. Le nouveau comité a promis un soutien sans faille et un budget revu. Dans le vestiaire, les langues se délient. "On s\'était tous pris la tête, on avait perdu le fil. Là, c\'est comme si on effaçait tout." Reste à le démontrer collectivement.',
  'La fédération {team} a tourné la page — et le vestiaire avec. Le staff a senti le changement dès l\'entraînement du lendemain : plus d\'intensité, plus de communication, moins de têtes basses. Le comité intérimaire a été clair : "Votre job, c\'est de jouer. Le reste, on gère." Parfois, c\'est tout ce dont un groupe a besoin.',
  'Regain d\'énergie pour {team}. La révolution de la fédération a eu un effet inattendu : l\'unité dans le vestiaire. Les joueurs se sont serrés les coudes face à la tempête médiatique. La nouvelle direction a flatté l\'instinct de survie du groupe. "On va leur montrer qu\'ils ont eu tort de nous enterrer." On attend de voir.',
];

/** Occasional mid-competition press item based on morale extremes */
export function generateMoralePressItem(opts: {
  round: number;
  teamId: string;
  teamName: string;
  morale: number;
  seed: string;
}): PressItem | null {
  const r = rng(opts.seed + 'morale');
  // Only generate for extreme morale (>80 or <25), and not every round
  if (opts.morale >= 80 && r() < 0.5) {
    return {
      id: crypto.randomUUID(),
      round: opts.round,
      teamId: opts.teamId,
      category: 'forme',
      headline: pick(HIGH_MORALE_HEADLINES, r).replace('{team}', opts.teamName),
      body: pick(HIGH_MORALE_BODIES, r).replace(/{team}/g, opts.teamName),
      moraleAfter: opts.morale,
      createdAt: new Date().toISOString(),
    };
  }
  // Révolte supporters : morale ≤ 5, 33% chance
  if (opts.morale <= 5 && r() < 0.333) {
    const destitue = r() < 0.6; // 60% chance le comité tombe suite à la manif
    const allRevolteH = [...REVOLTE_HEADLINES, ...REVOLTE_HEADLINES_EXTRA];
    const allRevolteB = [...REVOLTE_BODIES, ...REVOLTE_BODIES_EXTRA];
    const headline = destitue
      ? pick(DESTITUTION_HEADLINES, r).replace(/{team}/g, opts.teamName)
      : pick(allRevolteH, r).replace(/{team}/g, opts.teamName);
    const body = destitue
      ? pick(DESTITUTION_BODIES, r).replace(/{team}/g, opts.teamName)
      : pick(allRevolteB, r).replace(/{team}/g, opts.teamName);
    return {
      id: crypto.randomUUID(),
      round: opts.round,
      teamId: opts.teamId,
      category: 'revolte',
      headline,
      body,
      moraleAfter: opts.morale,
      presidentDestitue: destitue,
      createdAt: new Date().toISOString(),
    };
  }
  if (opts.morale <= 25 && r() < 0.5) {
    const allCriseH = [...LOW_MORALE_HEADLINES, ...CRISE_HEADLINES_EXTRA];
    const allCriseB = [...LOW_MORALE_BODIES, ...CRISE_BODIES_EXTRA];
    return {
      id: crypto.randomUUID(),
      round: opts.round,
      teamId: opts.teamId,
      category: 'crise',
      headline: pick(allCriseH, r).replace(/{team}/g, opts.teamName),
      body: pick(allCriseB, r).replace(/{team}/g, opts.teamName),
      moraleAfter: opts.morale,
      createdAt: new Date().toISOString(),
    };
  }
  return null;
}

/** Presidency rebound press item — fires the round after a destitution event */
export function generatePresidencyReboundItem(opts: {
  round: number;
  teamId: string;
  teamName: string;
  seed: string;
}): PressItem {
  const r = rng(opts.seed + 'rebound');
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.teamId,
    category: 'revolte',
    headline: pick(REBOUND_HEADLINES, r).replace(/{team}/g, opts.teamName),
    body: pick(REBOUND_BODIES, r).replace(/{team}/g, opts.teamName),
    moraleBoost: 20 + Math.floor(r() * 11), // +20 à +30
    createdAt: new Date().toISOString(),
  };
}

// ── Forme — séries de victoires ──────────────────────────────────────────────

const FORME_HEADLINES_3 = [
  '{team} : trois victoires de suite — la série est lancée',
  '{team} enchaîne les victoires : le groupe trouve son rythme',
  'Série en cours pour {team} — trois matchs, trois succès',
  '{team} en route : troisième victoire consécutive !',
  'La dynamique {team} est impressionnante — trois victoires d\'affilée',
  '{team} ne s\'arrête plus : troisième succès de rang',
];

const FORME_HEADLINES_5 = [
  '{team} : cinq victoires consécutives — qui peut les arrêter ?',
  'La machine {team} est en marche — 5 matchs sans défaite !',
  '{team} inarrêtable : cinq victoires de suite, le groupe est sur un nuage',
  'Série historique pour {team} : cinq succès d\'affilée',
  '{team} en état de grâce — cinq victoires consécutives, personne ne les arrête',
  'Cinq sur cinq pour {team} — cette équipe est en feu',
];

const FORME_HEADLINES_8 = [
  '{team} : HUIT victoires consécutives — une série légendaire',
  '{streak} victoires d\'affilée pour {team} — le groupe entre dans l\'histoire',
  'Phénomène {team} : {streak} succès de suite, les adversaires tremblent',
  '{team} {streak} victoires, aucune défaite — qui osera les défier ?',
  'Série XXL pour {team} : {streak} victoires consécutives, le groupe vole',
];

const FORME_BODIES_3 = [
  'Trois matchs, trois victoires. {team} est dans une dynamique positive qui commence à faire parler dans les couloirs de la compétition. Le groupe semble soudé, les automatismes se mettent en place, et les résultats suivent.',
  'La régularité est la marque des grandes équipes. {team} en donne une belle illustration avec trois succès consécutifs. Le collectif tourne bien, la confiance est là — et ça se voit sur le terrain.',
  'Depuis trois journées, {team} ne connaît pas la défaite. La série est courte, mais la tendance est claire : ce groupe monte en puissance. Les prochains adversaires sont prévenus.',
  'Trois victoires de suite pour {team}. Les joueurs arrivent à l\'entraînement avec le sourire, les séances sont intenses, et le coach commence à faire confiance à un groupe de base stable. Les bases sont là.',
  'Trois succès, et déjà un parfum de sérieux qui flotte autour de {team}. Rien de tapageur — juste une équipe qui gagne, encaisse peu, et donne l\'impression de savoir exactement où elle va. Souvent, c\'est comme ça que naissent les belles saisons.',
];

const FORME_BODIES_5 = [
  'Cinq victoires de suite — à ce niveau de la compétition, c\'est une performance rare. {team} s\'impose comme l\'une des équipes à surveiller. Le vestiaire est en feu, le coach parle de "confiance maximale", et les supporters commencent à y croire sérieusement.',
  'On ne peut plus parler de coïncidence. {team} enchaîne les succès depuis cinq journées, et chaque victoire renforce un peu plus la cohésion du groupe. "On joue pour les uns pour les autres" résumait un joueur après le match. Ça ressemble à une équipe qui peut aller loin.',
  'Cinq sur cinq. {team} surfe sur une vague de confiance impressionnante. L\'équipe concède peu, marque régulièrement, et semble gérer les moments compliqués avec une maturité inattendue. La série mérite d\'être regardée de près.',
  'La série continue. Cinq victoires consécutives pour {team}, qui s\'installe durablement dans les hauteurs du classement. Les concurrents commencent à regarder avec inquiétude. À raison.',
  'Cinq victoires, et une évidence : {team} n\'est plus un outsider, c\'est un candidat. La défense est un mur, l\'attaque un rouleau compresseur, et le mental un roc. Les adversaires ne se demandent plus s\'ils vont perdre contre {team} — mais de combien.',
];

const FORME_BODIES_8 = [
  '{streak} victoires de suite pour {team} — une série qui entre dans la légende de cette compétition. Le groupe ne tremble plus, les doutes semblent appartenir au passé. Chaque match est abordé avec la même intensité, la même concentration. Quelque chose de spécial est en train de se construire.',
  'Il faut remonter loin pour trouver une pareille série dans cette compétition. {team} aligne {streak} victoires consécutives avec une régularité déconcertante. L\'entraîneur reste prudent en conférence de presse, mais les yeux brillent. Ce groupe a quelque chose — et tout le monde le sent.',
  '{streak} sans défaite. {team} est entré dans une dimension à part. Les stats sont impressionnantes, le collectif tourne à plein régime, et même les matchs difficiles sont gagnés dans le dur. C\'est le signe d\'une grande équipe.',
  '{streak} victoires. On ne parle plus d\'une série, on parle d\'un règne. {team} écrase la concurrence avec une froideur de machine et une faim de titan. À ce stade, la vraie question n\'est plus de savoir qui les battra — mais si quelqu\'un en est seulement capable.',
];

const FORME_PLAYER_SUFFIXES = [
  `{player} incarne parfaitement cette dynamique — son niveau en ce moment est exceptionnel.`,
  `On retiendra notamment les performances de {player} sur cette série, impressionnant depuis plusieurs matchs.`,
  `{player} est en état de grâce depuis le début de cette série — ses coéquipiers lui font confiance les yeux fermés.`,
  `Un nom ressort particulièrement dans cette série : {player}. Décisif, régulier, impérial.`,
];

const FORME_COACH_SUFFIXES = [
  `Le travail de {coach} mérite d\'être salué : la tactique est claire, le groupe est soudé, les résultats suivent.`,
  `{coach} a trouvé la bonne formule — et le groupe y croit. La confiance collective, ça se mérite.`,
  `On ne peut pas ignorer le rôle de {coach} dans cette série. La dynamique de groupe qu\'il a instaurée est visible sur le terrain.`,
  `La méthode {coach} fonctionne. Série de victoires, collectif soudé, moral au beau fixe — c\'est rarement le fruit du hasard.`,
];

// ── Méforme — séries de défaites ─────────────────────────────────────────────

const MEFORME_HEADLINES_3 = [
  '{team} : trois défaites de suite — la spirale est enclenchée',
  'Rien ne va plus pour {team} : troisième revers consécutif',
  '{team} s\'enfonce — trois matchs, trois défaites',
  'La série noire de {team} continue : où est le fond ?',
];
const MEFORME_HEADLINES_5 = [
  '{team} : CINQ défaites d\'affilée — c\'est une chute libre',
  '{streak} revers de rang : {team} ne sait plus gagner, ni même exister',
  'La descente aux enfers de {team} : {streak} défaites consécutives',
  '{team} en perdition totale — {streak} matchs, zéro point',
];
const MEFORME_BODIES_3 = [
  'Trois défaites consécutives, et un constat qui s\'impose : {team} a perdu le fil. Le jeu se délite, la confiance s\'effrite, et chaque match ressemble un peu plus au précédent. Le staff cherche le déclic — il ferait bien de le trouver vite.',
  'Une défaite est un accident. Deux, une alerte. Trois, une tendance. {team} est officiellement en crise de résultats, et le calendrier ne fera aucun cadeau. La prochaine rencontre a déjà des airs de match couperet.',
  'Le vestiaire de {team} assure que "le groupe vit bien". Les résultats racontent autre chose : trois revers de suite, un jeu méconnaissable, des cadres en dedans. La vérité est sur le terrain — et elle fait mal.',
  'Trois défaites, et le doute qui s\'installe partout : dans les jambes, dans les têtes, dans les tribunes. {team} ne joue plus libéré, il joue crispé, la peur au ventre. Casser cette spirale relève désormais autant de la psychologie que de la tactique.',
];
const MEFORME_BODIES_5 = [
  '{streak} défaites d\'affilée. À ce stade, ce n\'est plus une mauvaise passe, c\'est un effondrement structurel. {team} ne défend plus, n\'attaque plus, ne réagit plus. Tout est à reconstruire — et la compétition, elle, n\'attend personne.',
  'Il faut le voir pour le croire : {team} vient d\'aligner {streak} défaites consécutives. Les explications tactiques ne suffisent plus. C\'est la tête, le cœur, l\'envie — tout a déserté ce groupe. Un électrochoc est indispensable, et il ne viendra pas tout seul.',
  'La presse cherche encore un qualificatif pour la série en cours de {team} : {streak} revers de rang. Les supporters, eux, ont trouvé les leurs — et ils ne sont pas publiables. Chaque journée qui passe rapproche ce groupe du point de non-retour.',
  '{streak} défaites. À ce compte-là, ce n\'est plus une équipe, c\'est une victime consentante qui descend sur le terrain en sachant déjà qu\'elle va perdre. {team} a besoin d\'un électrochoc — un vrai — parce que la honte, elle, ne connaît pas de plancher.',
];
// Variantes fin de parcours : la compétition est TERMINÉE pour l'équipe (élimination KO / finale perdue)
// — aucune allusion à un « prochain match » ou à la suite du calendrier.
const MEFORME_BODIES_3_OVER = [
  'Trois défaites consécutives, et le couperet au bout : {team} quitte la compétition sur une série noire. Le jeu s\'est délité match après match, la confiance a fondu, et l\'aventure s\'arrête là. Le staff aura tout l\'intersaison pour comprendre ce qui a déraillé.',
  'Une défaite est un accident. Deux, une alerte. Trois, une élimination. {team} sort par la petite porte, au bout d\'une spirale que personne n\'a su enrayer. L\'heure n\'est plus au calendrier, mais au bilan.',
  'Le vestiaire de {team} assurait que « le groupe vit bien ». La sortie de route dit autre chose : trois revers de suite, et la porte qui se referme sur la compétition. La vérité était sur le terrain — elle a coûté cher.',
];
const MEFORME_BODIES_5_OVER = [
  '{streak} défaites d\'affilée, et le rideau qui tombe. Ce n\'était plus une mauvaise passe, c\'était un effondrement — et il s\'achève par une élimination. {team} ne défendait plus, n\'attaquait plus, ne réagissait plus. Tout est à reconstruire, mais ce sera pour une autre fois.',
  'Il faut le voir pour le croire : {team} termine son parcours sur {streak} défaites consécutives. Les explications tactiques ne suffisent plus — c\'est la tête, le cœur, l\'envie qui ont déserté. La compétition, elle, continue sans eux.',
  'La presse cherchait un qualificatif pour la série de {team} : {streak} revers de rang, et une sortie sans gloire. Les supporters, eux, ont trouvé les leurs — et ils ne sont pas publiables. Le point de non-retour a été franchi ce soir.',
];

/**
 * Generates a "forme" press article when a team is on a win streak (≥ 3)
 * — ou un article méforme (catégorie crise) sur une série de défaites (≥ 3).
 * @param matchSnapshots - up to last 3 matches (most recent first), shown as link cards
 */
export function generateFormePressItem(opts: {
  round: number;
  teamId: string;
  teamName: string;
  winStreak: number;
  /** Série de défaites consécutives — prioritaire seulement si winStreak < 3 */
  lossStreak?: number;
  /**
   * La compétition est TERMINÉE pour cette équipe après ce match (élimination
   * knockout ou finale/petite finale). Bascule les textes méforme sur des
   * variantes « fin de parcours » — pas d'allusion à un prochain match / à la
   * suite du calendrier, qui serait incohérente.
   */
  competitionOver?: boolean;
  seed: string;
  matchSnapshots?: NonNullable<PressItem['matchSnapshot']>[];
  players?: Player[];
  coach?: Coach;
}): PressItem | null {
  // Méforme : série de défaites
  if (opts.winStreak < 3 && (opts.lossStreak ?? 0) >= 3) {
    const lr = rng(opts.seed + 'meforme');
    const ls = opts.lossStreak!;
    const isHeavy = ls >= 5;
    // 3 défaites : 50%, 4 : 35%, 5+ : toujours
    const chance = isHeavy ? 1 : ls === 4 ? 0.35 : 0.5;
    if (lr() >= chance) return null;
    const streakStr = String(ls);
    const over = opts.competitionOver === true;
    const headPool = isHeavy ? MEFORME_HEADLINES_5 : MEFORME_HEADLINES_3;
    const bodyPool = over
      ? (isHeavy ? MEFORME_BODIES_5_OVER : MEFORME_BODIES_3_OVER)
      : (isHeavy ? MEFORME_BODIES_5 : MEFORME_BODIES_3);
    return {
      id: crypto.randomUUID(),
      round: opts.round,
      teamId: opts.teamId,
      category: 'crise',
      headline: pick(headPool, lr).replace(/{team}/g, opts.teamName).replace(/{streak}/g, streakStr),
      body: pick(bodyPool, lr).replace(/{team}/g, opts.teamName).replace(/{streak}/g, streakStr),
      createdAt: new Date().toISOString(),
      matchSnapshot: opts.matchSnapshots?.[0],
      journalist: lr() < 0.5 ? pick(JOURNALISTS, lr) : undefined,
    };
  }
  if (opts.winStreak < 3) return null;
  const r = rng(opts.seed + 'forme');
  // Only trigger at thresholds or with decaying probability
  const isLegendary = opts.winStreak >= 8;
  const isMajor = opts.winStreak >= 5;
  // At streak=3: 60%, 4: 40%, 5+: always
  const chance = isMajor ? 1 : opts.winStreak === 4 ? 0.40 : 0.60;
  if (r() >= chance) return null;

  const streakStr = String(opts.winStreak);
  const headsPool = isLegendary ? FORME_HEADLINES_8 : isMajor ? FORME_HEADLINES_5 : FORME_HEADLINES_3;
  const bodiesPool = isLegendary ? FORME_BODIES_8 : isMajor ? FORME_BODIES_5 : FORME_BODIES_3;

  let headline = pick(headsPool, r)
    .replace(/{team}/g, opts.teamName)
    .replace(/{streak}/g, streakStr);
  let body = pick(bodiesPool, r)
    .replace(/{team}/g, opts.teamName)
    .replace(/{streak}/g, streakStr);

  const mentions: PressMention[] = [];

  // Player mention
  const nonGK = opts.players?.filter((p) => p.position !== 'GK') ?? [];
  const pool = nonGK.length > 0 ? nonGK : (opts.players ?? []);
  const top5 = pool.slice().sort((a, b) => b.overall - a.overall).slice(0, 5);
  const featured = top5.length > 0 ? pick(top5, r) : null;
  if (featured && r() < 0.65) {
    const pname = `${featured.firstName} ${featured.lastName}`;
    body += ' ' + pick(FORME_PLAYER_SUFFIXES, r).replace(/{player}/g, pname);
    mentions.push({
      type: 'player',
      name: pname,
      overall: featured.overall,
      position: featured.position,
      stats: {
        technical: featured.stats.technical as unknown as Record<string, number>,
        mental: featured.stats.mental as unknown as Record<string, number>,
        physical: featured.stats.physical as unknown as Record<string, number>,
        ...(featured.stats.goalkeeping ? { goalkeeping: featured.stats.goalkeeping as unknown as Record<string, number> } : {}),
      },
    });
  }

  // Coach mention
  if (opts.coach && r() < 0.55) {
    const cname = `${opts.coach.firstName} ${opts.coach.lastName}`;
    body += ' ' + pick(FORME_COACH_SUFFIXES, r).replace(/{coach}/g, cname);
    mentions.push({
      type: 'coach',
      name: cname,
      overall: opts.coach.overall,
      stats: opts.coach.stats,
      positiveTraits: opts.coach.positiveTraits,
      negativeTraits: opts.coach.negativeTraits,
    });
  }

  // Use the most recent match as the primary matchSnapshot for the card
  const primarySnap = opts.matchSnapshots?.[0];
  // Extra snaps for linking (up to 2 more)
  const extraSnaps = opts.matchSnapshots?.slice(1, 3) ?? [];

  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.teamId,
    category: 'forme',
    headline,
    body,
    createdAt: new Date().toISOString(),
    mentions: mentions.length > 0 ? mentions : undefined,
    matchSnapshot: primarySnap,
    extraMatchSnapshots: extraSnaps.length > 0 ? extraSnaps : undefined,
  };
}

// ── Scandale coach — alcoolique / drogué ──────────────────────────────────────

const COACH_ALCOOL_PAIRS: [string, string][] = [
  [
    'SCANDALE : {coach}, sélectionneur de {team}, aperçu ivre avant le match',
    'Plusieurs témoins ont rapporté avoir vu {coach}, le sélectionneur de {team}, dans un état d\'ivresse avancée dans un bar du centre-ville, la veille d\'un match important. L\'entourage de l\'équipe n\'a pas encore réagi officiellement. La fédération a été saisie.',
  ],
  [
    '{team} : {coach} convoqué par la fédération après une soirée très arrosée',
    'La fédération de {team} a convoqué son sélectionneur {coach} pour s\'expliquer sur son comportement lors d\'une soirée privée qui a dégénéré. Des témoignages concordants ont été recueillis. La fédération parle d\'"enquête interne". Le groupe, lui, fait profil bas.',
  ],
  [
    'L\'alcoolisme de {coach} refait surface — {team} dans l\'embarras',
    'Ce n\'est pas la première fois que le nom de {coach} est associé à des problèmes d\'alcool. Mais les récents incidents ont rendu la situation impossible à ignorer. Plusieurs membres du staff auraient alerté la direction. {coach} nie. La fédération de {team} cherche ses mots.',
  ],
  [
    '{team} : le sélectionneur {coach} au cœur d\'une polémique pour état d\'ivresse',
    'Selon plusieurs témoins présents, {coach} aurait dirigé la conférence de presse d\'après-match dans un état préoccupant. Un journaliste accrédité a confirmé la scène à notre rédaction. Le coach n\'a pas voulu commenter. La fédération "examine la situation".',
  ],
  [
    'Révélations : {coach} lutte contre l\'alcool depuis des années — {team} au courant ?',
    'Un proche du staff de {team} a brisé l\'omertà : {coach} souffrirait d\'une dépendance à l\'alcool depuis plusieurs années. L\'entourage le savait, personne n\'a agi. Les performances récentes de l\'équipe alimentent les questions. Le groupe est déstabilisé.',
  ],
];

const COACH_DROGUE_PAIRS: [string, string][] = [
  [
    'CHOC : le sélectionneur de {team}, {coach}, positif à un test aléatoire',
    'La nouvelle est tombée comme un coup de massue : {coach}, sélectionneur de {team}, aurait été contrôlé positif lors d\'un test aléatoire organisé par la fédération internationale. Les détails de la substance détectée n\'ont pas été communiqués. La fédération de {team} est en état de choc.',
  ],
  [
    '{team} : {coach} au cœur d\'un scandale de stupéfiants',
    'Le sélectionneur {coach} est au cœur d\'une enquête après qu\'une descente de police dans un hôtel de la délégation ait permis la saisie de substances illicites. Son implication directe n\'est pas encore établie, mais l\'affaire est gravissime. La fédération a suspendu les déclarations publiques.',
  ],
  [
    'Exclusif — {coach} : la face cachée du sélectionneur de {team}',
    'Une longue enquête journalistique révèle un portrait sombre de {coach}. Addictions, comportements erratiques lors des entraînements, nuits blanches : le staff parle d\'un homme "à la dérive". {team} a pourtant continué à lui faire confiance. Jusqu\'à quand ?',
  ],
  [
    '{team} : le sélectionneur {coach} mis en cause dans une affaire de stupéfiants',
    'Plusieurs sources internes à la délégation de {team} évoquent des comportements troublants de la part du coach {coach}. Des membres du staff auraient alerté la direction plusieurs semaines avant que l\'affaire ne sorte. La fédération nie avoir été informée. La presse, elle, ne lâche pas.',
  ],
  [
    'Scandale {team} : {coach} aperçu en compagnie de personnes mises en examen pour trafic',
    'Des témoignages concordants associent le sélectionneur {coach} à des individus connus des services judiciaires. L\'enquête est ouverte. Le sélectionneur n\'a pas répondu aux sollicitations de la presse. La fédération de {team} a déclaré "ne pas commenter des éléments non établis".',
  ],
];

/**
 * Generates a coach scandal article if coach has 'alcoolique' or 'drogue' trait.
 * ~2% chance per match. Returns null if not triggered.
 */
export function generateCoachScandalItem(opts: {
  round: number;
  teamId: string;
  teamName: string;
  coach: Coach;
  seed: string;
}): PressItem | null {
  const hasAlcool = opts.coach.negativeTraits.includes('alcoolique');
  const hasDrogue = opts.coach.negativeTraits.includes('drogue');
  if (!hasAlcool && !hasDrogue) return null;

  const r = rng(opts.seed + 'coachscandal');
  if (r() >= 0.02) return null;

  const coachName = `${opts.coach.firstName} ${opts.coach.lastName}`;
  const pairs = hasAlcool && hasDrogue
    ? (r() < 0.5 ? COACH_ALCOOL_PAIRS : COACH_DROGUE_PAIRS)
    : hasAlcool ? COACH_ALCOOL_PAIRS : COACH_DROGUE_PAIRS;

  const [hTpl, bTpl] = pick(pairs, r);
  const headline = hTpl.replace(/{team}/g, opts.teamName).replace(/{coach}/g, coachName);
  const body = bTpl.replace(/{team}/g, opts.teamName).replace(/{coach}/g, coachName);

  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.teamId,
    category: 'scandale',
    headline,
    body,
    createdAt: new Date().toISOString(),
    mentions: [{
      type: 'coach',
      name: coachName,
      overall: opts.coach.overall,
      stats: opts.coach.stats,
      positiveTraits: opts.coach.positiveTraits,
      negativeTraits: opts.coach.negativeTraits,
    }],
  };
}

// ── Drame (0.5% par match, teamId: null) ─────────────────────────────────────

const DRAME_PAIRS: [string, string][] = [
  [
    'DRAME dans les tribunes — un supporter perd la vie lors de {homeTeam} – {awayTeam}',
    'Le match a été brièvement interrompu en première mi-temps après qu\'un homme d\'une cinquantaine d\'années a été victime d\'un malaise cardiaque dans la tribune nord. Les secours sont intervenus rapidement mais n\'ont pu que constater le décès. Les deux équipes ont continué à jouer après une courte suspension, dans une atmosphère de consternation générale. Les fédérations ont présenté leurs condoléances à la famille.',
  ],
  [
    'TRAGÉDIE : une supportrice décède en marge du match {homeTeam} – {awayTeam}',
    'Une supportrice de 67 ans a été retrouvée inconsciente dans les escaliers du stade à la mi-temps. Malgré l\'intervention rapide des équipes médicales, elle n\'a pas survécu. Le match s\'est terminé dans une ambiance pesante. Le président de la fédération a exprimé "une profonde tristesse" et annoncé qu\'une minute de silence serait observée lors du prochain match.',
  ],
  [
    'MORT EN TRIBUNE lors de {homeTeam} – {awayTeam} — le football s\'arrête',
    'Un homme d\'une trentaine d\'années s\'est effondré en plein match dans le virage des ultras locaux. Les supporters ont immédiatement appelé les secours et dégagé l\'espace autour de lui. Le SAMU est intervenu, mais le pronostic vital était déjà engagé. Il est décédé une heure plus tard à l\'hôpital. Le football passe au second plan ce soir.',
  ],
  [
    'Un enfant de 9 ans perd la vie lors du match {homeTeam} – {awayTeam} — l\'horreur',
    'Un enfant de 9 ans a perdu connaissance en plein match alors qu\'il regardait la rencontre avec son père dans la tribune familiale. Les secouristes présents sur place ont tenté une réanimation pendant plusieurs minutes. Sans succès. L\'annonce de son décès a circulé parmi les supporters peu avant le coup de sifflet final. Nombreux sont ceux qui ont quitté le stade en larmes.',
  ],
  [
    'Drame en marge de {homeTeam} – {awayTeam} : un supporter lynché par une foule incontrôlée',
    'Des affrontements entre factions rivales en dehors du stade ont dégénéré en violence extrême. Un supporter, pris pour cible par un groupe, a été retrouvé dans un état critique par les forces de l\'ordre. Transporté en urgence, il n\'a pas survécu à ses blessures. La fédération a condamné "avec la plus grande fermeté" ces actes et demandé l\'ouverture d\'une enquête immédiate.',
  ],
  [
    '{homeTeam} – {awayTeam} : mouvement de foule meurtrier à l\'entrée du stade',
    'À l\'ouverture des portes du stade, un mouvement de foule incontrôlé a provoqué une bousculade dramatique. Deux supporters ont été piétinés. L\'un d\'eux a succombé à ses blessures peu après. Plusieurs autres ont été hospitalisés. La rencontre s\'est jouée dans l\'ignorance du drame pour la majorité des spectateurs présents dans les gradins. La vérité a éclaté après le coup de sifflet final.',
  ],
  [
    'ÉLECTROCUTION fatale dans le stade lors de {homeTeam} – {awayTeam}',
    'Un agent de sécurité a été électrocuté lors d\'une intervention sur une installation défaillante dans les couloirs du stade. L\'homme, 44 ans, n\'a pas survécu. L\'incident a eu lieu à la mi-temps, loin des tribunes, et les spectateurs n\'en ont appris l\'existence que plusieurs heures après le match. La direction du stade est sous le choc et une enquête est ouverte pour manquement aux normes de sécurité.',
  ],
];

const DRAME_HOMMAGE_HEADLINES = [
  'La compétition rend hommage — une minute de silence pour les victimes',
  'Hommage solennel à la mémoire des disparus du dernier drame',
  'Le football s\'incline — tributes aux victimes avant ce match',
  'Émotion dans les stades — le public rend hommage aux disparus',
  'Une minute de recueillement avant le coup d\'envoi — le sport ne perd pas sa mémoire',
];

const DRAME_HOMMAGE_BODIES = [
  'Avant le coup d\'envoi, les deux équipes et l\'ensemble des spectateurs ont observé une minute de silence en mémoire des personnes décédées lors du drame survenu la semaine dernière. Les capitaines des deux équipes ont déposé une gerbe de fleurs au centre du terrain. L\'ambiance, empreinte de gravité, a rappelé à tous que le football n\'est qu\'un jeu — et que la vie, elle, ne l\'est pas.',
  'La fédération a demandé qu\'une minute de silence soit observée lors de tous les matchs de cette journée. Les joueurs, brassard noir au bras, ont rendu hommage avec sérieux et dignité. Dans les tribunes, des banderoles "Repose en paix" ont été déployées par les supporters. Un moment fort, qui transcende les rivalités.',
  'Pas de protocole d\'avant-match habituel ce soir. Juste un silence. Lourd. Nécessaire. Les familles des victimes avaient été invitées dans les tribunes d\'honneur. Quelques-unes ont accepté. La cérémonie a duré cinq minutes — bien plus qu\'une minute réglementaire. Personne n\'a eu envie de se presser.',
  'L\'hommage était sobre, mais il était sincère. Deux équipes alignées en rang, têtes baissées, brassards noirs. Les supporters debout en silence dans les quatre tribunes. La foule qui ne murmure pas. Le speaker qui lit simplement les noms. Ces moments-là, on ne les oublie pas.',
  'La fédération a publié un communiqué officiel et fait don d\'une partie des recettes du match aux familles des victimes. À l\'intérieur du stade, l\'hommage a pris la forme d\'une minute de silence parfaite — pas un bruit, pas un téléphone, pas un mouvement. Juste le respect dû à ceux qui ne sont plus là.',
];

export function generateDrameItem(opts: {
  round: number;
  seed: string;
  matchId: string;
  matchSnapshot: NonNullable<PressItem['matchSnapshot']>;
}): PressItem {
  const r = rng(opts.seed + 'drame');
  const [hTpl, bTpl] = pick(DRAME_PAIRS, r);
  const headline = hTpl
    .replace(/{homeTeam}/g, opts.matchSnapshot.homeTeamName)
    .replace(/{awayTeam}/g, opts.matchSnapshot.awayTeamName);
  const body = bTpl
    .replace(/{homeTeam}/g, opts.matchSnapshot.homeTeamName)
    .replace(/{awayTeam}/g, opts.matchSnapshot.awayTeamName);
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: null,
    category: 'drame',
    headline,
    body,
    createdAt: new Date().toISOString(),
    matchId: opts.matchId,
    matchSnapshot: opts.matchSnapshot,
  };
}

export function generateDrameHommageItem(opts: {
  round: number;
  seed: string;
  originalMatchId: string;
  originalMatchSnapshot: NonNullable<PressItem['matchSnapshot']>;
}): PressItem {
  const r = rng(opts.seed + 'hommage');
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: null,
    category: 'drame',
    headline: pick(DRAME_HOMMAGE_HEADLINES, r),
    body: pick(DRAME_HOMMAGE_BODIES, r),
    createdAt: new Date().toISOString(),
    matchId: opts.originalMatchId,
    matchSnapshot: opts.originalMatchSnapshot,
  };
}

// ── Événements rares — scandales déterministes (faible proba par match) ───────
// Tous seedés, aucune donnée moteur requise : réutilisent le matchSnapshot + les
// joueurs déjà chargés côté page. Registre tabloïd assumé.

/** Construit une mention joueur cliquable à partir d'un Player. */
function playerMention(p: Player): PressMention {
  return {
    type: 'player',
    name: `${p.firstName} ${p.lastName}`,
    overall: p.overall,
    position: p.position,
    stats: {
      technical: p.stats.technical as unknown as Record<string, number>,
      mental: p.stats.mental as unknown as Record<string, number>,
      physical: p.stats.physical as unknown as Record<string, number>,
      ...(p.stats.goalkeeping ? { goalkeeping: p.stats.goalkeeping as unknown as Record<string, number> } : {}),
    },
  };
}

// C1 — Paris truqués / match arrangé (joueur soupçonné)
const FIXING_PAIRS: [string, string][] = [
  [
    'MATCHS TRUQUÉS : {player} ({team}) au cœur d\'un scandale de paris',
    'La bombe a éclaté en fin de soirée : {player}, joueur de {team}, serait impliqué dans un réseau de paris truqués. Des mouvements suspects sur des sites de paris auraient été détectés juste avant plusieurs rencontres. Le joueur nie tout en bloc, mais les enquêteurs disposeraient déjà d\'échanges compromettants. Si les faits sont avérés, c\'est une suspension à vie qui menace — et l\'image de {team} qui vole en éclats.',
  ],
  [
    'PARIS ILLÉGAUX : lourds soupçons sur {player}',
    'Un nom, une ombre, un scandale. {player} ({team}) est visé par une enquête pour manipulation présumée de résultats. Selon nos informations, des sommes importantes auraient été misées par des proches du joueur sur des événements précis d\'un match — cartons, corners, score exact. Le genre de détails qu\'on ne parie pas par hasard. {team} se dit "sous le choc" et promet sa pleine coopération. La suite risque d\'être terrible.',
  ],
  [
    'Le foot rattrapé par l\'argent sale : {player} soupçonné d\'avoir vendu un match',
    '"Il a vendu son âme pour du fric." La phrase, lâchée par une source proche de l\'enquête, résume la gravité de l\'affaire visant {player} ({team}). Des transactions financières douteuses, des contacts avec des parieurs connus des services, un comportement étrange sur le terrain repéré a posteriori : le faisceau d\'indices s\'épaissit. {player} clame son innocence. Les enquêteurs, eux, ne semblent pas près de lâcher.',
  ],
];

/** C1 — scandale paris truqués visant un joueur. ~0.3 %/match. */
export function generateFixingScandalItem(opts: {
  round: number;
  seed: string;
  teamId: string;
  teamName: string;
  player: Player;
  matchId?: string;
  matchSnapshot?: NonNullable<PressItem['matchSnapshot']>;
}): PressItem {
  const r = rng(opts.seed + 'fixing');
  const name = `${opts.player.firstName} ${opts.player.lastName}`;
  const [hTpl, bTpl] = pick(FIXING_PAIRS, r);
  const sub = (s: string) => s.replace(/{player}/g, name).replace(/{team}/g, opts.teamName);
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.teamId,
    category: 'scandale',
    headline: sub(hTpl),
    body: sub(bTpl),
    createdAt: new Date().toISOString(),
    matchId: opts.matchId,
    matchSnapshot: opts.matchSnapshot,
    mentions: [playerMention(opts.player)],
    journalist: r() < 0.6 ? pick(JOURNALISTS, r) : undefined,
  };
}

// C2 — Bagarre / clash vestiaire
const BRAWL_PAIRS: [string, string][] = [
  [
    'CLASH VIOLENT dans le vestiaire de {team} : ça a failli dégénérer',
    'Ce qui devait rester entre les quatre murs du vestiaire a fuité. Après le match, {player} et un coéquipier en seraient venus aux mains dans les couloirs de {team}. Coups de poing, insultes, staff obligé de s\'interposer : la scène aurait duré de longues secondes avant que le calme ne revienne. "Il y avait du sang", confie un témoin. Le vestiaire est fracturé, et personne ne sait comment recoller les morceaux.',
  ],
  [
    'BAGARRE INTERNE : {team} implose de l\'intérieur',
    'Les tensions couvaient, elles ont explosé. {player} serait au centre d\'une altercation physique avec un cadre du groupe {team}, quelques minutes après le coup de sifflet final. Chaises renversées, cris entendus depuis le couloir, deux joueurs séparés in extremis. Le sélectionneur aurait hurlé "ça suffit !" avant de claquer la porte. Une chose est sûre : ce vestiaire-là ne respire plus la sérénité.',
  ],
  [
    '"Ils ont failli s\'entretuer" — le vestiaire de {team} part en vrille',
    'L\'ambiance chez {team} est irrespirable, et ce soir elle a viré au pugilat. {player} et un partenaire se seraient jetés l\'un sur l\'autre dans le vestiaire, sous les yeux médusés du reste du groupe. Il a fallu plusieurs membres du staff pour les séparer. Officiellement, {team} parle d\'un "échange viril". Officieusement, c\'est un vestiaire au bord de la guerre civile.',
  ],
];

/** C2 — bagarre/clash vestiaire. ~0.5 %/match. */
export function generateLockerRoomBrawlItem(opts: {
  round: number;
  seed: string;
  teamId: string;
  teamName: string;
  player: Player;
  matchId?: string;
  matchSnapshot?: NonNullable<PressItem['matchSnapshot']>;
}): PressItem {
  const r = rng(opts.seed + 'brawl');
  const name = `${opts.player.firstName} ${opts.player.lastName}`;
  const [hTpl, bTpl] = pick(BRAWL_PAIRS, r);
  const sub = (s: string) => s.replace(/{player}/g, name).replace(/{team}/g, opts.teamName);
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.teamId,
    category: 'scandale',
    headline: sub(hTpl),
    body: sub(bTpl),
    createdAt: new Date().toISOString(),
    matchId: opts.matchId,
    matchSnapshot: opts.matchSnapshot,
    mentions: [playerMention(opts.player)],
    journalist: r() < 0.5 ? pick(JOURNALISTS, r) : undefined,
  };
}

// C3 — Propos / incidents discriminatoires en tribune
const DISCRIMINATION_PAIRS: [string, string][] = [
  [
    'HONTE : des cris racistes entachent {homeTeam} – {awayTeam}',
    'Le football a montré son plus mauvais visage ce soir. Lors de {homeTeam} – {awayTeam}, une partie des tribunes s\'est illustrée par des cris et des gestes racistes visant plusieurs joueurs. Le match a été brièvement interrompu, un message a été diffusé dans le stade, mais les insultes ont repris de plus belle. Les faits, rapportés par tous les envoyés présents, suscitent l\'indignation générale. La CMF a annoncé l\'ouverture immédiate d\'une procédure.',
  ],
  [
    'Incidents discriminatoires lors de {homeTeam} – {awayTeam} — l\'indignation',
    'Des chants discriminatoires ont souillé la rencontre {homeTeam} – {awayTeam}. Ciblés à plusieurs reprises, des joueurs ont fait signe à l\'arbitre, qui a activé le protocole prévu. Rien n\'y a fait : une frange de supporters a continué, assumant sa haine à visage découvert. "On ne peut pas laisser passer ça", a réagi un capitaine, la voix tremblante. La sanction s\'annonce lourde — et elle sera méritée.',
  ],
  [
    'Le racisme s\'invite à {homeTeam} – {awayTeam} : le stade sous le choc',
    'Ce qui s\'est passé dans les tribunes de {homeTeam} – {awayTeam} n\'a rien à voir avec le football. Des insultes racistes, répétées, ont visé plusieurs acteurs du match. Certains joueurs ont menacé de quitter le terrain. Le speaker a lancé plusieurs avertissements, en vain. Une honte collective, filmée sous tous les angles, que plus personne ne peut ignorer. La CMF promet la fermeté absolue.',
  ],
];

/** C3 — incident discriminatoire en tribune (déclenche un communiqué CMF huis clos). ~0.3 %/match. */
export function generateDiscriminationItem(opts: {
  round: number;
  seed: string;
  matchId: string;
  matchSnapshot: NonNullable<PressItem['matchSnapshot']>;
}): PressItem {
  const r = rng(opts.seed + 'discrim');
  const [hTpl, bTpl] = pick(DISCRIMINATION_PAIRS, r);
  const sub = (s: string) => s
    .replace(/{homeTeam}/g, opts.matchSnapshot.homeTeamName)
    .replace(/{awayTeam}/g, opts.matchSnapshot.awayTeamName);
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.matchSnapshot.homeTeamId,
    category: 'scandale',
    headline: sub(hTpl),
    body: sub(bTpl),
    createdAt: new Date().toISOString(),
    matchId: opts.matchId,
    matchSnapshot: opts.matchSnapshot,
    journalist: r() < 0.5 ? pick(JOURNALISTS, r) : undefined,
  };
}

// ── CMF communiqués officiels (dopage, corruption, drame) ────────────────────

const CMF_COMMUNIQUE_DOPING_PLAYER: [string, string][] = [
  [
    'CMF — Communiqué officiel : suspension de {player} pour dopage',
    'La Commission Médicale et de Fair-Play (CMF) confirme la suspension immédiate de {player} suite à un contrôle antidopage positif. La procédure réglementaire a été respectée. La CMF rappelle son engagement total pour l\'intégrité sportive.',
  ],
  [
    'Communiqué CMF : contrôle positif confirmé — {player} suspendu',
    'Suite aux résultats du laboratoire accrédité, la CMF prononce la suspension de {player} pour le reste de la compétition. Un recours est possible dans les 48 heures. La CMF ne commentera pas davantage tant que la procédure est en cours.',
  ],
  [
    'CMF — Décision disciplinaire : dopage avéré, {player} écarté',
    'Le comité disciplinaire de la CMF a statué concernant {player}. La substance détectée figure sur la liste des produits interdits. La sanction est immédiate et sans appel suspensif. La CMF rappelle que le sport propre est une priorité absolue de l\'institution.',
  ],
];

const CMF_COMMUNIQUE_DOPING_TEAM: [string, string][] = [
  [
    'CMF — Disqualification collective : dopage systématique confirmé',
    'Après enquête approfondie, la CMF a établi l\'existence d\'un protocole de dopage organisé au sein de cette délégation. La disqualification est immédiate. Tous les résultats de l\'équipe sont annulés. La CMF saisit les autorités compétentes pour poursuites judiciaires.',
  ],
  [
    'Communiqué CMF — Exclusion d\'équipe pour dopage institutionnalisé',
    'La décision est sans appel : l\'équipe est exclue de la compétition. L\'enquête a révélé une implication du staff médical dans l\'administration de substances interdites. La CMF exprime sa consternation et annonce une réforme des contrôles pour les prochaines éditions.',
  ],
];

const CMF_COMMUNIQUE_CORRUPTION: [string, string][] = [
  [
    'CMF — Communiqué officiel : corruption révélée, résultat annulé',
    'La CMF a été informée d\'une tentative de manipulation de résultat lors d\'un match de cette compétition. Suite à l\'enquête menée par la commission d\'intégrité, le résultat du match concerné est annulé et les points recalculés. Les responsables feront l\'objet de poursuites disciplinaires et judiciaires.',
  ],
  [
    'Corruption : la CMF sévit — sanction maximale',
    'Après avoir recueilli les preuves nécessaires, la CMF prononce l\'annulation du résultat entaché de corruption. Le ou les arbitres impliqués sont suspendus à titre conservatoire. La CMF rappelle sa politique de tolérance zéro envers toute forme de manipulation sportive.',
  ],
  [
    'CMF — Match entaché de corruption : décision officielle',
    'La commission d\'intégrité de la CMF confirme que le match en question a fait l\'objet d\'une manipulation. Le résultat est invalidé. Les équipes concernées sont informées des voies de recours disponibles. La CMF assure que tout sera fait pour que la vérité sportive soit rétablie.',
  ],
];

const CMF_COMMUNIQUE_CORRUPTION_POINTS: [string, string][] = [
  [
    'CMF — Décision disciplinaire : retrait de 3 points pour tentative de corruption',
    'Suite au signalement de l\'arbitre et à l\'enquête menée par la commission d\'intégrité, la CMF prononce un retrait de 3 points au classement de l\'équipe fautive. Cette sanction est immédiate et sans appel. La CMF remercie l\'arbitre pour son intégrité et son courage.',
  ],
  [
    'OFFICIEL CMF : corruption d\'arbitre avérée — l\'équipe fautive perd 3 points',
    'La commission disciplinaire a statué en urgence après réception du rapport de l\'arbitre. La tentative de corruption est établie. Sanction : retrait de 3 points au classement. L\'équipe fautive conserve ses résultats sur le terrain mais paie un lourd tribut au classement.',
  ],
  [
    'CMF — Sanction disciplinaire : −3 points pour corruption d\'arbitre',
    'L\'arbitre a transmis des preuves irréfutables d\'une tentative de corruption à la fédération. La CMF a agi en 48h : retrait de 3 points. Un signal fort envoyé à l\'ensemble des participants. L\'intégrité sportive ne se négocie pas.',
  ],
];

const CMF_COMMUNIQUE_DISCIPLINE: [string, string][] = [
  [
    'CMF — Ouverture d\'un dossier disciplinaire après un match houleux',
    'Au vu du rapport de l\'arbitre ({cards} cartons distribués), la commission de discipline de la CMF ouvre un dossier sur la rencontre {homeTeam} – {awayTeam}. Les comportements des deux bancs seront examinés. La CMF rappelle que l\'engagement physique ne doit jamais dégénérer en anti-jeu.',
  ],
  [
    'Communiqué CMF : la commission de discipline saisie après {homeTeam} – {awayTeam}',
    'Le nombre inhabituel de sanctions ({cards} cartons) relevé lors de cette rencontre a conduit la CMF à demander un rapport complémentaire à l\'arbitre et aux délégués officiels. Des sanctions additionnelles ne sont pas exclues. Décision attendue sous 72 heures.',
  ],
  [
    'CMF — Rappel à l\'ordre : l\'engagement oui, la brutalité non',
    'Suite aux incidents disciplinaires constatés lors de {homeTeam} – {awayTeam}, la CMF adresse un rappel à l\'ordre formel aux deux fédérations. Le barème des sanctions sera appliqué avec la plus grande rigueur sur les prochaines journées. Les capitaines des deux équipes seront reçus par la commission.',
  ],
];

const CMF_COMMUNIQUE_DRAME: [string, string][] = [
  [
    'CMF — Communiqué officiel : drame en tribune, la CMF présente ses condoléances',
    'La CMF a été profondément touchée par les événements survenus lors d\'un match de cette compétition. Nos pensées vont aux familles des victimes. Une minute de silence sera observée lors de toutes les rencontres de la prochaine journée. La CMF rappelle l\'importance de la sécurité dans les stades et s\'engage à renforcer les dispositifs existants.',
  ],
  [
    'Communiqué CMF — Drame lors d\'un match : recueillement et action',
    'La CMF exprime sa profonde tristesse suite aux événements dramatiques survenus en marge d\'un match de la compétition. Une cellule de soutien psychologique a été mise à disposition des familles. La CMF travaille avec les autorités compétentes pour établir les causes exactes de l\'incident et prévenir toute récurrence.',
  ],
  [
    'CMF — Message de soutien officiel après le drame en tribune',
    'Le président de la CMF a souhaité adresser personnellement ses condoléances aux familles endeuillées. Un fonds de solidarité a été ouvert. La CMF suspend provisoirement les célébrations d\'avant-match lors de la prochaine journée en signe de respect. Le football s\'arrête pour pleurer les siens.',
  ],
];

const CMF_COMMUNIQUE_HUIS_CLOS: [string, string][] = [
  [
    'CMF — Sanction : huis clos et amende après des incidents inacceptables',
    'Suite aux incidents survenus lors de la rencontre {homeTeam} – {awayTeam}, la commission de discipline de la CMF prononce un match à huis clos et une amende à l\'encontre du club fautif. La CMF rappelle qu\'aucune forme de discrimination ou de violence n\'a sa place dans les stades. La tolérance est nulle, la fermeté totale.',
  ],
  [
    'Communiqué CMF — Le stade fermé au public après les débordements',
    'La CMF a statué : le prochain match de l\'équipe concernée se jouera à huis clos. Les images des incidents survenus lors de {homeTeam} – {awayTeam} ont été examinées par la commission, qui a jugé les faits d\'une gravité suffisante pour justifier une sanction exemplaire. Une enquête complémentaire pourra alourdir la peine. Le football ne cédera rien.',
  ],
  [
    'CMF — Tolérance zéro : huis clos immédiat prononcé',
    'La CMF condamne avec la plus grande fermeté les comportements observés lors de {homeTeam} – {awayTeam}. Sanction : huis clos pour la prochaine rencontre à domicile, amende ferme, et rappel officiel adressé à la fédération concernée. La CMF annonce le renforcement des dispositifs de détection et de sanction pour les éditions à venir. Ceux qui salissent ce sport n\'y ont pas leur place.',
  ],
];

const CMF_COMMUNIQUE_PALMARES: [string, string][] = [
  [
    'CMF — Pour l\'Histoire : {team} entre dans les records de la compétition',
    'La Commission enregistre officiellement la performance réalisée par {team} ({score}). Un résultat qui figurera au palmarès des faits marquants de cette édition. La CMF salue une démonstration sportive qui restera dans les annales et rappelle que ce sont ces moments qui font la grandeur de la compétition.',
  ],
  [
    'Communiqué CMF — Une performance historique signée {team}',
    'La CMF tient à souligner la performance exceptionnelle de {team} ({score}), inscrite parmi les résultats de référence de la compétition. Au-delà du sportif, c\'est une page qui s\'écrit. La Commission adresse ses félicitations institutionnelles à l\'ensemble de la délégation.',
  ],
  [
    'CMF — {team} au tableau d\'honneur de la compétition',
    'La performance de {team} ({score}) est officiellement portée au palmarès des grands moments de cette édition. La CMF, garante de la mémoire de la compétition, se félicite de voir le niveau de jeu atteindre de tels sommets. Un exploit qui inspirera, à n\'en pas douter, les générations futures.',
  ],
];

export function generateCmfCommunique(opts: {
  round: number;
  seed: string;
  type: 'doping_player' | 'doping_team' | 'corruption' | 'corruption_points' | 'drame' | 'discipline' | 'huis_clos' | 'palmares';
  matchId?: string;
  matchSnapshot?: NonNullable<PressItem['matchSnapshot']>;
  /** Player name for doping_player — injected into headline/body via {player} */
  playerName?: string;
  /** Full player data for doping_player — enables clickable mention */
  dopingPlayer?: Player;
  /** For palmares — team name + score injected via {team}/{score} */
  teamName?: string;
  score?: string;
}): PressItem {
  const r = rng(opts.seed + 'communique');
  let headline: string;
  let body: string;
  if (opts.type === 'doping_player') {
    [headline, body] = pick(CMF_COMMUNIQUE_DOPING_PLAYER, r);
    const name = opts.playerName ?? 'un joueur';
    headline = headline.replace(/{player}/g, name);
    body = body.replace(/{player}/g, name);
  } else if (opts.type === 'doping_team') {
    [headline, body] = pick(CMF_COMMUNIQUE_DOPING_TEAM, r);
  } else if (opts.type === 'corruption_points') {
    [headline, body] = pick(CMF_COMMUNIQUE_CORRUPTION_POINTS, r);
  } else if (opts.type === 'corruption') {
    [headline, body] = pick(CMF_COMMUNIQUE_CORRUPTION, r);
  } else if (opts.type === 'discipline') {
    [headline, body] = pick(CMF_COMMUNIQUE_DISCIPLINE, r);
    const snap = opts.matchSnapshot;
    const cards = snap?.stats
      ? snap.stats.yellowCards.home + snap.stats.yellowCards.away + snap.stats.redCards.home + snap.stats.redCards.away
      : 0;
    const inject = (s: string) => s
      .replace(/{cards}/g, String(cards))
      .replace(/{homeTeam}/g, snap?.homeTeamName ?? 'l\'équipe locale')
      .replace(/{awayTeam}/g, snap?.awayTeamName ?? 'l\'équipe visiteuse');
    headline = inject(headline);
    body = inject(body);
  } else if (opts.type === 'huis_clos') {
    [headline, body] = pick(CMF_COMMUNIQUE_HUIS_CLOS, r);
    const snap = opts.matchSnapshot;
    const inject = (s: string) => s
      .replace(/{homeTeam}/g, snap?.homeTeamName ?? 'l\'équipe locale')
      .replace(/{awayTeam}/g, snap?.awayTeamName ?? 'l\'équipe visiteuse');
    headline = inject(headline);
    body = inject(body);
  } else if (opts.type === 'palmares') {
    [headline, body] = pick(CMF_COMMUNIQUE_PALMARES, r);
    const inject = (s: string) => s
      .replace(/{team}/g, opts.teamName ?? 'l\'équipe')
      .replace(/{score}/g, opts.score ?? '');
    headline = inject(headline);
    body = inject(body);
  } else {
    [headline, body] = pick(CMF_COMMUNIQUE_DRAME, r);
  }
  const mentions: PressMention[] = [];
  if (opts.type === 'doping_player' && opts.dopingPlayer) {
    const p = opts.dopingPlayer;
    mentions.push({
      type: 'player',
      name: `${p.firstName} ${p.lastName}`,
      overall: p.overall,
      position: p.position,
      stats: {
        technical: p.stats.technical as unknown as Record<string, number>,
        mental: p.stats.mental as unknown as Record<string, number>,
        physical: p.stats.physical as unknown as Record<string, number>,
        goalkeeping: p.stats.goalkeeping as unknown as Record<string, number> | undefined,
      },
    });
  }
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: null,
    category: 'cmf',
    headline,
    body,
    createdAt: new Date().toISOString(),
    matchId: opts.matchId,
    matchSnapshot: opts.matchSnapshot,
    mentions: mentions.length > 0 ? mentions : undefined,
  };
}

/** Press article: CMF opens enquête (ref denounces bribery attempt before match). */
export function generateCmfEnqueteItem(opts: {
  round: number;
  seed: string;
  teamId: string;
  teamName: string;
  matchId?: string;
  matchSnapshot?: NonNullable<PressItem['matchSnapshot']>;
}): PressItem {
  const r = rng(opts.seed + 'enquete');
  const [headline, body] = pick(CMF_ENQUETE_PAIRS, r);
  const sub = (s: string) => s.replace(/{team}/g, opts.teamName);
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.teamId,
    category: 'cmf',
    headline: sub(headline),
    body: sub(body),
    createdAt: new Date().toISOString(),
    matchId: opts.matchId,
    matchSnapshot: opts.matchSnapshot,
  };
}

/** Press article: CMF renders judgment (walkover applied or acquittal). */
export function generateCmfJugementItem(opts: {
  round: number;
  seed: string;
  teamId: string;
  teamName: string;
  walkoverApplied: boolean;
  matchId?: string;
  matchSnapshot?: NonNullable<PressItem['matchSnapshot']>;
}): PressItem {
  const r = rng(opts.seed + 'jugement');
  const pairs = opts.walkoverApplied ? CMF_JUGEMENT_WALKOVER_PAIRS : CMF_JUGEMENT_ACQUITTE_PAIRS;
  const [headline, body] = pick(pairs, r);
  const sub = (s: string) => s.replace(/{team}/g, opts.teamName);
  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.teamId,
    category: 'cmf',
    headline: sub(headline),
    body: sub(body),
    createdAt: new Date().toISOString(),
    matchId: opts.matchId,
    matchSnapshot: opts.matchSnapshot,
  };
}

// ── CMF — articles institutionnels de phase ───────────────────────────────────

export type CmfOpts = {
  round: number;
  seed: string;
  competitionName: string;
  format: string;
  phase: string;
  moment: 'debut' | 'fin' | 'palmares';
  teamSnapshot: Record<string, { name: string; flag: string; slug?: string; globalStrength?: number }>;
  standings: Record<string, import('./types').Standing>;
  playerStats: Record<string, import('./types').PlayerCompStats>;
  winner?: string;
  /** If provided, favoris are restricted to these team IDs (qualified teams for the new phase) */
  qualifiedTeamIds?: string[];
  /** True only for the very first draw/debut — enables the "tout ce qu'il faut savoir" format article */
  isFirstDraw?: boolean;
  /** For lpm_playoff debut: pairs of (homeTeamId, awayTeamId) for the barrage draw */
  playoffPairs?: { homeTeamId: string; awayTeamId: string }[];
};

// Phase labels
const PHASE_LABEL: Record<string, string> = {
  group: 'Phase de groupes',
  league: 'Phase de championnat',
  lpm_playoff: 'Barrages LPM',
  R64: 'Trente-deuxièmes de finale',
  R32: 'Seizièmes de finale',
  R16: 'Huitièmes de finale',
  QF: 'Quarts de finale',
  SF: 'Demi-finales',
  F: 'Finale',
  '3rd': 'Match pour la 3e place',
};

// CMF debut de phase templates
const CMF_DEBUT_LEAGUE = [
  {
    headline: (compName: string) => `${compName} — le coup d'envoi de la compétition !`,
    body: (compName: string) => `La ${compName} débute officiellement. Les équipes ont terminé leurs préparations, les effectifs sont au complet, et les premières rencontres s'annoncent serrées. Qui prendra les devants dès cette première journée ?`,
  },
  {
    headline: (compName: string) => `La ${compName} est lancée — présentation des favoris`,
    body: (_compName: string) => `La compétition démarre. Sur la base des effectifs recensés, nos analystes ont établi une hiérarchie préliminaire. Mais dans ce sport, les surprises font partie du jeu.`,
  },
  {
    headline: (compName: string) => `C'est parti ! La ${compName} ouvre ses portes`,
    body: (compName: string) => `Le rideau se lève sur la ${compName}. Les favoris sont connus, les outsiders prêts à bousculer l'ordre établi. La compétition promet d'être intense de bout en bout.`,
  },
];

const CMF_DEBUT_GROUP = [
  {
    headline: (compName: string) => `${compName} — la phase de groupes est officiellement ouverte`,
    body: (compName: string) => `La phase de poules de la ${compName} débute ce soir. {count} équipes réparties en groupes s'affrontent pour décrocher leur qualification. Les pronostics sont lancés, les favoris identifiés.`,
  },
  {
    headline: (compName: string) => `Phase de groupes ${compName} : qui passera la première étape ?`,
    body: (compName: string) => `La phase de poules de la ${compName} débute. Chaque point comptera. Nos analystes ont regardé les effectifs — voici leurs premières impressions.`,
  },
];

const CMF_DEBUT_KNOCKOUT = [
  {
    headline: (phase: string, compName: string) => `${PHASE_LABEL[phase] ?? phase} de la ${compName} — le tableau s'affine`,
    body: (phase: string, compName: string) => `La ${compName} entre dans sa phase éliminatoire avec les ${PHASE_LABEL[phase] ?? phase}. Une seule erreur et c'est l'élimination. Les équipes encore en lice ont tout à prouver.`,
  },
  {
    headline: (phase: string, compName: string) => `${compName} — place aux ${PHASE_LABEL[phase] ?? phase} !`,
    body: (phase: string, compName: string) => `La tension monte d'un cran. Les ${PHASE_LABEL[phase] ?? phase} de la ${compName} débutent, et avec elles, la vraie compétition. Qui survivra à cette étape ?`,
  },
];

const CMF_FIN_PHASE = [
  {
    headline: (phase: string, compName: string) => `Bilan de la ${PHASE_LABEL[phase] ?? phase} — la ${compName} avance`,
    body: (phase: string) => `La ${PHASE_LABEL[phase] ?? phase} est terminée. Les qualifiés sont connus, les éliminés rentrent chez eux. Le bilan est sans appel : certaines équipes ont confirmé leur statut, d'autres ont surpris.`,
  },
  {
    headline: (phase: string, compName: string) => `${PHASE_LABEL[phase] ?? phase} de la ${compName} : rideau`,
    body: (phase: string) => `La ${PHASE_LABEL[phase] ?? phase} a rendu son verdict. Les équipes qualifiées pour la suite ont montré qu'elles méritaient leur place. Analyse des forces en présence avant la prochaine étape.`,
  },
];

const CMF_PALMARES_LEAGUE = [
  {
    headline: (winner: string, compName: string) => `CHAMPION ! ${winner} remporte la ${compName} !`,
    body: (winner: string, compName: string) => `${winner} est sacré champion de la ${compName}. Une campagne remarquable, couronnée d'un titre mérité. Le palmarès individuel vient compléter ce tableau de gloire.`,
  },
  {
    headline: (winner: string, compName: string) => `${winner} conquiert la ${compName} — le bilan complet`,
    body: (winner: string, compName: string) => `La ${compName} a son vainqueur : ${winner}. Un titre qui récompense la régularité et le talent. Les distinctions individuelles viennent compléter ce palmarès.`,
  },
];

const CMF_PALMARES_CUP = [
  {
    headline: (winner: string, compName: string) => `${winner} CHAMPION DE LA ${compName.toUpperCase()} !`,
    body: (winner: string, compName: string) => `${winner} soulève le trophée de la ${compName}. Une compétition intense, des rencontres mémorables, et un vainqueur qui s'est imposé dans les moments clés. Retour sur un palmarès historique.`,
  },
  {
    headline: (winner: string, compName: string) => `LA GLOIRE POUR ${winner} — palmarès de la ${compName}`,
    body: (winner: string, compName: string) => `Le titre est décerné. ${winner} entre dans l'histoire de la ${compName}. La cérémonie de clôture a célébré les meilleurs acteurs de cette édition.`,
  },
];

const CMF_DEBUT_BARRAGE_LPM = [
  {
    headline: (compName: string) => `Barrages ${compName} — le tirage est connu, les favoris désignés`,
    body: (compName: string) => `Les barrages de la ${compName} sont lancés. Les équipes classées de la 25e à la 40e place s'affrontent en matchs aller-retour pour les dernières places qualificatives pour la Coupe du Monde. La CMF présente ses pronostics pour chaque affrontement.`,
  },
  {
    headline: (compName: string) => `${compName} — barrages : qui décrochera le dernier billet ?`,
    body: (compName: string) => `Le tirage des barrages de la ${compName} est tombé. Huit duels aller-retour pour huit billets pour la Coupe du Monde. La tension est maximale. Voici l'analyse barrage par barrage de la CMF.`,
  },
];

const CMF_PALMARES_LPM = [
  {
    headline: (compName: string) => `${compName} terminée — les 24 qualifiés pour la Coupe du Monde sont connus`,
    body: (compName: string) => `La ${compName} a rendu son verdict. Les 24 équipes qui rejoindront la phase finale de la Coupe du Monde sont officiellement qualifiées. Une LPM riche en rebondissements qui a produit son lot de surprises et de confirmations.`,
  },
  {
    headline: (compName: string) => `Rideau sur la ${compName} — le chemin vers la Coupe du Monde est tracé`,
    body: (compName: string) => `La ${compName} s'achève. Les qualifiés pour la Coupe du Monde sont désignés. Retour sur une compétition dense, éprouvante, et parfois cruelle pour ceux qui ont échoué aux portes de la qualification.`,
  },
];



function topTeams(
  teamIds: string[],
  teamSnapshot: Record<string, { name: string; flag: string; slug?: string; globalStrength?: number }>,
  _standings: Record<string, import('./types').Standing>,
  playerStats: Record<string, import('./types').PlayerCompStats>,
  count = 3,
): { teamId: string; teamName: string; overall: number; cote: number }[] {
  const teamOverall: Record<string, number[]> = {};
  for (const p of Object.values(playerStats)) {
    if (!teamOverall[p.teamId]) teamOverall[p.teamId] = [];
    teamOverall[p.teamId].push(p.overall);
  }
  const avgOverall = (tid: string) => {
    const gs = teamSnapshot[tid]?.globalStrength;
    if (gs !== undefined && gs > 0) return gs;
    const arr = teamOverall[tid];
    if (!arr || arr.length === 0) return 50;
    return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
  };
  const all = teamIds.map((tid) => ({ teamId: tid, teamName: teamSnapshot[tid]?.name ?? tid, overall: avgOverall(tid) }));
  // Cote bookmaker : P(team) ∝ overall² / sum(overall²), cote = 1/P rounded to 2 decimals, min 1.01
  const totalSq = all.reduce((s, t) => s + t.overall * t.overall, 0) || 1;
  return all
    .sort((a, b) => b.overall - a.overall)
    .slice(0, count)
    .map((t) => {
      const prob = (t.overall * t.overall) / totalSq;
      const cote = prob > 0 ? Math.max(1.01, Math.round((1 / prob) * 100) / 100) : 99;
      return { ...t, cote };
    });
}

function topScorerFromStats(stats: Record<string, import('./types').PlayerCompStats>) {
  const all = Object.values(stats).filter((p) => p.goals > 0);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.goals - a.goals || b.avgRating - a.avgRating)[0];
}

function topAssisterFromStats(stats: Record<string, import('./types').PlayerCompStats>) {
  const all = Object.values(stats).filter((p) => p.assists > 0);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.assists - a.assists || b.avgRating - a.avgRating)[0];
}

function bestPlayerFromStats(stats: Record<string, import('./types').PlayerCompStats>) {
  const all = Object.values(stats).filter((p) => p.matchRatings.length >= 2);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.avgRating - a.avgRating)[0];
}

function bestGKFromStats(stats: Record<string, import('./types').PlayerCompStats>) {
  const all = Object.values(stats).filter((p) => p.position === 'GK' && p.cleanSheets >= 0);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.cleanSheets - a.cleanSheets || b.avgRating - a.avgRating)[0];
}

export function generateCmfItems(opts: CmfOpts): PressItem[] {
  const r = rng(opts.seed + 'cmf');
  const items: PressItem[] = [];
  const isLPM = opts.format === 'lpm';
  const isCDM = !!(opts.competitionName && /coupe du monde|world cup/i.test(opts.competitionName));
  const isGroupPhase = opts.phase === 'group' || opts.phase === 'league';
  const teamIds = opts.qualifiedTeamIds ?? Object.keys(opts.standings);
  const favTeams = opts.moment !== 'debut' ? [] : topTeams(teamIds, opts.teamSnapshot, opts.standings, opts.playerStats, 3);

  // Count: LPM always gets 3 articles (Format LPM article must always appear); others 2 or 3
  const count = isLPM ? 3 : 2 + (r() < 0.5 ? 1 : 0);

  // ── Début de phase ──────────────────────────────────────────────────────────
  if (opts.moment === 'debut') {
    const scorer = topScorerFromStats(opts.playerStats);
    const assister = topAssisterFromStats(opts.playerStats);
    const best = bestPlayerFromStats(opts.playerStats);
    const gk = bestGKFromStats(opts.playerStats);

    // Article 1 — ouverture institutionnelle
    let tpl;
    if (isGroupPhase) {
      tpl = pick(opts.phase === 'group' ? CMF_DEBUT_GROUP : CMF_DEBUT_LEAGUE, r);
      const h = (tpl as typeof CMF_DEBUT_LEAGUE[0]).headline(opts.competitionName);
      let b = (tpl as typeof CMF_DEBUT_LEAGUE[0]).body(opts.competitionName)
        .replace(/{count}/g, String(teamIds.length));
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: h, body: b, createdAt: new Date().toISOString(),
        cmfSnapshot: { phase: opts.phase, moment: 'debut', favoriteTeams: favTeams },
      });
    } else {
      const ktpl = pick(CMF_DEBUT_KNOCKOUT, r);
      const h = ktpl.headline(opts.phase, opts.competitionName);
      let b = ktpl.body(opts.phase, opts.competitionName);
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: h, body: b, createdAt: new Date().toISOString(),
        cmfSnapshot: { phase: opts.phase, moment: 'debut', favoriteTeams: favTeams },
      });
    }

    // Article 2+ — pronostics individuels (basés sur les premiers matchs si dispo, sinon pronostic à blanc)
    if (count >= 2) {
      const hasStats = scorer || assister || best || gk;
      let b2 = isLPM
        ? hasStats
          ? `Après les premiers matchs, la CMF établit ses pronostics individuels provisoires pour la LPM.`
          : `La CMF livrera ses pronostics individuels au fil de la compétition. Nos favoris initiaux sont basés sur les effectifs recensés.`
        : isCDM
          ? hasStats
            ? `Premiers bilans individuels de la Coupe du Monde — les premières tendances se dessinent.`
            : `La Coupe du Monde distinguera ses meilleurs acteurs à l'issue de la compétition. Voici nos pronostics initiaux basés sur les effectifs.`
          : hasStats
            ? `Premiers bilans individuels — les tendances de début de compétition.`
            : `La CMF distinguera les meilleurs acteurs. Pronostics basés sur les effectifs en présence.`;
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: `Pronostics CMF — ${PHASE_LABEL[opts.phase] ?? opts.phase} de la ${opts.competitionName}`,
        body: b2, createdAt: new Date().toISOString(),
        cmfSnapshot: {
          phase: opts.phase, moment: 'debut', favoriteTeams: [],
          topScorer: scorer ? { playerName: scorer.playerName, teamId: scorer.teamId, teamName: scorer.teamName, goals: scorer.goals, overall: scorer.overall } : undefined,
          topAssister: assister ? { playerName: assister.playerName, teamId: assister.teamId, teamName: assister.teamName, assists: assister.assists, overall: assister.overall } : undefined,
          bestPlayer: best ? { playerName: best.playerName, teamId: best.teamId, teamName: best.teamName, avgRating: best.avgRating, overall: best.overall } : undefined,
          bestGK: gk ? { playerName: gk.playerName, teamId: gk.teamId, teamName: gk.teamName, cleanSheets: gk.cleanSheets, overall: gk.overall } : undefined,
        },
      });
    }

    // Article 3 (optionnel) — contexte LPM/CDM/format, uniquement au PREMIER tirage
    if (count >= 3 && opts.isFirstDraw) {
      const contextBody = isLPM
        ? `La LPM (Ligue Préliminaire Mondiale) est le tournoi qualificatif pour la Coupe du Monde. Les 24 premières équipes du classement final décrocheront leur billet. Les places 25 à 40 disputeront des barrages aller-retour. Pour les 16 dernières, c'est l'élimination directe.`
        : isCDM
          ? `La Coupe du Monde réunit les meilleures nations qualifiées via la LPM. Le format en groupes puis phases finales garantit des confrontations de haut niveau à chaque étape. Chaque erreur peut coûter l'élimination.`
          : `La compétition oppose les équipes dans un format conçu pour révéler les meilleurs. La CMF veille à l'équité sportive et à la qualité du jeu. Que le meilleur groupe gagne.`;
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: isLPM ? 'Format LPM — tout ce qu\'il faut savoir' : isCDM ? 'Format de la Coupe du Monde — rappel' : `Format de la ${opts.competitionName}`,
        body: contextBody, createdAt: new Date().toISOString(),
        cmfSnapshot: { phase: opts.phase, moment: 'debut', favoriteTeams: [] },
      });
    }

    // ── Barrages LPM — article spécial favori par paire ──────────────────────
    if (opts.phase === 'lpm_playoff' && opts.playoffPairs && opts.playoffPairs.length > 0) {
      const tpl = pick(CMF_DEBUT_BARRAGE_LPM, r);
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: tpl.headline(opts.competitionName),
        body: tpl.body(opts.competitionName),
        createdAt: new Date().toISOString(),
        cmfSnapshot: {
          phase: opts.phase, moment: 'debut',
          favoriteTeams: [],
          playoffPairs: opts.playoffPairs.map((pair) => {
            const homeSnap = opts.teamSnapshot[pair.homeTeamId];
            const awaySnap = opts.teamSnapshot[pair.awayTeamId];
            const homeStr = homeSnap?.globalStrength ?? 50;
            const awayStr = awaySnap?.globalStrength ?? 50;
            // % qualification par équipe : P ∝ force² (même modèle que computeMatchCotes)
            const hSq = homeStr * homeStr;
            const aSq = awayStr * awayStr;
            const totalSq = hSq + aSq || 1;
            const homeQualifyPct = Math.round((hSq / totalSq) * 100);
            const awayQualifyPct = 100 - homeQualifyPct;
            const favTeamId = homeStr >= awayStr ? pair.homeTeamId : pair.awayTeamId;
            const underdogId = homeStr >= awayStr ? pair.awayTeamId : pair.homeTeamId;
            return {
              homeTeamId: pair.homeTeamId,
              homeTeamName: homeSnap?.name ?? pair.homeTeamId,
              awayTeamId: pair.awayTeamId,
              awayTeamName: awaySnap?.name ?? pair.awayTeamId,
              favoriteTeamId: favTeamId,
              favoriteTeamName: opts.teamSnapshot[favTeamId]?.name ?? favTeamId,
              underdogTeamId: underdogId,
              underdogTeamName: opts.teamSnapshot[underdogId]?.name ?? underdogId,
              homeQualifyPct,
              awayQualifyPct,
            };
          }),
        },
      });
    }
  }

  // ── Fin de phase ────────────────────────────────────────────────────────────
  if (opts.moment === 'fin') {
    const scorer = topScorerFromStats(opts.playerStats);
    const assister = topAssisterFromStats(opts.playerStats);
    const best = bestPlayerFromStats(opts.playerStats);
    const gk = bestGKFromStats(opts.playerStats);
    const favCurrent = topTeams(teamIds, opts.teamSnapshot, opts.standings, opts.playerStats, 3);

    const tpl = pick(CMF_FIN_PHASE, r);
    let b = tpl.body(opts.phase);
    items.push({
      id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
      headline: tpl.headline(opts.phase, opts.competitionName),
      body: b, createdAt: new Date().toISOString(),
      cmfSnapshot: { phase: opts.phase, moment: 'fin', favoriteTeams: favCurrent },
    });

    if (count >= 2) {
      let b2 = `Bilan individuel à l'issue de la ${PHASE_LABEL[opts.phase] ?? opts.phase} :`;
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: `Statistiques individuelles — bilan de la ${PHASE_LABEL[opts.phase] ?? opts.phase}`,
        body: b2, createdAt: new Date().toISOString(),
        cmfSnapshot: {
          phase: opts.phase, moment: 'fin', favoriteTeams: [],
          topScorer: scorer ? { playerName: scorer.playerName, teamId: scorer.teamId, teamName: scorer.teamName, goals: scorer.goals, overall: scorer.overall } : undefined,
          topAssister: assister ? { playerName: assister.playerName, teamId: assister.teamId, teamName: assister.teamName, assists: assister.assists, overall: assister.overall } : undefined,
          bestPlayer: best ? { playerName: best.playerName, teamId: best.teamId, teamName: best.teamName, avgRating: best.avgRating, overall: best.overall } : undefined,
          bestGK: gk ? { playerName: gk.playerName, teamId: gk.teamId, teamName: gk.teamName, cleanSheets: gk.cleanSheets, overall: gk.overall } : undefined,
        },
      });
    }

    if (count >= 3) {
      const nextPhase = opts.phase === 'group' ? 'R16' : opts.phase === 'R16' ? 'QF' : opts.phase === 'QF' ? 'SF' : opts.phase === 'SF' ? 'F' : null;
      const nextLabel = nextPhase ? (PHASE_LABEL[nextPhase] ?? nextPhase) : 'la prochaine étape';
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: `Cap sur ${nextLabel} — la CMF analyse`,
        body: `Après la ${PHASE_LABEL[opts.phase] ?? opts.phase}, place à ${nextLabel}. Les équipes encore en lice connaissent leurs adversaires. Les pronostics sont relancés, les stratégies ajustées. Rendez-vous sur le terrain pour savoir qui aura raison.`,
        createdAt: new Date().toISOString(),
        cmfSnapshot: { phase: opts.phase, moment: 'fin', favoriteTeams: [] },
      });
    }
  }

  // ── Palmarès / fin de compétition ──────────────────────────────────────────
  if (opts.moment === 'palmares') {
    const scorer = topScorerFromStats(opts.playerStats);
    const assister = topAssisterFromStats(opts.playerStats);
    const best = bestPlayerFromStats(opts.playerStats);
    const gk = bestGKFromStats(opts.playerStats);
    const winnerName = opts.winner ? (opts.teamSnapshot[opts.winner]?.name ?? opts.winner) : null;

    let mainTpl;
    let mainH: string;
    let mainB: string;
    if (isLPM) {
      mainTpl = pick(CMF_PALMARES_LPM, r);
      mainH = mainTpl.headline(opts.competitionName);
      mainB = mainTpl.body(opts.competitionName);
    } else if (winnerName) {
      mainTpl = pick(opts.format === 'league' ? CMF_PALMARES_LEAGUE : CMF_PALMARES_CUP, r);
      mainH = (mainTpl as typeof CMF_PALMARES_LEAGUE[0]).headline(winnerName, opts.competitionName);
      mainB = (mainTpl as typeof CMF_PALMARES_LEAGUE[0]).body(winnerName, opts.competitionName);
    } else {
      mainH = `${opts.competitionName} — palmarès final`;
      mainB = `La compétition s'est achevée. Voici le bilan final établi par la CMF.`;
    }
    items.push({
      id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
      headline: mainH, body: mainB, createdAt: new Date().toISOString(),
      cmfSnapshot: {
        phase: opts.phase, moment: 'palmares', favoriteTeams: [],
        winner: opts.winner && winnerName ? { teamId: opts.winner, teamName: winnerName } : undefined,
      },
    });

    // Distinctions individuelles
    if (count >= 2) {
      let b2 = `La CMF a décerné ses trophées individuels pour cette édition de la ${opts.competitionName} :`;
      if (!scorer && !assister && !best && !gk) b2 += '\n\nAucune statistique individuelle enregistrée pour cette édition.';
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: `Trophées individuels CMF — ${opts.competitionName}`,
        body: b2, createdAt: new Date().toISOString(),
        cmfSnapshot: {
          phase: opts.phase, moment: 'palmares', favoriteTeams: [],
          topScorer: scorer ? { playerName: scorer.playerName, teamId: scorer.teamId, teamName: scorer.teamName, goals: scorer.goals, overall: scorer.overall } : undefined,
          topAssister: assister ? { playerName: assister.playerName, teamId: assister.teamId, teamName: assister.teamName, assists: assister.assists, overall: assister.overall } : undefined,
          bestPlayer: best ? { playerName: best.playerName, teamId: best.teamId, teamName: best.teamName, avgRating: best.avgRating, overall: best.overall } : undefined,
          bestGK: gk ? { playerName: gk.playerName, teamId: gk.teamId, teamName: gk.teamName, cleanSheets: gk.cleanSheets, overall: gk.overall } : undefined,
          winner: opts.winner && winnerName ? { teamId: opts.winner, teamName: winnerName } : undefined,
        },
      });
    }

    if (count >= 3) {
      const epilogue = isLPM
        ? `La LPM a tenu ses promesses. Résistances inattendues, qualifications méritées, éliminations cruelles. Les 24 équipes qualifiées pour la Coupe du Monde savent qu'elles ont gagné leur place au mérite. Rendez-vous sur la plus grande scène.`
        : isCDM
          ? `La Coupe du Monde s'achève. Elle laisse derrière elle des images, des émotions, et une nation sacrée championne du monde. Les autres rentrent chez eux avec des souvenirs et des regrets. C'est la beauté et la cruauté du football.`
          : `La compétition s'achève. Un vainqueur, des regrets, et la promesse que la prochaine édition sera encore plus belle. La CMF remercie toutes les équipes participantes pour leur engagement.`;
      items.push({
        id: crypto.randomUUID(), round: opts.round, teamId: null, category: 'cmf',
        headline: isLPM ? 'Épilogue LPM — cap sur la Coupe du Monde' : isCDM ? 'Épilogue — la Coupe du Monde a rendu son verdict' : `Épilogue — la ${opts.competitionName} referme ses portes`,
        body: epilogue, createdAt: new Date().toISOString(),
        cmfSnapshot: { phase: opts.phase, moment: 'palmares', favoriteTeams: [], winner: opts.winner && winnerName ? { teamId: opts.winner, teamName: winnerName } : undefined },
      });
    }
  }

  return items;
}

export const PRESS_CATEGORY_LABEL: Record<PressCategory, string> = {
  victoire: 'Victoire',
  defaite: 'Défaite',
  scandale: 'Scandale',
  forme: 'Forme',
  crise: 'Crise',
  neutralite: 'Nul',
  exploit: 'Exploit',
  critique: 'Critique',
  revolte: 'Révolte',
  drame: 'Drame',
  cmf: 'CMF',
  arbitrage: 'Arbitrage',
};

export const PRESS_CATEGORY_COLOR: Record<PressCategory, string> = {
  victoire: 'text-green-400 bg-green-400/10 border-green-400/20',
  defaite: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  scandale: 'text-danger bg-danger/10 border-danger/20',
  forme: 'text-accent bg-accent/10 border-accent/20',
  crise: 'text-red-500 bg-red-500/10 border-red-500/20',
  neutralite: 'text-muted bg-border/40 border-border',
  exploit: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  critique: 'text-orange-600 bg-orange-600/10 border-orange-600/30',
  revolte: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  drame: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
  cmf: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  arbitrage: 'text-amber-300 bg-amber-400/10 border-amber-400/25',
};
