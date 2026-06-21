/** Press / media system — generates narrative articles after match events. */

export type PressCategory = 'victoire' | 'defaite' | 'scandale' | 'forme' | 'crise' | 'neutralite' | 'exploit';

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
];
const WIN_BODIES = [
  'Après ce succès convaincant, les joueurs de {team} affichent une confiance retrouvée. Le vestiaire est soudé.',
  'La victoire fait du bien. L\'ambiance dans le groupe {team} est au plus haut, et ça se voit à l\'entraînement.',
  '{team} enchaîne les bonnes prestations. Les supporters commencent à y croire vraiment.',
  'En conférence de presse, le sélectionneur de {team} a tempéré les ardeurs : "On reste humble. Chaque match sera une guerre." Mais le sourire en coin en disait long.',
  '"Je suis fier de mes joueurs" — le discours d\'après-match du coach de {team} était court, mais les yeux de ses hommes brillaient.',
];

const BIG_WIN_HEADLINES = [
  'EXPLOIT : {team} humilie son adversaire et fait trembler la compétition',
  '{team} en état de grâce — une démonstration de force absolue',
  'Carton plein pour {team} : personne ne les arrête en ce moment',
  '{team} distribue les buts comme des bonbons — la compétition tremble',
  'MANITA : {team} signe la performance de la saison',
];
const BIG_WIN_BODIES = [
  'Une manita. Un résultat qui résonne dans toute la compétition. {team} envoie un message fort à ses concurrents.',
  'Score flatteur ou reflet de la réalité ? Pour {team}, peu importe — la confiance est au maximum.',
  'En conférence de presse, le capitaine de {team} n\'a pas mâché ses mots : "On voulait marquer les esprits. C\'est fait." Les adversaires ont été avertis.',
  'La rencontre s\'est transformée en leçon de football. {team} a montré que cette compétition a un favori, et qu\'il ne se cache plus.',
  'Le sélectionneur de {team} avait des larmes aux yeux au coup de sifflet final. "Je n\'ai jamais vu mon groupe aussi fort mentalement", a-t-il confié.',
];

const DRAW_HEADLINES = [
  'Match nul frustrant pour {team}',
  '{team} partage les points — une occasion manquée ?',
  'Nul serré entre les deux équipes — {team} repart sur sa faim',
  '"On méritait mieux" — {team} n\'accepte pas le partage des points',
  '{team} accroche le nul mais laisse passer une chance en or',
];
const DRAW_BODIES = [
  'On attendait mieux de {team}. Le vestiaire reste calme, mais les questions commencent à se poser.',
  'Un point pris ou deux points perdus ? {team} repart avec un sentiment mitigé.',
  'En conférence de presse, le coach de {team} n\'a pas caché sa frustration : "On a eu les occasions, il fallait juste les mettre au fond." Son attaquant regardait ses chaussures.',
  '"C\'est un point de pris", a répété le capitaine de {team} sans conviction. Dans les travées, les supporters sifflaient.',
];

const LOSS_HEADLINES = [
  '{team} s\'incline — le groupe doit vite rebondir',
  'Défaite difficile à accepter pour {team}',
  '{team} concède face à un adversaire au-dessus ce soir',
  'Le sélectionneur de {team} sous le feu des critiques après la défaite',
  '{team} plie mais promet de se relever — les mots sonnent creux',
];
const LOSS_BODIES = [
  'La défaite laisse des traces. {team} va devoir rapidement se remobiliser avant le prochain match.',
  'Le vestiaire de {team} est silencieux. Chaque joueur prend sa part de responsabilité.',
  'Difficile soirée pour {team}. Le staff réclame plus de solidité défensive et de concentration.',
  'En conférence de presse, le sélectionneur de {team} a pris la défense de ses joueurs mais n\'a pas convaincu. "On a manqué de réalisme. C\'est tout." La salle était sceptique.',
  '"Je prends la responsabilité" — le capitaine de {team} a joué les pompiers après la défaite, mais la grogne des supporters enfle dans les tribunes.',
  'Des sources internes révèlent des tensions dans le vestiaire de {team} après la défaite. La question du leadership se pose ouvertement.',
];

const HEAVY_LOSS_HEADLINES = [
  'HUMILIATION : {team} s\'effondre — la crise couve',
  'Débâcle de {team} — les questions fusent sur l\'état mental du groupe',
  'Naufrage de {team} : le moral est au plus bas',
  'CATASTROPHE : {team} sombre et entraîne tout le monde dans sa chute',
  'La gifle de trop — {team} au bord du gouffre après ce fiasco',
];
const HEAVY_LOSS_BODIES = [
  'Difficile de trouver des mots. {team} a sombré, et personne dans le vestiaire ne semblait capable de réagir.',
  'La presse ne ménage pas {team}. Les déclarations d\'après-match sont tendues, les visages fermés.',
  'En conférence de presse, le sélectionneur de {team} a affronté une salve de questions hostiles. "Je ne reconnais pas mon équipe", a-t-il admis, la voix brisée. La salle était silencieuse.',
  'Des joueurs de {team} auraient quitté le vestiaire sans parler à personne. Le capitaine a tenté de rassembler le groupe, sans succès. La fracture est visible.',
  'Les tribunes grondent. Des banderoles hostiles ont été déployées à l\'encontre du staff de {team}. La fédération aurait demandé des explications en urgence.',
];

const HIGH_MORALE_HEADLINES = [
  '{team} en pleine confiance avant un choc crucial',
  'Le groupe {team} est uni et ambitieux — gare aux adversaires',
  '{team} vit sur un nuage en ce moment',
  'Révélation : {team} serait l\'équipe la plus soudée de la compétition',
  '"On a peur de personne" — {team} ose l\'ambition',
];
const HIGH_MORALE_BODIES = [
  'Après plusieurs belles performances, {team} aborde la suite de la compétition avec un moral exceptionnel.',
  'L\'ambiance dans l\'effectif de {team} est au sommet. Tout le monde est prêt à se battre.',
  'Des sources proches de {team} décrivent une cohésion de groupe rare. Les séances d\'entraînement sont intenses, joyeuses, presque insouciantes. Un détail qui ne trompe pas.',
  'En conférence de presse, le joueur le plus expérimenté de {team} a déclaré : "On n\'est pas venu ici pour participer." Le vestiaire a applaudi.',
];

const LOW_MORALE_HEADLINES = [
  '{team} traverse une zone de turbulences — la pression monte',
  'Malaise dans le groupe {team} : les résultats ne suivent pas',
  '{team} en crise de confiance : le collectif est fragilisé',
  'Révélations sur le vestiaire de {team} : la situation serait pire qu\'annoncée',
  'Le sélectionneur de {team} à bout de nerfs — l\'atmosphère est délétère',
];
const LOW_MORALE_BODIES = [
  'Les rumeurs de tensions internes circulent autour de {team}. Le staff tente de préserver la cohésion.',
  'Les résultats récents pèsent lourd. {team} a besoin d\'une victoire pour retrouver la sérénité.',
  'Plusieurs joueurs de {team} auraient manifesté leur mécontentement en privé. La situation est à surveiller.',
  'Selon nos informations, une réunion de crise aurait eu lieu dans le camp de {team}. Le sélectionneur aurait haussé le ton. "Ce que j\'ai dit restera dans ce vestiaire", a-t-il déclaré, mais la fuite n\'a pas tardé.',
  'Un joueur de {team} aurait demandé à quitter le groupe après une dispute avec le staff. Sa demande aurait été refusée. L\'ambiance reste explosive.',
];

const SCANDAL_HEADLINES = [
  'SCANDALE : {team} au cœur d\'une polémique explosive',
  '{team} accusé de comportements déplacés — l\'enquête est ouverte',
  'Révélations fracassantes autour de {team} : la compétition sous le choc',
  'Une affaire trouble éclabousse {team} — le groupe serait déstabilisé',
  'EXCLU : des stars de {team} au cœur d\'une fête interdite la veille du match',
  'CHOC : un joueur de {team} visé par une enquête pour corruption d\'arbitre',
  'Trahison dans le camp {team} — une taupe aurait vendu des informations tactiques',
  '{team} dans la tourmente : un membre du staff placé en garde à vue',
  'INSULTES : le sélectionneur de {team} s\'en prend violemment à l\'arbitre — suspension imminente',
  '{team} : le capitaine traite ses coéquipiers de "lâches" — le vestiaire explose',
  'Bagarre en coulisses après le match — des joueurs de {team} impliqués',
  'CORRUPTION : l\'arbitre du dernier match de {team} soupçonné d\'avoir été acheté',
];
const SCANDAL_BODIES = [
  'Des sources proches du club font état de tensions internes graves. Plusieurs joueurs auraient été convoqués par la direction.',
  'L\'affaire éclate au pire moment pour {team}. Concentration et mental sont mis à rude épreuve avant le prochain match.',
  'Des paris suspects auraient été identifiés sur le dernier match impliquant {team}. Une enquête est diligentée par la commission disciplinaire.',
  'Selon un journaliste d\'investigation, trois joueurs de {team} auraient passé la nuit précédant le match dans un établissement de jeux privé. Le sélectionneur "découvrait la nouvelle en même temps que tout le monde", selon son entourage.',
  'Une conversation entre le sélectionneur et son assistant aurait été surprise et rapportée à la presse. Les propos, particulièrement virulents sur certains joueurs, ont créé un séisme dans le vestiaire de {team}.',
  'Un préparateur physique de {team} aurait été interpellé par les autorités pour des motifs encore flous. La fédération refuse de commenter. L\'ombre de la fraude plane.',
  'L\'ancien capitaine de {team}, écarté en début de compétition, a brisé le silence : "Ce qui se passe dans ce groupe n\'a rien de normal. Je parlerai quand le moment sera venu." Une bombe à retardement.',
  'En conférence de presse d\'après-match, le sélectionneur de {team} a perdu son calme et s\'en est pris violemment à l\'arbitre central : "C\'est une honte, cet homme n\'a rien à faire sur un terrain." Une plainte disciplinaire serait en cours.',
  'Selon plusieurs témoins, le capitaine de {team} aurait traité ses propres coéquipiers de "lâches et de traîtres" dans le couloir du vestiaire. Des échanges ont dégénéré. Un joueur aurait quitté le camp dans la nuit.',
  'Une altercation physique aurait éclaté entre deux joueurs de {team} au retour du match. Le staff aurait dû intervenir. Les deux protagonistes nient, mais les traces sont visibles.',
  'La presse locale révèle qu\'un intermédiaire aurait approché l\'arbitre du dernier match de {team} avant la rencontre. L\'arbitre aurait refusé, mais l\'affaire est désormais entre les mains des autorités sportives.',
  'Des témoignages concordants font état d\'insultes à caractère personnel proférées par un joueur de {team} envers un adversaire durant le match. La commission d\'éthique a été saisie.',
];

// ─────────────────────────────────────────────────────────────────────────────

export function generateMatchPressItem(opts: {
  round: number;
  teamId: string;
  teamName: string;
  goalsFor: number;
  goalsAgainst: number;
  moraleBefore: number;
  moraleAfter: number;
  seed: string;
}): PressItem {
  const r = rng(opts.seed);
  const diff = opts.goalsFor - opts.goalsAgainst;
  const isBigWin = diff >= 3;
  const isBigLoss = diff <= -3;

  let category: PressCategory;
  let headline: string;
  let body: string;

  // 4% chance of scandal on a loss, 1% anytime
  const scandalize = r() < (diff < 0 ? 0.04 : 0.01);

  if (scandalize) {
    category = 'scandale';
    headline = pick(SCANDAL_HEADLINES, r).replace('{team}', opts.teamName);
    body = pick(SCANDAL_BODIES, r).replace(/{team}/g, opts.teamName);
  } else if (diff > 0) {
    category = isBigWin ? 'exploit' : 'victoire';
    headline = pick(isBigWin ? BIG_WIN_HEADLINES : WIN_HEADLINES, r).replace('{team}', opts.teamName);
    body = pick(isBigWin ? BIG_WIN_BODIES : WIN_BODIES, r).replace(/{team}/g, opts.teamName);
  } else if (diff < 0) {
    category = isBigLoss ? 'crise' : 'defaite';
    headline = pick(isBigLoss ? HEAVY_LOSS_HEADLINES : LOSS_HEADLINES, r).replace('{team}', opts.teamName);
    body = pick(isBigLoss ? HEAVY_LOSS_BODIES : LOSS_BODIES, r).replace(/{team}/g, opts.teamName);
  } else {
    category = 'neutralite';
    headline = pick(DRAW_HEADLINES, r).replace('{team}', opts.teamName);
    body = pick(DRAW_BODIES, r).replace(/{team}/g, opts.teamName);
  }

  return {
    id: crypto.randomUUID(),
    round: opts.round,
    teamId: opts.teamId,
    category,
    headline,
    body,
    moraleBefore: opts.moraleBefore,
    moraleAfter: opts.moraleAfter,
    createdAt: new Date().toISOString(),
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
