import type { CorruptionDeal } from './types';

export type CorruptionOffer = {
  /** Ref's demanded bribe in millions */
  amount: number;
  /** Probability ref actually honors the deal in-game */
  honorProb: number;
  /** Flavour text from referee */
  message: string;
};

const REF_MESSAGES = [
  "Je peux... regarder ailleurs ce soir. Mais ça a un prix.",
  "Les décisions se prennent sur le terrain... ou ailleurs.",
  "Vous voulez gagner ? Tout le monde a un prix.",
  "Pour la bonne somme, je peux oublier certaines fautes.",
  "L'arbitre voit tout. Sauf quand il est bien payé.",
  "Je ne garantis rien. Mais mes sifflets ont une mémoire sélective.",
  "Une enveloppe sous la table change beaucoup de choses.",
  "C'est risqué pour moi aussi. Mais le prix est juste.",
  "Je suis un homme raisonnable. Et les hommes raisonnables s'arrangent.",
];

const REF_BOTH_MESSAGES = [
  "Je vois que vous êtes deux à vouloir mes faveurs. C'est... inhabituel.",
  "Deux enveloppes ? Je respecte. Mais dans ce cas, je joue au neutre.",
  "Vous deux m'avez contacté. Très bien. Je prends les deux... et je siffle normalement.",
  "Curieux. Chacun veut acheter l'autre. On repart à zéro — mais je garde l'argent.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 70% chance the referee makes an offer at all.
 * Returns null if he doesn't approach (and won't approach the other side either).
 */
export function generateRefOffer(): CorruptionOffer | null {
  if (Math.random() > 0.70) return null;
  const amount = Math.round((0.5 + Math.random() * 9.5) * 10) / 10; // 0.5M–10M
  return {
    amount,
    honorProb: 1, // ref always honors if accepted — revelation is post-match (30%)
    message: pick(REF_MESSAGES),
  };
}

/**
 * Message shown when both sides have accepted a deal with the same ref.
 */
export function getBothSidesMessage(): string {
  return pick(REF_BOTH_MESSAGES);
}

/**
 * Build a CorruptionDeal from an accepted offer by one side.
 */
export function acceptOffer(side: 'home' | 'away', offer: CorruptionOffer): CorruptionDeal {
  return {
    side,
    bribe: offer.amount,
    accepted: true,
    honored: true, // always honored — revelation handled post-match (30%)
  };
}

/**
 * Merge two single-side deals into a 'both' deal.
 * When both sides bribe the ref, he plays normally (honored=true but side='both' = neutral).
 * The ref always "honors" (keeps the money) — just doesn't bias either way.
 */
export function mergeBothDeals(home: CorruptionDeal, away: CorruptionDeal): CorruptionDeal {
  return {
    side: 'both',
    bribe: home.bribe + away.bribe,
    accepted: true,
    honored: true,
  };
}

/** 30% chance of post-match revelation. */
export function isRevealed(): boolean {
  return Math.random() < 0.30;
}

/**
 * 30% chance the referee refuses the approach and reports it before the match.
 * When true, the match still plays but the next match of the bribing team risks a walkover.
 */
export function refusedByRef(): boolean {
  return Math.random() < 0.30;
}
