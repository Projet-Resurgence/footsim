import type { CustomTacticStyle, Formation, Player, SavedTactic, TacticStyle, Team } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';
import type { MatchState, TacticMods } from '@/lib/sim/types';
import { computeMatchRating } from '@/lib/competition/statsAccumulator';
import { getTacticMods } from '@/lib/sim/precompute';
import {
  computeMatchupAdjustment,
  formationProfile,
  styleProfile,
  FORMATION_MATCHUP,
  STYLE_MATCHUP,
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
  counterTactic: {
    formation: Formation;
    style: TacticStyle;
    text: string;
    /** matching tactic already saved for this team, if one is close to the recommendation */
    savedTactic: { id: string; name: string } | null;
    /** fine-tuned custom mods, derived from `style`'s base values and sharpened against this specific opponent */
    customMods: TacticMods;
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

function resolveStyleProfileFor(side: ReportSide): StyleProfile | null {
  if (side.customTacticStyle) {
    const m = side.customTacticStyle.mods;
    if (m.defenseMult >= 1.12) return 'defensive';
    if (m.foulRateMult >= 1.15 && m.midfieldMult >= 1.10) return 'high-intensity';
    if (m.midfieldMult >= 1.12) return 'possession-build';
    if (m.shotFreqMult >= 1.15 || m.attackMult >= 1.10) return 'direct-attack';
    if (m.foulRateMult >= 1.25 || m.shotFreqMult >= 1.25) return 'chaos';
    return null;
  }
  if (side.tacticStyle) return styleProfile(side.tacticStyle);
  return null;
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

  let counterTactic: TacticalReport['counterTactic'] = null;
  if (oppSP) {
    // Find the style profile that scores best (attack minus defense taken) against oppSP.
    // Tie-break: prefer a profile different from the opponent's own — a mirrored matchup
    // (e.g. direct-attack vs direct-attack) scores 0 by definition and is never a real
    // counter, just a coin flip, so it should lose ties to any distinct profile.
    const profiles: StyleProfile[] = ['possession-build', 'direct-attack', 'high-intensity', 'defensive', 'chaos'];
    let bestProfile: StyleProfile = profiles[0];
    let bestScore = -Infinity;
    for (const p of profiles) {
      const [att, def] = STYLE_MATCHUP[p][oppSP];
      const score = att - def; // maximize attack, minimize defense multiplier taken
      const better = score > bestScore
        || (score === bestScore && p !== oppSP && bestProfile === oppSP);
      if (better) { bestScore = score; bestProfile = p; }
    }
    // matching formation profile: best attack/defense combo vs opponent's formation profile
    const formProfiles: FormationProfile[] = ['high-press', 'balanced', 'midfield-heavy', 'defensive-block'];
    let bestFormProfile: FormationProfile = formProfiles[0];
    let bestFormScore = -Infinity;
    for (const p of formProfiles) {
      const [att, def] = FORMATION_MATCHUP[p][oppFP];
      const score = att - def;
      const better = score > bestFormScore
        || (score === bestFormScore && p !== oppFP && bestFormProfile === oppFP);
      if (better) { bestFormScore = score; bestFormProfile = p; }
    }
    const style = STYLE_LABEL_BY_PROFILE[bestProfile];
    const formation = FORMATION_LABEL_BY_PROFILE[bestFormProfile];
    const [recAtt, recDef] = STYLE_MATCHUP[bestProfile][oppSP];
    const customMods = sharpenModsForMatchup(style, recAtt - recDef);

    // Score of the tactic actually in use this match — the bar a saved tactic must clear
    // to be worth recommending. Without this, the "best of a bad bunch" saved tactic could
    // get recommended even when it's no better (or is literally) the one already played.
    const myFP = formationProfile(me.formation);
    const mySPForCompare = resolveStyleProfileFor(me);
    const currentScore = mySPForCompare
      ? (STYLE_MATCHUP[mySPForCompare][oppSP][0] - STYLE_MATCHUP[mySPForCompare][oppSP][1])
        + (FORMATION_MATCHUP[myFP][oppFP][0] - FORMATION_MATCHUP[myFP][oppFP][1])
      : (FORMATION_MATCHUP[myFP][oppFP][0] - FORMATION_MATCHUP[myFP][oppFP][1]);

    // Look for a tactic already saved by this team that beats the current one against this opponent.
    const savedTactics = me.savedTactics ?? me.team.savedTactics ?? [];
    let savedMatch: SavedTactic | null = null;
    let savedMatchScore = currentScore;
    let savedMatchEdge = 0;
    for (const t of savedTactics) {
      const isCurrent = t.formation === me.formation && t.style === (me.tacticStyle ?? t.style);
      if (isCurrent) continue;
      const tFP = formationProfile(t.formation);
      const tSP = styleProfile(t.style);
      const [tAtt, tDef] = STYLE_MATCHUP[tSP][oppSP];
      const [tfAtt, tfDef] = FORMATION_MATCHUP[tFP][oppFP];
      const score = (tAtt - tDef) + (tfAtt - tfDef);
      if (score > savedMatchScore) { savedMatchScore = score; savedMatch = t; savedMatchEdge = tAtt - tDef; }
    }

    const text = savedMatch
      ? `Face à un profil "${TACTIC_STYLE_LABEL[oppSide.tacticStyle ?? 'possession']}", la tactique sauvegardée "${savedMatch.name}" (${savedMatch.formationLabel ?? savedMatch.formation} · ${TACTIC_STYLE_LABEL[savedMatch.style]}) ferait mieux que la tactique actuelle face à ce profil. Réglages suggérés ci-dessous pour l'affiner davantage.`
      : favorable
        ? `Le matchup était déjà favorable avec la tactique actuelle — aucune tactique sauvegardée ne fait mieux face à un profil "${TACTIC_STYLE_LABEL[oppSide.tacticStyle ?? 'possession']}".`
        : `Face à un profil "${TACTIC_STYLE_LABEL[oppSide.tacticStyle ?? 'possession']}", privilégier ${formation} en ${TACTIC_STYLE_LABEL[style]} pour maximiser l'avantage tactique. Aucune tactique sauvegardée ne fait mieux que l'actuelle — envisager d'en créer une, ou ajuster manuellement avec les réglages ci-dessous.`;

    counterTactic = (savedMatch || !favorable)
      ? {
          formation: savedMatch?.formation ?? formation,
          style: savedMatch?.style ?? style,
          text,
          savedTactic: savedMatch ? { id: savedMatch.id, name: savedMatch.name } : null,
          customMods: savedMatch ? sharpenModsForMatchup(savedMatch.style, savedMatchEdge) : customMods,
        }
      : null;
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
    counterTactic,
  };
}
