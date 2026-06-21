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
];
const WIN_BODIES = [
  'Après ce succès convaincant, les joueurs de {team} affichent une confiance retrouvée. Le vestiaire est soudé.',
  'La victoire fait du bien. L\'ambiance dans le groupe {team} est au plus haut, et ça se voit à l\'entraînement.',
  '{team} enchaîne les bonnes prestations. Les supporters commencent à y croire vraiment.',
];

const BIG_WIN_HEADLINES = [
  'EXPLOIT : {team} humilie son adversaire et fait trembler la compétition',
  '{team} en état de grâce — une démonstration de force',
  'Carton plein pour {team} : personne ne les arrête en ce moment',
];
const BIG_WIN_BODIES = [
  'Une manita. Un résultat qui résonne dans toute la compétition. {team} envoie un message fort à ses concurrents.',
  'Score flatteur ou reflet de la réalité ? Pour {team}, peu importe — la confiance est au maximum.',
];

const DRAW_HEADLINES = [
  'Match nul frustrant pour {team}',
  '{team} partage les points — une occasion manquée ?',
  'Nul serré entre les deux équipes — {team} repart sur sa faim',
];
const DRAW_BODIES = [
  'On attendait mieux de {team}. Le vestiaire reste calme, mais les questions commencent à se poser.',
  'Un point pris ou deux points perdus ? {team} repart avec un sentiment mitigé.',
];

const LOSS_HEADLINES = [
  '{team} s\'incline — le groupe doit vite rebondir',
  'Défaite difficile à accepter pour {team}',
  '{team} concède face à un adversaire au-dessus ce soir',
];
const LOSS_BODIES = [
  'La défaite laisse des traces. {team} va devoir rapidement se remobiliser avant le prochain match.',
  'Le vestiaire de {team} est silencieux. Chaque joueur prend sa part de responsabilité.',
  'Difficile soirée pour {team}. Le staff réclame plus de solidité défensive et de concentration.',
];

const HEAVY_LOSS_HEADLINES = [
  'HUMILIATION : {team} s\'effondre — la crise couve',
  'Débâcle de {team} — les questions fusent sur l\'état mental du groupe',
  'Naufrage de {team} : le moral est au plus bas',
];
const HEAVY_LOSS_BODIES = [
  'Difficile de trouver des mots. {team} a sombré, et personne dans le vestiaire ne semblait capable de réagir.',
  'La presse ne ménage pas {team}. Les déclarations d\'après-match sont tendues, les visages fermés.',
];

const HIGH_MORALE_HEADLINES = [
  '{team} en pleine confiance avant un choc crucial',
  'Le groupe {team} est uni et ambitieux — gare aux adversaires',
  '{team} vit sur un nuage en ce moment',
];
const HIGH_MORALE_BODIES = [
  'Après plusieurs belles performances, {team} aborde la suite de la compétition avec un moral exceptionnel.',
  'L\'ambiance dans l\'effectif de {team} est au sommet. Tout le monde est prêt à se battre.',
];

const LOW_MORALE_HEADLINES = [
  '{team} traverse une zone de turbulences — la pression monte',
  'Malaise dans le groupe {team} : les résultats ne suivent pas',
  '{team} en crise de confiance : le collectif est fragilisé',
];
const LOW_MORALE_BODIES = [
  'Les rumeurs de tensions internes circulent autour de {team}. Le staff tente de préserver la cohésion.',
  'Les résultats récents pèsent lourd. {team} a besoin d\'une victoire pour retrouver la sérénité.',
  'Plusieurs joueurs de {team} auraient manifesté leur mécontentement en privé. La situation est à surveiller.',
];

const SCANDAL_HEADLINES = [
  'SCANDALE : {team} au cœur d\'une polémique explosive',
  '{team} accusé de comportements déplacés — l\'enquête est ouverte',
  'Révélations fracassantes autour de {team} : la compétition sous le choc',
  'Une affaire trouble éclabousse {team} — le groupe serait déstabilisé',
];
const SCANDAL_BODIES = [
  'Des sources proches du club font état de tensions internes graves. Plusieurs joueurs auraient été convoqués par la direction.',
  'Une vidéo circulant sur les réseaux montre des joueurs de {team} dans une situation embarrassante. Le staff est en gestion de crise.',
  'L\'affaire éclate au pire moment pour {team}. Concentration et mental sont mis à rude épreuve avant le prochain match.',
  'Des paris suspects auraient été identifiés sur le dernier match impliquant {team}. Une enquête est diligentée.',
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

  // 10% chance of scandal on a loss, 3% anytime
  const scandalize = r() < (diff < 0 ? 0.10 : 0.03);

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
