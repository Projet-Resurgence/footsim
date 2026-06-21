/** Press / media system — generates narrative articles after match events. */

import type { Suspension } from './injuries';
import { createSuspension } from './injuries';
import type { Standing } from './types';
import type { Player } from '@/lib/types';
import type { Coach } from '@/lib/gen/coach';

export type PressCategory = 'victoire' | 'defaite' | 'scandale' | 'forme' | 'crise' | 'neutralite' | 'exploit';

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
  createdAt: string;
  /** Named persons mentioned in headline/body — used for clickable pop-ups */
  mentions?: PressMention[];
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
  'MANITA : {team} signe la performance de la saison',
  'FESTIVAL : {team} régale et écœure ses adversaires',
  '{team} en fusion — un récital qui restera dans les mémoires',
  'DÉMOLITION : {team} ne fait pas de prisonnier ce soir',
  'Les adversaires tremblent : {team} est en feu',
  'GOLEADA : {team} signe un résultat historique dans cette compétition',
  '{team} marque les esprits — une victoire qui fait date',
  'Insolent de facilité : {team} écrase tout sur son passage',
];
const BIG_WIN_BODIES = [
  'Une manita. Un résultat qui résonne dans toute la compétition. {team} envoie un message fort à ses concurrents.',
  'Score flatteur ou reflet de la réalité ? Pour {team}, peu importe — la confiance est au maximum.',
  'En conférence de presse, le capitaine de {team} n\'a pas mâché ses mots : "On voulait marquer les esprits. C\'est fait." Les adversaires ont été avertis.',
  'La rencontre s\'est transformée en leçon de football. {team} a montré que cette compétition a un favori, et qu\'il ne se cache plus.',
  'Le sélectionneur de {team} avait des larmes aux yeux au coup de sifflet final. "Je n\'ai jamais vu mon groupe aussi fort mentalement", a-t-il confié.',
  'Les adversaires de {team} peuvent se remercier : ils ont assisté ce soir à une leçon de football collectif. Perfection d\'exécution, débordements constants, efficacité clinique.',
  'Ce score n\'est pas un accident. {team} a construit cette manita pied à pied, avec méthode. Une domination totale, dans tous les compartiments du jeu.',
  'Des vestiaires aux tribunes, l\'euphorie est totale chez {team}. "On a tout réussi ce soir. Tout", soufflait un joueur du groupe, encore incrédule.',
  'La presse étrangère parle déjà de ce résultat. {team} entre dans une autre dimension. Les adversaires sont prévenus : il faudra être parfaits pour les stopper.',
  'Rarement une équipe aura semblé aussi supérieure dans cette compétition. {team} a transformé ce match en démonstration. Le vestiaire chantait encore une heure après le coup de sifflet final.',
  '"Ce groupe est exceptionnel", a soufflé le préparateur physique de {team} en quittant le stade. Ce soir, difficile de le contredire.',
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
    'En quittant le stade, un joueur de {team} aurait répondu de façon virulente à des provocations de supporters adverses. La scène aurait dégénéré. Des images circulent sur les réseaux. Le joueur "regrette" — selon le communiqué officiel.',
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

// ── Templates contextuels — phases finales ───────────────────────────────────

const KNOCKOUT_PHASE_LABEL: Record<string, string> = {
  R32: 'huitièmes de finale',
  R16: 'seizièmes de finale',
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

// ── Templates dopage — joueur (suspension individuelle) ──────────────────────

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
  /** teamIds already banned for doping this competition — prevents re-roll */
  dopingBannedTeamIds?: string[];
  /** If another team already had a doping event this match, skip player doping roll */
  dopingAlreadyThisMatch?: boolean;
  /** Roster of this team — used to mention a player by name in press body */
  players?: Player[];
  /** Head coach of this team — mentioned in body with overall */
  coach?: Coach;
}): MatchPressResult {
  const r = rng(opts.seed);
  const diff = opts.goalsFor - opts.goalsAgainst;
  const isBigWin = diff >= 3;
  const isBigLoss = diff <= -3;
  const phase = opts.phase ?? 'league';
  const isKnockout = !['group', 'league'].includes(phase);

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

  // Dopage joueur : 0.3% / 0.6% sur défaite (rare — max 1 par match via dopingAlreadyThisMatch)
  const playerDopingChance = baseAllowed ? (diff < 0 ? 0.006 : 0.003) : 0;
  const isPlayerDoping = r() < playerDopingChance;

  // Dopage équipe : 0.4% indépendant, seulement si pas de dopage joueur ce tour
  const teamDopingChance = baseAllowed && !isPlayerDoping ? 0.004 : 0;
  const isTeamDoping = r() < teamDopingChance;

  // Scandale classique : 3% sur défaite, 0.8% sinon
  const scandalChance = isPlayerDoping || isTeamDoping ? 0 : (diff < 0 ? 0.03 : 0.008);
  const scandalize = r() < scandalChance;

  if (isTeamDoping) {
    category = 'scandale';
    const [h, b] = pick(TEAM_DOPING_PAIRS, r);
    headline = h.replace(/{team}/g, opts.teamName);
    body = b.replace(/{team}/g, opts.teamName);
    teamDisqualified = true;
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
  } else if (isKnockout) {
    // ── Phase finale : templates spécifiques ─────────────────────────────────
    const koWinHeads = KO_WIN_HEADLINES[phase] ?? KO_WIN_HEADLINES['QF'];
    const koWinBodies = KO_WIN_BODIES[phase] ?? KO_WIN_BODIES['QF'];
    const koLossHeads = KO_LOSS_HEADLINES[phase] ?? KO_LOSS_HEADLINES['QF'];
    const koLossBodies = KO_LOSS_BODIES[phase] ?? KO_LOSS_BODIES['QF'];
    const phaseLabel = KNOCKOUT_PHASE_LABEL[phase] ?? phase;

    if (diff > 0) {
      category = isBigWin ? 'exploit' : 'victoire';
      // 50% chance d'utiliser le template KO spécifique, sinon template générique enrichi
      if (r() < 0.5 && koWinHeads.length) {
        headline = pick(koWinHeads, r).replace(/{team}/g, opts.teamName);
        body = pick(koWinBodies.length ? koWinBodies : BIG_WIN_BODIES, r).replace(/{team}/g, opts.teamName);
      } else {
        headline = pick(isBigWin ? BIG_WIN_HEADLINES : WIN_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(isBigWin ? BIG_WIN_BODIES : WIN_BODIES, r).replace(/{team}/g, opts.teamName);
        body += ` En ${phaseLabel}, chaque erreur se paie cash — {team} n'en a pas commis.`.replace(/{team}/g, opts.teamName);
      }
    } else if (diff < 0) {
      category = isBigLoss ? 'crise' : 'defaite';
      if (r() < 0.5 && koLossHeads.length) {
        headline = pick(koLossHeads, r).replace(/{team}/g, opts.teamName);
        body = pick(koLossBodies.length ? koLossBodies : HEAVY_LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
      } else {
        headline = pick(isBigLoss ? HEAVY_LOSS_HEADLINES : LOSS_HEADLINES, r).replace(/{team}/g, opts.teamName);
        body = pick(isBigLoss ? HEAVY_LOSS_BODIES : LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
        body += ` En ${phaseLabel}, il n'y a pas de lendemain. {team} le sait désormais.`.replace(/{team}/g, opts.teamName);
      }
    } else {
      // Nul en phase finale = prolongations/pénaltys — traitement identique à victoire/défaite finale
      category = 'neutralite';
      headline = pick(DRAW_HEADLINES, r).replace(/{team}/g, opts.teamName);
      body = pick(DRAW_BODIES, r).replace(/{team}/g, opts.teamName);
    }
  } else {
    // ── Phase de groupe ou ligue ─────────────────────────────────────────────
    if (diff > 0) {
      category = isBigWin ? 'exploit' : 'victoire';
      headline = pick(isBigWin ? BIG_WIN_HEADLINES : WIN_HEADLINES, r).replace(/{team}/g, opts.teamName);
      body = pick(isBigWin ? BIG_WIN_BODIES : WIN_BODIES, r).replace(/{team}/g, opts.teamName);
      // Contexte classement
      if (opts.standing && opts.totalTeams) {
        const rank = opts.standing.points;
        // Approximation rang : on n'a pas le rang calculé ici, on utilise les points
        // Leader = le plus probable si points élevés → on enrichit le body avec un suffix
        if (r() < 0.6) {
          const suffix = pick(STANDINGS_LEADER_WIN, r).replace(/{team}/g, opts.teamName);
          body += ' ' + suffix;
        } else if (rank >= 2 && r() < 0.5) {
          const suffix = pick(STANDINGS_CLIMB_WIN, r).replace(/{team}/g, opts.teamName);
          body += ' ' + suffix;
        }
      }
    } else if (diff < 0) {
      category = isBigLoss ? 'crise' : 'defaite';
      headline = pick(isBigLoss ? HEAVY_LOSS_HEADLINES : LOSS_HEADLINES, r).replace(/{team}/g, opts.teamName);
      body = pick(isBigLoss ? HEAVY_LOSS_BODIES : LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
      // Contexte classement danger
      if (opts.standing && opts.totalTeams) {
        const ptsPerGame = opts.standing.played > 0 ? opts.standing.points / opts.standing.played : 0;
        if (ptsPerGame < 1 && r() < 0.65) {
          const suffix = pick(
            opts.standing.played >= 3 ? STANDINGS_ELIMINATED_RISK : STANDINGS_DANGER_LOSS,
            r,
          ).replace(/{team}/g, opts.teamName);
          body += ' ' + suffix;
        } else if (r() < 0.4) {
          const suffix = pick(STANDINGS_DANGER_LOSS, r).replace(/{team}/g, opts.teamName);
          body += ' ' + suffix;
        }
      }
    } else {
      category = 'neutralite';
      headline = pick(DRAW_HEADLINES, r).replace(/{team}/g, opts.teamName);
      body = pick(DRAW_BODIES, r).replace(/{team}/g, opts.teamName);
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
      createdAt: new Date().toISOString(),
      mentions: mentions.length > 0 ? mentions : undefined,
    },
    dopingSuspension,
    teamDisqualified,
  };
}

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
  if (opts.morale <= 25 && r() < 0.5) {
    return {
      id: crypto.randomUUID(),
      round: opts.round,
      teamId: opts.teamId,
      category: 'crise',
      headline: pick(LOW_MORALE_HEADLINES, r).replace('{team}', opts.teamName),
      body: pick(LOW_MORALE_BODIES, r).replace(/{team}/g, opts.teamName),
      moraleAfter: opts.morale,
      createdAt: new Date().toISOString(),
    };
  }
  return null;
}

export const PRESS_CATEGORY_LABEL: Record<PressCategory, string> = {
  victoire: 'Victoire',
  defaite: 'Défaite',
  scandale: 'Scandale',
  forme: 'Forme',
  crise: 'Crise',
  neutralite: 'Nul',
  exploit: 'Exploit',
};

export const PRESS_CATEGORY_COLOR: Record<PressCategory, string> = {
  victoire: 'text-green-400 bg-green-400/10 border-green-400/20',
  defaite: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  scandale: 'text-danger bg-danger/10 border-danger/20',
  forme: 'text-accent bg-accent/10 border-accent/20',
  crise: 'text-red-500 bg-red-500/10 border-red-500/20',
  neutralite: 'text-muted bg-border/40 border-border',
  exploit: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
};
