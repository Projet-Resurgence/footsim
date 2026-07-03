import type { CustomTacticStyle, Formation, Player, SavedTactic, TacticStyle, Team } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';
import type { MatchState, TacticMods } from '@/lib/sim/types';
import { computeMatchRating } from '@/lib/competition/statsAccumulator';
import { getTacticMods } from '@/lib/sim/precompute';
import {
  computeMatchupAdjustment,
  formationProfile,
  styleProfile,
  customStyleProfile,
  FORMATION_MATCHUP,
  STYLE_MATCHUP,
  FORMATION_PROFILE_LABEL,
  STYLE_PROFILE_LABEL,
} from '@/lib/sim/matchup';
import type { FormationProfile, StyleProfile } from '@/lib/sim/matchup';

export type ReportSide = {
  team: Team;
  players: Player[];
  formation: Formation;
  tacticStyle?: TacticStyle;
  customTacticStyle?: CustomTacticStyle;
  /** tactics saved for this team — used to recommend an existing tactic over a generic one */
  savedTactics?: SavedTactic[];
};

export type PlayerReportEntry = {
  playerId: string;
  playerName: string;
  position: string;
  rating: number;
};

export type TacticalReport = {
  /** true when generated before fulltime (halftime snapshot) */
  partial: boolean;
  side: 'home' | 'away';
  teamName: string;
  oppName: string;
  strengths: string[];
  weaknesses: string[];
  bestPlayers: PlayerReportEntry[];
  worstPlayers: PlayerReportEntry[];
  bestOppPlayers: PlayerReportEntry[];
  worstOppPlayers: PlayerReportEntry[];
  verdict: { worked: boolean | null; text: string };
  improvements: string[];
  /** Analyse du dispositif adverse — style précis + famille tactique */
  opponent: {
    formation: Formation;
    /** famille de la formation (ex : « Pressing haut ») */
    formationFamily: string;
    /** style précis : nom du style perso, ou label du style nommé */
    styleName: string;
    /** famille du style (ex : « Jeu de possession ») — null si inclassable */
    styleFamily: string | null;
  };
  counterTactic: {
    formation: Formation;
    style: TacticStyle;
    text: string;
    /** matching tactic already saved for this team, if one is close to the recommendation */
    savedTactic: { id: string; name: string } | null;
    /** fine-tuned custom mods, derived from `style`'s base values and sharpened against this specific opponent */
    customMods: TacticMods;
    /** avantage estimé de la proposition vs la tactique actuelle (points de matchup, ~%) */
    edge: { attack: number; defense: number };
  } | null;
};

const FORMATION_LABEL_BY_PROFILE: Record<FormationProfile, Formation> = {
  'high-press': '4-3-3',
  'midfield-heavy': '3-5-2',
  'defensive-block': '5-3-2',
  balanced: '4-4-2',
  'wide-attack': '3-4-3',
};

const STYLE_LABEL_BY_PROFILE: Record<StyleProfile, TacticStyle> = {
  'possession-build': 'tiki-taka',
  'direct-attack': 'long-ball',
  'high-intensity': 'gegenpressing',
  defensive: 'ultra-defensif',
  chaos: 'chaos',
  'wide-play': 'ailes',
};

// Same ±30% ceiling as the in-app custom style editor (TacticsPanel's SLIDER_MIN/MAX) —
// a suggestion here must stay inside what a player could actually configure by hand.
const MOD_RANGE: [number, number] = [0.7, 1.3];

function clamp(v: number, [lo, hi]: [number, number] = MOD_RANGE): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Sharpen a named style's base mods for this specific matchup: when the style-matchup edge
 * (attackMult minus defenseMult received, from STYLE_MATCHUP) is positive, push attack/shot
 * frequency a bit further than the generic named style since the matchup supports it. When
 * it's negative, pull back and reinforce defenseMult instead — same style, tuned intensity.
 * Gives a concrete percentage-level suggestion instead of just pointing at a named style.
 * Every mult is clamped to ±30% of neutral (1.0), matching the manual editor's own limits.
 */
function sharpenModsForMatchup(baseStyle: TacticStyle, edge: number): TacticMods {
  const base = getTacticMods(baseStyle);
  // edge is a STYLE_MATCHUP `att - def` delta, typically in [-0.15, 0.15].
  // Scale to a mod nudge in roughly [-0.09, 0.09] so results stay inside sane ranges.
  const nudge = clamp(edge, [-0.15, 0.15]) * 0.6;
  return snapToCustomStyleGrid({
    shotFreqMult: clamp(base.shotFreqMult + Math.max(0, nudge) * 0.5),
    midfieldMult: clamp(base.midfieldMult + nudge * 0.3),
    attackMult: clamp(base.attackMult + Math.max(0, nudge)),
    foulRateMult: clamp(base.foulRateMult),
    defenseMult: clamp(base.defenseMult + Math.max(0, -nudge)),
  });
}

// Mêmes contraintes que l'éditeur de styles perso (TacticsPanel) : sliders par pas
// de 5 %, bornes ±30 %, budget 30 pts (+1 pt par % de bonus, malus rend 0,5 pt).
const GRID_STEP = 5;      // %
const GRID_MAX_PCT = 30;  // ±30 %
const GRID_BUDGET = 30;   // pts

/** Cale des mods proposés sur la grille de l'éditeur perso — le joueur peut les recopier tels quels. */
function snapToCustomStyleGrid(mods: TacticMods): TacticMods {
  const keys = Object.keys(mods) as (keyof TacticMods)[];
  // % arrondi au pas de 5, borné à ±30
  const pcts = {} as Record<keyof TacticMods, number>;
  for (const k of keys) {
    const pct = Math.round(((mods[k] - 1) * 100) / GRID_STEP) * GRID_STEP;
    pcts[k] = Math.min(GRID_MAX_PCT, Math.max(-GRID_MAX_PCT, pct));
  }
  // budget de l'éditeur : bonus 1 pt/%, malus rend 0,5 pt/% — on rabote le plus
  // gros bonus par pas de 5 tant que la proposition dépasse le budget
  const cost = () => keys.reduce((sum, k) => sum + (pcts[k] > 0 ? pcts[k] : pcts[k] * 0.5), 0);
  let guard = 0;
  while (cost() > GRID_BUDGET && guard++ < 60) {
    const biggest = keys.reduce((best, k) => (pcts[k] > pcts[best] ? k : best), keys[0]);
    if (pcts[biggest] <= 0) break;
    pcts[biggest] -= GRID_STEP;
  }
  const out = {} as TacticMods;
  for (const k of keys) out[k] = Math.round((1 + pcts[k] / 100) * 100) / 100;
  return out;
}

/** Famille de style d'un camp — même classement que le moteur de matchup. */
function resolveStyleProfileFor(side: ReportSide): StyleProfile | null {
  if (side.customTacticStyle) return customStyleProfile(side.customTacticStyle.mods);
  if (side.tacticStyle) return styleProfile(side.tacticStyle);
  return null;
}

/** Nom lisible du style joué : style perso nommé > style nommé > inconnu. */
function styleNameOf(side: ReportSide): string {
  if (side.customTacticStyle) return `${side.customTacticStyle.name} (style perso)`;
  if (side.tacticStyle) return TACTIC_STYLE_LABEL[side.tacticStyle];
  return 'Aucun style défini';
}

/** Famille de style d'une tactique sauvegardée (style perso actif inclus). */
function savedTacticProfile(t: SavedTactic): StyleProfile | null {
  if (t.activeCustomStyleId) {
    const custom = (t.customStyles ?? []).find((s) => s.id === t.activeCustomStyleId);
    if (custom) return customStyleProfile(custom.mods);
  }
  return t.style ? styleProfile(t.style) : null;
}

function participatedIds(state: MatchState, side: 'home' | 'away'): Set<string> {
  const initial = side === 'home' ? state.homeOnPitch : state.awayOnPitch;
  const ids = new Set(initial);
  for (const ev of state.events) {
    if (ev.type === 'substitution' && ev.side === side && ev.playerId) ids.add(ev.playerId);
  }
  return ids;
}

function ratePlayers(state: MatchState, side: 'home' | 'away', players: Player[]): PlayerReportEntry[] {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const ids = participatedIds(state, side);
  const subEventIds = new Set(
    state.events.filter((e) => e.type === 'substitution' && e.playerId).map((e) => e.playerId!),
  );

  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const yellows = new Map<string, number>();
  const reds = new Map<string, number>();
  const inc = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1);
  const events = state.events;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type === 'goal' && ev.playerId) {
      inc(goals, ev.playerId);
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const prior = events[j];
        if (prior.type === 'keyPass' && prior.side === ev.side && prior.playerId) {
          inc(assists, prior.playerId);
          break;
        }
        if (prior.type === 'goal') break;
      }
    }
    if (ev.type === 'yellow' && ev.playerId) inc(yellows, ev.playerId);
    if (ev.type === 'red' && ev.playerId) inc(reds, ev.playerId);
  }

  const entries: PlayerReportEntry[] = [];
  for (const pid of ids) {
    const player = playerMap.get(pid);
    if (!player) continue;
    const isSub = subEventIds.has(pid);
    const rating = computeMatchRating(
      player,
      side,
      state,
      goals.get(pid) ?? 0,
      assists.get(pid) ?? 0,
      yellows.get(pid) ?? 0,
      reds.get(pid) ?? 0,
      isSub,
    );
    entries.push({ playerId: pid, playerName: `${player.firstName} ${player.lastName}`, position: player.position, rating });
  }
  return entries;
}

/**
 * Generates a tactical report for one side of a match.
 * Works both mid-match (halftime, partial=true) and post-match (fulltime, partial=false).
 */
export function generateTacticalReport(
  state: MatchState,
  home: ReportSide,
  away: ReportSide,
  side: 'home' | 'away',
): TacticalReport {
  const opp: 'home' | 'away' = side === 'home' ? 'away' : 'home';
  const me = side === 'home' ? home : away;
  const oppSide = side === 'home' ? away : home;
  const partial = state.status !== 'fulltime' && state.status !== 'penalties';

  const myScore = state.score[side];
  const oppScore = state.score[opp];
  const myShots = state.shots[side];
  const oppShots = state.shots[opp];
  const myPoss = state.possession[side];
  const myXg = state.xg[side];
  const oppXg = state.xg[opp];
  const myKeyPasses = state.keyPasses[side];
  const oppKeyPasses = state.keyPasses[opp];
  const myFouls = state.fouls[side];
  const myCards = state.cards[side].yellow.length + state.cards[side].red.length * 2;

  // ── Strengths / weaknesses from stat differentials ──────────────────────
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (myPoss - state.possession[opp] >= 8) strengths.push(`Domination de possession (${myPoss}% contre ${state.possession[opp]}%)`);
  else if (state.possession[opp] - myPoss >= 8) weaknesses.push(`Possession subie (${myPoss}% seulement)`);

  if (myShots - oppShots >= 4) strengths.push(`Volume de tirs supérieur (${myShots} contre ${oppShots})`);
  else if (oppShots - myShots >= 4) weaknesses.push(`Trop peu de tirs produits (${myShots} contre ${oppShots})`);

  if (myXg - oppXg >= 0.5) strengths.push(`Meilleure qualité d'occasions (xG ${myXg.toFixed(2)} contre ${oppXg.toFixed(2)})`);
  else if (oppXg - myXg >= 0.5) weaknesses.push(`Occasions de faible qualité (xG ${myXg.toFixed(2)} contre ${oppXg.toFixed(2)})`);

  if (myKeyPasses - oppKeyPasses >= 3) strengths.push(`Milieu créatif (${myKeyPasses} passes clés)`);
  else if (oppKeyPasses - myKeyPasses >= 3) weaknesses.push(`Manque de créativité au milieu (${myKeyPasses} passes clés)`);

  if (oppXg <= 0.6 && !partial) strengths.push('Défense solide, très peu d\'occasions concédées');
  else if (oppXg - myXg >= 1.0) weaknesses.push('Défense perméable, trop d\'occasions concédées');

  if (myCards >= 4) weaknesses.push(`Indiscipline coûteuse (${myFouls} fautes, ${myCards} points de carton)`);
  else if (myFouls <= 6 && myCards === 0) strengths.push('Discipline exemplaire, aucun carton');

  if (myScore > oppScore) strengths.push(`Efficacité devant le but (${myScore} but${myScore > 1 ? 's' : ''} inscrit${myScore > 1 ? 's' : ''})`);
  else if (oppScore > myScore && myXg >= oppXg) weaknesses.push('Occasions non converties malgré la domination');

  if (strengths.length === 0) strengths.push('Prestation équilibrée, sans domination nette');
  if (weaknesses.length === 0) weaknesses.push('Aucune faiblesse majeure identifiée');

  // ── Players ──────────────────────────────────────────────────────────────
  const myRatings = ratePlayers(state, side, me.players);
  const oppRatings = ratePlayers(state, opp, oppSide.players);

  const bestPlayers = [...myRatings].sort((a, b) => b.rating - a.rating).slice(0, 3);
  const worstPlayers = [...myRatings].sort((a, b) => a.rating - b.rating).slice(0, 3);
  const bestOppPlayers = [...oppRatings].sort((a, b) => b.rating - a.rating).slice(0, 3);
  const worstOppPlayers = [...oppRatings].sort((a, b) => a.rating - b.rating).slice(0, 3);

  // ── Tactic verdict via matchup engine ───────────────────────────────────
  const adjustment = computeMatchupAdjustment(
    me.formation, oppSide.formation,
    me.tacticStyle, me.customTacticStyle,
    oppSide.tacticStyle, oppSide.customTacticStyle,
  );
  const favorable = adjustment.attackMult >= 1.0 && adjustment.defenseMult <= 1.02;
  let verdictWorked: boolean | null = null;
  let verdictText: string;
  if (partial) {
    if (myScore > oppScore || (myScore === oppScore && myXg > oppXg)) {
      verdictWorked = true;
      verdictText = favorable
        ? 'La tactique tire parti du matchup et mène au score/aux xG à la pause. À poursuivre.'
        : 'Bon résultat à la pause malgré un matchup défavorable sur le papier — tenir cette dynamique.';
    } else if (myScore < oppScore || oppXg - myXg >= 0.5) {
      verdictWorked = false;
      verdictText = favorable
        ? 'Malgré un matchup favorable, la tactique ne se traduit pas encore par des résultats concrets.'
        : 'Le matchup est défavorable et cela se ressent sur le jeu — ajustement recommandé pour la 2ᵉ mi-temps.';
    } else {
      verdictText = 'Match équilibré à la pause, tendance encore incertaine.';
    }
  } else {
    if (myScore > oppScore) {
      verdictWorked = true;
      verdictText = favorable
        ? 'La tactique a exploité le matchup favorable et mené à la victoire.'
        : 'Victoire obtenue malgré un matchup défavorable — la qualité individuelle a compensé.';
    } else if (myScore < oppScore) {
      verdictWorked = false;
      verdictText = favorable
        ? 'Le matchup était favorable sur le papier mais la tactique n\'a pas produit de résultat — exécution en cause.'
        : 'Le matchup était défavorable et la tactique n\'a pas permis de le renverser.';
    } else {
      verdictWorked = myXg > oppXg;
      verdictText = verdictWorked
        ? 'Match nul, mais la tactique a produit plus d\'occasions de qualité que l\'adversaire.'
        : 'Match nul sans réelle maîtrise du contenu de jeu.';
    }
  }

  // ── Improvements + counter-tactic ───────────────────────────────────────
  // A tactical fix is only warranted when the matchup itself was unfavorable, or when the
  // side was genuinely outplayed (xG gap) despite a favorable matchup. When the matchup was
  // favorable and the underlying numbers were close, the result is attributable to variance —
  // nothing tactical to change, and saying so beats generic advice the player can't act on.
  const outplayedDespiteFavorable = favorable && (oppXg - myXg >= 0.5);
  const explainableByVariance = favorable && !outplayedDespiteFavorable && myScore <= oppScore;

  const improvements: string[] = [];
  if (!favorable) {
    if (weaknesses.some((w) => w.includes('Possession'))) improvements.push('Resserrer les lignes pour mieux conserver le ballon');
    if (weaknesses.some((w) => w.includes('tirs'))) improvements.push('Augmenter la prise de risque offensive (plus de tirs tentés)');
    if (weaknesses.some((w) => w.includes('créativité'))) improvements.push('Repositionner un milieu créatif plus haut pour multiplier les passes clés');
    if (weaknesses.some((w) => w.includes('perméable'))) improvements.push('Compacter le bloc défensif ou faire redescendre un milieu');
  } else if (outplayedDespiteFavorable) {
    improvements.push('Le matchup était favorable mais l\'adversaire a produit plus d\'occasions de qualité — vérifier le placement défensif et les automatismes plutôt que la tactique elle-même');
    if (weaknesses.some((w) => w.includes('non converties'))) improvements.push('Travailler la finition — les occasions sont là, la conversion manque');
  } else if (explainableByVariance) {
    improvements.push('La tactique était la bonne réponse au matchup — le résultat s\'explique par la variance du match (finition, arrêts) plutôt que par un choix à corriger');
  }
  // Discipline is always within the player's control, independent of matchup quality.
  if (weaknesses.some((w) => w.includes('Indiscipline'))) improvements.push('Réduire l\'agressivité pour éviter les cartons inutiles');
  if (improvements.length === 0) improvements.push('Conserver l\'approche actuelle, aucun axe prioritaire identifié');

  const oppFP = formationProfile(oppSide.formation);
  const oppSP = resolveStyleProfileFor(oppSide);

  // ── Fiche adversaire : style précis + familles ──────────────────────────
  const opponent: TacticalReport['opponent'] = {
    formation: oppSide.formation,
    formationFamily: FORMATION_PROFILE_LABEL[oppFP],
    styleName: styleNameOf(oppSide),
    styleFamily: oppSP ? STYLE_PROFILE_LABEL[oppSP] : null,
  };
  /** « Gegenpressing (famille : Intensité haute) » — libellé réutilisé partout */
  const oppLabel = opponent.styleFamily
    ? `${opponent.styleName} (famille : ${opponent.styleFamily})`
    : `${opponent.styleName} (famille inclassable)`;

  // Score de matchup d'une paire (profil de style, profil de formation) contre l'adversaire.
  // Style ignoré quand le style adverse est inclassable — la formation reste comparable.
  const matchupScore = (sp: StyleProfile | null, fp: FormationProfile): { score: number; att: number; def: number } => {
    const [fAtt, fDef] = FORMATION_MATCHUP[fp][oppFP];
    let att = fAtt;
    let def = fDef;
    if (oppSP && sp) {
      const [sAtt, sDef] = STYLE_MATCHUP[sp][oppSP];
      att += sAtt;
      def += sDef;
    }
    return { score: att - def, att, def };
  };

  // Meilleure réponse générique : famille de style + famille de formation
  const profiles: StyleProfile[] = ['possession-build', 'direct-attack', 'high-intensity', 'defensive', 'wide-play', 'chaos'];
  const formProfiles: FormationProfile[] = ['high-press', 'balanced', 'midfield-heavy', 'defensive-block', 'wide-attack'];
  let bestProfile: StyleProfile = profiles[0];
  let bestFormProfile: FormationProfile = formProfiles[0];
  let bestGeneric = -Infinity;
  for (const sp of profiles) {
    for (const fp of formProfiles) {
      const { score } = matchupScore(sp, fp);
      // Un miroir (même profil que l'adversaire) score 0 par définition — jamais un vrai
      // contre : à score égal, un profil distinct gagne.
      const better = score > bestGeneric
        || (score === bestGeneric && sp !== oppSP && bestProfile === oppSP);
      if (better) { bestGeneric = score; bestProfile = sp; bestFormProfile = fp; }
    }
  }
  const style = STYLE_LABEL_BY_PROFILE[bestProfile];
  const formation = FORMATION_LABEL_BY_PROFILE[bestFormProfile];
  const generic = matchupScore(bestProfile, bestFormProfile);
  const customMods = sharpenModsForMatchup(style, oppSP ? STYLE_MATCHUP[bestProfile][oppSP][0] - STYLE_MATCHUP[bestProfile][oppSP][1] : 0);

  // Score de la tactique réellement jouée — la barre à franchir pour proposer autre chose.
  const myFP = formationProfile(me.formation);
  const mySP = resolveStyleProfileFor(me);
  const current = matchupScore(mySP, myFP);

  // Tactiques sauvegardées : la meilleure qui BAT la tactique actuelle contre CET adversaire.
  const savedTactics = me.savedTactics ?? me.team.savedTactics ?? [];
  let savedMatch: SavedTactic | null = null;
  let savedEval = current;
  for (const t of savedTactics) {
    const tSP = savedTacticProfile(t);
    const tFP = formationProfile(t.formation);
    // ignorer la tactique identique à celle jouée (même familles = même comportement moteur)
    if (tSP === mySP && tFP === myFP) continue;
    const ev = matchupScore(tSP, tFP);
    if (ev.score > savedEval.score) { savedEval = ev; savedMatch = t; }
  }

  const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const edgeOf = (ev: { att: number; def: number }) => ({
    attack: Math.round((ev.att - current.att) * 100) / 100,
    defense: Math.round((ev.def - current.def) * 100) / 100,
  });
  const edgeText = (ev: { att: number; def: number }) =>
    `avantage estimé vs tactique actuelle : ${pct(ev.att - current.att)} attaque, ${pct(-(ev.def - current.def))} défense`;

  let counterTactic: TacticalReport['counterTactic'] = null;
  if (savedMatch) {
    const tSP = savedTacticProfile(savedMatch);
    counterTactic = {
      formation: savedMatch.formation,
      style: savedMatch.style,
      text: `Face à ${oppLabel} en ${oppSide.formation} (${opponent.formationFamily}), ta tactique sauvegardée « ${savedMatch.name} » (${savedMatch.formationLabel ?? savedMatch.formation} · ${tSP ? STYLE_PROFILE_LABEL[tSP] : TACTIC_STYLE_LABEL[savedMatch.style]}) est une meilleure réponse — ${edgeText(savedEval)}. Réglages suggérés ci-dessous pour l'affiner.`,
      savedTactic: { id: savedMatch.id, name: savedMatch.name },
      customMods: sharpenModsForMatchup(savedMatch.style, oppSP && savedTacticProfile(savedMatch) ? STYLE_MATCHUP[savedTacticProfile(savedMatch)!][oppSP][0] - STYLE_MATCHUP[savedTacticProfile(savedMatch)!][oppSP][1] : 0),
      edge: edgeOf(savedEval),
    };
  } else if (generic.score > current.score + 0.001) {
    // Aucune sauvegardée ne fait mieux, mais une réponse générique existe
    counterTactic = {
      formation,
      style,
      text: `Face à ${oppLabel} en ${oppSide.formation} (${opponent.formationFamily}), privilégier un profil « ${STYLE_PROFILE_LABEL[bestProfile]} » — par ex. ${formation} en ${TACTIC_STYLE_LABEL[style]} (${edgeText(generic)}). Aucune de tes tactiques sauvegardées ne fait mieux que l'actuelle contre ce profil : envisage d'en créer une avec les réglages ci-dessous.`,
      savedTactic: null,
      customMods,
      edge: edgeOf(generic),
    };
  } else {
    // La tactique actuelle est déjà la meilleure réponse connue — le dire clairement.
    counterTactic = {
      formation: me.formation,
      style: me.tacticStyle ?? style,
      text: `Face à ${oppLabel} en ${oppSide.formation} (${opponent.formationFamily}), ta tactique actuelle est déjà la meilleure réponse parmi tes tactiques sauvegardées et les profils génériques — aucun changement recommandé.`,
      savedTactic: null,
      customMods: snapToCustomStyleGrid(getTacticMods(me.tacticStyle ?? 'possession')),
      edge: { attack: 0, defense: 0 },
    };
  }

  return {
    partial,
    side,
    teamName: me.team.name,
    oppName: oppSide.team.name,
    strengths,
    weaknesses,
    bestPlayers,
    worstPlayers,
    bestOppPlayers,
    worstOppPlayers,
    verdict: { worked: verdictWorked, text: verdictText },
    improvements,
    opponent,
    counterTactic,
  };
}
