/** Press / media system — generates narrative articles after match events. */

import type { Suspension } from './injuries';
import { createSuspension } from './injuries';
import type { Standing } from './types';
import type { Player } from '@/lib/types';
import type { Coach } from '@/lib/gen/coach';

export type PressCategory = 'victoire' | 'defaite' | 'scandale' | 'forme' | 'crise' | 'neutralite' | 'exploit' | 'critique' | 'revolte' | 'drame' | 'cmf';

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

export type PressMention = PressMentionPlayer | PressMentionCoach;

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
  };
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
];
const MANITA_HEADLINES = [
  'MANITA : {team} signe la performance de la saison',
  'GOLEADA : {team} signe un résultat historique dans cette compétition',
  '5-0 : {team} entre dans une autre dimension — la compétition est prévenue',
  'MASSACRE : {team} inflige une correction historique',
];
const MANITA_BODIES = [
  'Une manita. Un résultat qui résonne dans toute la compétition. {team} envoie un message fort à ses concurrents.',
  'Ce score n\'est pas un accident. {team} a construit cette goleada pied à pied, avec méthode. Une domination totale, dans tous les compartiments du jeu.',
  'Cinq buts. Cinq. L\'adversaire n\'a pas existé. {team} a joué à son propre niveau ce soir — et son niveau est bien au-dessus du reste.',
  'Le tableau d\'affichage ne ment pas. {team} a humilié un adversaire entier en 90 minutes. Ce genre de résultat ne s\'oublie pas.',
];

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
    'Scandale de vestiaire chez {team} : une vidéo compromettante circule',
    'Une vidéo filmée à l\'intérieur du vestiaire de {team} après un match serait en train de circuler dans certains cercles médiatiques. Son contenu exact reste flou, mais les réactions au sein du groupe sont vives. Le staff a formellement nié toute fuite organisée.',
  ],
  [
    '{team} accusé d\'avoir falsifié des documents d\'identité de joueurs',
    'Une enquête administrative est en cours après des doutes sur l\'âge réel de deux joueurs de {team}. Si les faits sont avérés, des sanctions sportives lourdes pourraient tomber. La fédération parle d\'une "affaire extrêmement sérieuse".',
  ],
  [
    'Altercation entre un joueur de {team} et un fan après le match',
    'En quittant le stade, un joueur de {team} aurait répondu de façon virulente à des provocations de supporters adverses. La scène aurait dégénéré. Des témoins ont parlé à la presse. Le joueur "regrette" — selon le communiqué officiel.',
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

/** Inséré quand l'équipe est en danger de relégation/élimination après défaite */
const STANDINGS_DANGER_LOSS = [
  '{team} glisse vers la zone de relégation. L\'urgence est réelle.',
  'La défaite plonge {team} dans une situation critique au classement. Il faut réagir.',
  '{team} regarde désormais vers le bas du tableau. Un scénario cauchemardesque se profile.',
  'La marge se réduit dangereusement pour {team}. Le prochain match sera vital.',
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
  '{team} n\'aura pas droit aux barrages de la peur. Le classement est sans appel : cette élimination directe est la sanction d\'une compétition ratée de A à Z. Dans les tribunes, les supporters ne cachent pas leur colère et leur honte.',
  'Sortie par le fond. {team} termine dans les dernières places et dit au revoir à la compétition sans avoir jamais existé vraiment. Un résultat cruel mais mérité au vu des prestations affichées.',
];

// ── Templates contextuels — phases finales ───────────────────────────────────

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
  R32: [
    '{team} franchit les huitièmes de finale — le tableau s\'ouvre',
    'Qualification de {team} : le rendez-vous des quarts est pris',
    '{team} passe le cap des huitièmes avec autorité',
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
  ],
  '3rd': [
    '{team} termine troisième — une médaille de bronze bien méritée',
    '{team} s\'offre la troisième place — la compétition s\'achève en beauté',
  ],
};

const KO_WIN_BODIES: Record<string, string[]> = {
  R32: [
    'La qualification est acquise et c\'est amplement mérité. {team} a montré qu\'il avait les arguments pour aller loin dans cette compétition.',
    'En huitièmes de finale, {team} a su faire le travail. Le groupe est serein, le staff déjà tourné vers la suite.',
    '{team} avance dans le tableau et chaque victoire renforce la croyance collective. Les quarts de finale se profilent.',
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
  ],
  '3rd': [
    '{team} repart avec une médaille de bronze. Ce n\'était pas l\'objectif premier, mais dans les circonstances, ce résultat représente une belle récompense pour un groupe qui a tout donné.',
    'La déception de la demi-finale est derrière eux. {team} a répondu présent et termine sur une note positive. Les joueurs quittent la compétition la tête haute.',
  ],
};

const KO_LOSS_HEADLINES: Record<string, string[]> = {
  R32: [
    '{team} éliminé dès les huitièmes — l\'aventure s\'arrête trop tôt',
    'Au revoir trop précoce pour {team} — huitièmes fatals',
    '{team} tombe en huitièmes : une élimination amère',
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
  R32: [
    'L\'aventure de {team} s\'arrête aux huitièmes. Une élimination prématurée qui laissera des traces. Le groupe s\'était donné les moyens d\'aller plus loin — il n\'a pas su franchir ce cap.',
    'Huitièmes fatals pour {team}. Difficile d\'expliquer ce qui s\'est passé. L\'adversaire a été meilleur, et {team} n\'a pas trouvé les ressources pour inverser la tendance.',
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
    '{team} accusé de triche — le VAR au cœur de la polémique mondiale',
    'La rencontre de {team} laisse un arrière-goût amer. Plusieurs décisions arbitrales controversées, des accusations de simulation flagrante, et une communauté footballistique en ébullition. La presse mondiale s\'enflamme. La CMF promet une "analyse approfondie". {team} préfère ne pas commenter.',
  ],
  [
    'FUITE DE VESTIAIRE : des secrets de {team} révélés à la presse mondiale',
    'Un document confidentiel contenant les plans tactiques et les informations médicales privées de {team} a été transmis à plusieurs médias internationaux. Une taupe dans le groupe ? Un espionnage organisé ? L\'enquête interne est ouverte. Le staff de {team} est sous le choc.',
  ],
  [
    '{team} : le gardien suspendu pour geste grossier envers le public adverse',
    'Les images ont fait le tour du monde en moins d\'une heure. Le gardien de {team}, à l\'issue du match, a adressé un geste obscène aux supporters adverses. Convoqué en urgence par la commission disciplinaire de la CMF, il écope d\'une suspension immédiate. Le staff de {team} présente ses excuses, mais le mal est fait.',
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
];

const CRITIQUE_BODIES_L3_EXTRA = [
  'Qu\'est-ce qu\'on vient de voir ? {team} s\'est fait ouvrir en deux comme une bûche. Chaque contre adverse finissait au fond. Chaque balle en profondeur traversait la défense comme du papier mouillé. Aucun duel gagné, aucune réaction, aucune fierté. Ce groupe est fini.',
  'C\'est pas une défaite, c\'est une autopsie. {team} est mort tactiquement dès la 10e minute et personne n\'a bougé. Le coach a changé des joueurs — de nuls contre des nuls. Résultat identique. On se demande sincèrement ce que ces gens foutent là.',
  'Chaque fois qu\'on pensait que {team} ne pouvait pas tomber plus bas, ils trouvaient un étage en dessous. Ce soir, ils ont découvert le sous-sol. Passons : il n\'y a rien à analyser ici. Rien à sauver. Juste à tirer la chasse.',
  'Les adversaires s\'amusaient. Littéralement. Ils ricanaient entre eux en se passant le ballon face à {team} planté au milieu du terrain comme des poteaux. Et la réaction ? Quelques jurons, deux-trois gestes d\'énervement, retour à l\'hôtel. Scandaleux.',
  'On a compté les duels gagnés par {team} en seconde mi-temps. Deux. Deux sur quarante-cinq minutes. C\'est pas une stat de football, c\'est un crime contre le sport. Ce résultat est une punition juste et insuffisante à la fois.',
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
];

const CRISE_BODIES_EXTRA = [
  'La situation chez {team} dépasse les simples mauvais résultats. C\'est une crise profonde, systémique, qui touche tout le monde — joueurs, staff, dirigeants. Des sources internes parlent de "chaos organisé". Plus personne ne sait qui décide quoi, pourquoi, et comment. Et ça se voit sur le terrain.',
  'Des noms claquent dans le vestiaire de {team}. Des accusations fusent entre joueurs. Deux clans se regardent en chiens de faïence depuis plusieurs jours. Le staff fait semblant de ne pas voir. Mais tout le monde voit. Et tout le monde sait que ça ne peut pas durer.',
  'Le sélectionneur de {team} a convoqué l\'ensemble du groupe pour une réunion de crise. Deux heures de huis clos. À l\'issue : aucune déclaration, aucune image, aucun mot. Juste des visages fermés et des regards qui ne se croisent plus. On tire ses propres conclusions.',
  'Un joueur de {team} a refusé de participer à l\'échauffement ce matin. Le staff a géré en interne. Un autre aurait demandé à être libéré du groupe. Ces informations, démenties officiellement, sont confirmées par plusieurs sources proches du vestiaire. {team} est en train d\'imploser.',
  'Ce n\'est plus de la mauvaise passe — c\'est de la décomposition. {team} ne joue plus pour gagner. Il joue pour que ça finisse. Les automatismes ont disparu, la confiance aussi. Ce qui reste, c\'est une collection d\'individualités qui cohabitent sans se parler. Une équipe qui s\'effondre à petit feu.',
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
];

const REVOLTE_BODIES_EXTRA = [
  'On n\'avait jamais vu ça. Des centaines de supporters de {team} ont convergé vers la fédération dans la nuit, équipés de fumigènes, de cornes de brume et d\'une rage froide. Vitres brisées au rez-de-chaussée. Portes forcées. La police antiémeute a été déployée à 3h du matin. Les membres du comité n\'ont pas bougé de leurs bureaux. Des lâches retranchés derrière des vitres blindées pendant que leur sport brûle.',
  '"Vous nous avez menti, vous nous avez volé, vous nous avez humiliés." La banderole déployée devant la fédération de {team} résumait le sentiment général. Les supporters n\'étaient pas venus manifester — ils étaient venus exiger. Aucun délégué fédéral n\'a daigné se montrer. L\'erreur de leur vie.',
  'La nuit de {team} restera dans les annales. Bouteilles, fumigènes, chants de mort contre le comité. Un ancien international a tenté de calmer la foule depuis un mégaphone improvisé — il s\'est fait huer. Personne ne représente plus rien dans cette fédération. La rue a pris le pouvoir. Et la rue n\'est pas rassasiée.',
  'C\'est pas un mouvement de colère. C\'est un verdict populaire. Les supporters de {team} ont condamné le comité à mort publique ce soir devant la fédération. Cocktails Molotov pas encore lancés, mais l\'atmosphère y était. La police parle de "situation explosive". Un responsable local confie : "On ne sait pas jusqu\'où ça peut aller." Signe que personne ne contrôle plus rien.',
  '"Remboursez nos larmes." Ce message tagué sur la facade de la fédération {team} résume une décennie d\'humiliation. Les supporters n\'ont plus rien à perdre — et ça se voyait cette nuit. Aucune crainte, aucun recul, aucune retenue. Le point de rupture est dépassé depuis longtemps. Ce soir, il a juste été rendu visible.',
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
];

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

export type MatchPressResult = {
  item: PressItem;
  dopingSuspension: Suspension | null;
  teamDisqualified: boolean;
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
  /** ID of the CompMatch that generated this press item */
  matchId?: string;
  /** Match snapshot for the clickable match card */
  matchSnapshot?: PressItem['matchSnapshot'];
}): MatchPressResult {
  const r = rng(opts.seed);
  const diff = opts.goalsFor - opts.goalsAgainst;
  const isBigWin = diff >= 3;
  const isManita = diff >= 5;
  const isBigLoss = diff <= -3;
  const phase = opts.phase ?? 'league';
  const isKnockout = !['group', 'league', 'lpm_playoff'].includes(phase);
  const isWorldCup = opts.isWorldCup ?? false;

  let category: PressCategory;
  let headline: string;
  let body: string;
  let dopingSuspension: Suspension | null = null;
  let teamDisqualified = false;
  const mentions: PressMention[] = [];

  // Pick a notable player to mention in body (non-GK preferred)
  const nonGK = opts.players?.filter((p) => p.position !== 'GK') ?? [];
  const pool = nonGK.length > 0 ? nonGK : (opts.players ?? []);
  // Sort by overall desc, pick from top 5 so it's a key player, weighted by seed
  const top5 = pool.slice().sort((a, b) => b.overall - a.overall).slice(0, 5);
  const featuredPlayer = top5.length > 0 ? pick(top5, r) : null;
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

  // Scandale classique : 3% sur défaite, 0.8% sinon
  const scandalChance = isPlayerDoping || isTeamDoping ? 0 : (diff < 0 ? 0.03 : 0.008);
  const scandalize = r() < scandalChance;

  // Presse hostile : uniquement sur défaite, jamais si autre événement spécial
  const isHumiliation = diff <= -4;
  const isBrutalLoss = diff <= -3 && diff > -4;
  const critiqueable = !isPlayerDoping && !isTeamDoping && !scandalize && !opts.isEliminated && diff < 0;
  const critiqueChance = critiqueable
    ? (isHumiliation ? 0.40 : isBrutalLoss ? 0.22 : 0.10)
    : 0;
  const isCritique = r() < critiqueChance;
  let moraleShock: number | undefined;
  let moraleBoost: number | undefined;

  if (isTeamDoping) {
    category = 'scandale';
    const [h, b] = pick(TEAM_DOPING_PAIRS, r);
    headline = h.replace(/{team}/g, opts.teamName);
    body = b.replace(/{team}/g, opts.teamName);
    teamDisqualified = true;
  } else if (scandalize && isWorldCup) {
    category = 'scandale';
    const [h, b] = pick(WC_SCANDAL_PAIRS, r);
    headline = h.replace(/{team}/g, opts.teamName);
    body = b.replace(/{team}/g, opts.teamName);
  } else if (isPlayerDoping) {
    category = 'scandale';
    // Pick a specific player (non-GK, from pool already computed)
    const dopingVictim = pool.length > 0 ? pick(pool, r) : null;
    const victimName = dopingVictim ? `${dopingVictim.firstName} ${dopingVictim.lastName}` : null;
    const [hTpl, bTpl] = pick(DOPING_PAIRS, r);
    const fallback = 'un joueur';
    headline = hTpl.replace(/{team}/g, opts.teamName).replace(/{player}/g, victimName ?? fallback);
    body = bTpl.replace(/{team}/g, opts.teamName).replace(/{player}/g, victimName ?? fallback);
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
    const [h, b] = pick(SCANDAL_PAIRS, r);
    headline = h.replace(/{team}/g, opts.teamName);
    body = b.replace(/{team}/g, opts.teamName);
  } else if (isCritique) {
    category = 'critique';
    if (isHumiliation) {
      const allL3H = [...CRITIQUE_HEADLINES_L3, ...CRITIQUE_HEADLINES_L3_EXTRA];
      const allL3B = [...CRITIQUE_BODIES_L3, ...CRITIQUE_BODIES_L3_EXTRA];
      headline = pick(allL3H, r).replace(/{team}/g, opts.teamName);
      body = pick(allL3B, r).replace(/{team}/g, opts.teamName);
      moraleShock = -(18 + Math.floor(r() * 8)); // -18 à -25
    } else if (isBrutalLoss) {
      headline = pick(CRITIQUE_HEADLINES_L2, r).replace(/{team}/g, opts.teamName);
      body = pick(CRITIQUE_BODIES_L2, r).replace(/{team}/g, opts.teamName);
      moraleShock = -(12 + Math.floor(r() * 6)); // -12 à -17
    } else {
      headline = pick(CRITIQUE_HEADLINES_L1, r).replace(/{team}/g, opts.teamName);
      body = pick(CRITIQUE_BODIES_L1, r).replace(/{team}/g, opts.teamName);
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
        headline = pick(WC_EXPLOIT_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(WC_EXPLOIT_BODIES, r).replace(/{team}/g, opts.teamName);
      } else if (isWorldCup && wcWinHeads[phase] && r() < 0.70) {
        headline = pick(wcWinHeads[phase], r).replace(/{team}/g, opts.teamName);
        body = pick(wcWinBodies[phase] ?? BIG_WIN_BODIES, r).replace(/{team}/g, opts.teamName);
      } else if (r() < 0.5 && koWinHeads.length) {
        headline = pick(koWinHeads, r).replace(/{team}/g, opts.teamName);
        body = pick(koWinBodies.length ? koWinBodies : BIG_WIN_BODIES, r).replace(/{team}/g, opts.teamName);
      } else {
        headline = pick(isManita ? MANITA_HEADLINES : isBigWin ? BIG_WIN_HEADLINES : WIN_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(isManita ? MANITA_BODIES : isBigWin ? BIG_WIN_BODIES : WIN_BODIES, r).replace(/{team}/g, opts.teamName);
        body += ` En ${phaseLabel}, chaque erreur se paie cash — {team} n'en a pas commis.`.replace(/{team}/g, opts.teamName);
      }
    } else if (diff < 0) {
      category = isBigLoss ? 'crise' : 'defaite';
      if (isWorldCup && isBigLoss && r() < 0.65) {
        headline = pick(WC_CRITIQUE_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(WC_CRITIQUE_BODIES, r).replace(/{team}/g, opts.teamName);
        moraleShock = -(12 + Math.floor(r() * 8));
      } else if (isWorldCup && wcLossHeads[phase] && r() < 0.70) {
        headline = pick(wcLossHeads[phase], r).replace(/{team}/g, opts.teamName);
        body = pick(wcLossBodies[phase] ?? HEAVY_LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
      } else if (r() < 0.5 && koLossHeads.length) {
        headline = pick(koLossHeads, r).replace(/{team}/g, opts.teamName);
        body = pick(koLossBodies.length ? koLossBodies : HEAVY_LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
      } else {
        headline = pick(isBigLoss ? HEAVY_LOSS_HEADLINES : LOSS_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(isBigLoss ? HEAVY_LOSS_BODIES : LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
        body += ` En ${phaseLabel}, il n'y a pas de lendemain. {team} le sait désormais.`.replace(/{team}/g, opts.teamName);
      }
    } else {
      category = 'neutralite';
      headline = pick(DRAW_HEADLINES, r).replace(/{team}/g, opts.teamName);
      body = pick(DRAW_BODIES, r).replace(/{team}/g, opts.teamName);
    }
  } else {
    // ── Phase de groupe ou ligue ─────────────────────────────────────────────
    const isLPM = (phase === 'league' || phase === 'lpm_playoff') && opts.totalTeams && opts.totalTeams >= 40;
    const isLPMEliminated = isLPM && opts.rank !== undefined && opts.rank > 40;
    const isLPMDanger = isLPM && opts.rank !== undefined && opts.rank >= 25 && opts.rank <= 40;

    // Élimination mathématique confirmée (groupe/ligue standard) — article dédié
    if (opts.isEliminated) {
      category = 'crise';
      moraleShock = -(10 + Math.floor(r() * 8));
      if (isLPMEliminated) {
        headline = pick(LPM_ELIMINATED_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(LPM_ELIMINATED_BODIES, r).replace(/{team}/g, opts.teamName);
      } else if (isWorldCup) {
        headline = pick(WC_ELIMINATED_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(WC_ELIMINATED_BODIES, r).replace(/{team}/g, opts.teamName);
      } else {
        headline = pick(ELIMINATED_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(ELIMINATED_BODIES, r).replace(/{team}/g, opts.teamName);
      }
    } else if (diff > 0) {
      category = isBigWin ? 'exploit' : 'victoire';
      moraleBoost = isBigWin ? (8 + Math.floor(r() * 7)) : (4 + Math.floor(r() * 5));
      if (isWorldCup && isBigWin && r() < 0.65) {
        headline = pick(WC_EXPLOIT_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(WC_EXPLOIT_BODIES, r).replace(/{team}/g, opts.teamName);
      } else if (isWorldCup && r() < 0.55) {
        headline = pick(isBigWin ? WC_EXPLOIT_HEADLINES : WC_GROUP_WIN_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(isBigWin ? WC_EXPLOIT_BODIES : WC_GROUP_WIN_BODIES, r).replace(/{team}/g, opts.teamName);
      } else {
        headline = pick(isManita ? MANITA_HEADLINES : isBigWin ? BIG_WIN_HEADLINES : WIN_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(isManita ? MANITA_BODIES : isBigWin ? BIG_WIN_BODIES : WIN_BODIES, r).replace(/{team}/g, opts.teamName);
      }
      // Contexte classement — seulement si encore en course
      if (!opts.isEliminated) {
        if (opts.rank === 1 && r() < 0.6) {
          body += ' ' + pick(STANDINGS_LEADER_WIN, r).replace(/{team}/g, opts.teamName);
        } else if (opts.rank && opts.rank >= 2 && r() < 0.5) {
          body += ' ' + pick(STANDINGS_CLIMB_WIN, r).replace(/{team}/g, opts.teamName);
        }
      }
    } else if (diff < 0) {
      category = isBigLoss ? 'crise' : 'defaite';
      if (isWorldCup && isBigLoss && r() < 0.65) {
        headline = pick(WC_CRITIQUE_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(WC_CRITIQUE_BODIES, r).replace(/{team}/g, opts.teamName);
        moraleShock = -(12 + Math.floor(r() * 8));
      } else if (isWorldCup && r() < 0.55) {
        headline = pick(WC_GROUP_LOSS_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(WC_GROUP_LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
      } else {
        headline = pick(isBigLoss ? HEAVY_LOSS_HEADLINES : LOSS_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(isBigLoss ? HEAVY_LOSS_BODIES : LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
      }
      // Suffixes standings/danger seulement si encore en course
      if (!opts.isEliminated) {
        if (opts.isInDangerZone || isLPMDanger) {
          body += ' ' + pick(DANGER_ZONE_BODIES, r).replace(/{team}/g, opts.teamName);
        } else if (opts.standing && opts.totalTeams) {
          const ptsPerGame = opts.standing.played > 0 ? opts.standing.points / opts.standing.played : 0;
          if (ptsPerGame < 1 && r() < 0.65) {
            const suffix = pick(
              opts.standing.played >= 3 ? STANDINGS_ELIMINATED_RISK : STANDINGS_DANGER_LOSS,
              r,
            ).replace(/{team}/g, opts.teamName);
            body += ' ' + suffix;
          } else if (r() < 0.4) {
            body += ' ' + pick(STANDINGS_DANGER_LOSS, r).replace(/{team}/g, opts.teamName);
          }
        }
      }
    } else {
      category = 'neutralite';
      if (isWorldCup && r() < 0.60) {
        headline = pick(WC_GROUP_DRAW_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(WC_GROUP_DRAW_BODIES, r).replace(/{team}/g, opts.teamName);
      } else {
        headline = pick(DRAW_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(DRAW_BODIES, r).replace(/{team}/g, opts.teamName);
      }
      // Nul en danger zone = mauvaise nouvelle (seulement si encore en course)
      if (!opts.isEliminated && (opts.isInDangerZone || isLPMDanger)) {
        body += ' ' + pick(STANDINGS_DANGER_LOSS, r).replace(/{team}/g, opts.teamName);
      }
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

  const journalist = category === 'critique'
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

// ── CMF communiqués officiels (dopage, corruption, drame) ────────────────────

const CMF_COMMUNIQUE_DOPING_PLAYER: [string, string][] = [
  [
    'CMF — Communiqué officiel : suspension pour dopage',
    'La Commission Médicale et de Fair-Play (CMF) confirme la suspension immédiate d\'un joueur suite à un contrôle antidopage positif. La procédure réglementaire a été respectée. La CMF rappelle son engagement total pour l\'intégrité sportive.',
  ],
  [
    'Communiqué CMF : contrôle positif confirmé — suspension effective',
    'Suite aux résultats du laboratoire accrédité, la CMF prononce une suspension pour le reste de la compétition. Un recours est possible dans les 48 heures. La CMF ne commentera pas davantage tant que la procédure est en cours.',
  ],
  [
    'CMF — Décision disciplinaire : dopage avéré',
    'Le comité disciplinaire de la CMF a statué. La substance détectée figure sur la liste des produits interdits. La sanction est immédiate et sans appel suspensif. La CMF rappelle que le sport propre est une priorité absolue de l\'institution.',
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

export function generateCmfCommunique(opts: {
  round: number;
  seed: string;
  type: 'doping_player' | 'doping_team' | 'corruption' | 'drame';
  matchId?: string;
  matchSnapshot?: NonNullable<PressItem['matchSnapshot']>;
}): PressItem {
  const r = rng(opts.seed + 'communique');
  let headline: string;
  let body: string;
  if (opts.type === 'doping_player') {
    [headline, body] = pick(CMF_COMMUNIQUE_DOPING_PLAYER, r);
  } else if (opts.type === 'doping_team') {
    [headline, body] = pick(CMF_COMMUNIQUE_DOPING_TEAM, r);
  } else if (opts.type === 'corruption') {
    [headline, body] = pick(CMF_COMMUNIQUE_CORRUPTION, r);
  } else {
    [headline, body] = pick(CMF_COMMUNIQUE_DRAME, r);
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
};

// Phase labels
const PHASE_LABEL: Record<string, string> = {
  group: 'Phase de groupes',
  league: 'Phase de championnat',
  lpm_playoff: 'Barrages LPM',
  R32: 'Huitièmes de finale',
  R16: 'Seizièmes de finale',
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
    body: (compName: string) => `La phase de poules de la ${compName} débute ce soir. 32 équipes (divisées en groupes) s'affrontent pour décrocher leur qualification. Les pronostics sont lancés, les favoris identifiés.`,
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
  const teamIds = Object.keys(opts.standings);
  const favTeams = opts.moment !== 'debut' ? [] : topTeams(teamIds, opts.teamSnapshot, opts.standings, opts.playerStats, 3);

  // Count: 2 or 3 articles
  const count = 2 + (r() < 0.5 ? 1 : 0);

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
      let b = (tpl as typeof CMF_DEBUT_LEAGUE[0]).body(opts.competitionName);
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

    // Article 3 (optionnel) — contexte LPM/CDM spécifique
    if (count >= 3) {
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
};
