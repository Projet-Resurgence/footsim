import type { CustomTacticStyle, SavedTactic, TeamTactics } from '@/lib/types';

/** Legacy single-tactics key (compat) */
export function loadLocalTactics(teamId: string): TeamTactics | undefined {
  try {
    const raw = localStorage.getItem(`footsim.tactics.${teamId}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function saveLocalTactics(teamId: string, tactics: TeamTactics) {
  localStorage.setItem(`footsim.tactics.${teamId}`, JSON.stringify(tactics));
}

const SAVED_KEY = (teamId: string) => `footsim.savedtactics.${teamId}`;

export function loadLocalSavedTactics(teamId: string): { savedTactics: SavedTactic[]; activeTacticId?: string } {
  try {
    const raw = localStorage.getItem(SAVED_KEY(teamId));
    return raw ? JSON.parse(raw) : { savedTactics: [] };
  } catch {
    return { savedTactics: [] };
  }
}

export function saveLocalSavedTactics(teamId: string, savedTactics: SavedTactic[], activeTacticId?: string) {
  localStorage.setItem(SAVED_KEY(teamId), JSON.stringify({ savedTactics, activeTacticId }));
}

/**
 * Resolve the active custom style of a tactic. Looks in the tactic's own styles
 * first, then the team-level shared pool (TacticsPanel saves to both).
 */
export function resolveActiveCustomStyle(
  tactics: TeamTactics | null | undefined,
  team?: { customStyles?: CustomTacticStyle[] },
): CustomTacticStyle | undefined {
  if (!tactics?.activeCustomStyleId) return undefined;
  const pool = [...(tactics.customStyles ?? []), ...(team?.customStyles ?? [])];
  return pool.find((s) => s.id === tactics.activeCustomStyleId);
}

type TeamLike = { id: string; tactics?: TeamTactics; savedTactics?: SavedTactic[]; activeTacticId?: string };

function savedTacticsOf(team: TeamLike): SavedTactic[] {
  const local = loadLocalSavedTactics(team.id);
  return local.savedTactics.length > 0 ? local.savedTactics : (team.savedTactics ?? []);
}

/**
 * Résolution complète d'un match : tactiques de base des deux camps
 * (override manuel > tactique active), puis
 * contre-tactiques — si mon équipe déclare « si X joue sa tactique Y »
 * et que Y est la tactique de base de X, ma contre-tactique prend le dessus.
 * Un camp avec override manuel n'est jamais re-modifié, mais l'autre camp
 * peut contrer son override.
 */
export function resolveMatchTactics(
  home: TeamLike | null | undefined,
  away: TeamLike | null | undefined,
  overrides?: { home?: TeamTactics | null; away?: TeamTactics | null },
): { home: TeamTactics | undefined; away: TeamTactics | undefined } {
  const baseHome = overrides?.home ?? (home ? resolveActiveTactic(home) : undefined) ?? undefined;
  const baseAway = overrides?.away ?? (away ? resolveActiveTactic(away) : undefined) ?? undefined;

  function counterFor(team: TeamLike | null | undefined, oppTeam: TeamLike | null | undefined, oppTactic: TeamTactics | undefined): SavedTactic | undefined {
    if (!team || !oppTeam) return undefined;
    const oppTacticId = (oppTactic as SavedTactic | undefined)?.id;
    if (!oppTacticId) return undefined;
    return savedTacticsOf(team).find((t) =>
      t.counterTactics?.some((c) => c.teamId === oppTeam.id && c.tacticId === oppTacticId),
    );
  }

  return {
    home: (overrides?.home ? undefined : counterFor(home, away, baseAway)) ?? baseHome,
    away: (overrides?.away ? undefined : counterFor(away, home, baseHome)) ?? baseAway,
  };
}

/** Contre-tactique déclarée contre une tactique adverse précise — aussi utilisé en plein match */
export function findCounterTactic(
  team: TeamLike | null | undefined,
  oppTeamId: string | undefined,
  oppTacticId: string | undefined,
): SavedTactic | undefined {
  if (!team || !oppTeamId || !oppTacticId) return undefined;
  return savedTacticsOf(team).find((t) =>
    t.counterTactics?.some((c) => c.teamId === oppTeamId && c.tacticId === oppTacticId),
  );
}

/** Patch MatchInput side complet pour appliquer une tactique (setup + changements en match) */
export function tacticToSidePatch(tactic: SavedTactic, team: { customStyles?: CustomTacticStyle[] }) {
  return {
    formation: tactic.formation,
    lineup: tactic.lineup,
    bench: tactic.bench,
    plannedSubs: tactic.plannedSubs,
    tacticStyle: tactic.style,
    customTacticStyle: resolveActiveCustomStyle(tactic, team),
    planB: tactic.planB,
    setPieceTakers: tactic.setPieceTakers,
    captainId: tactic.captainId,
    positionMap: tactic.positionMap,
    tokenPositions: tactic.tokenPositions,
    hasTactic: true as const,
  };
}

/** Resolve the active tactic from team data + local overrides. */
export function resolveActiveTactic(
  team: { id: string; tactics?: TeamTactics; savedTactics?: SavedTactic[]; activeTacticId?: string },
): TeamTactics | undefined {
  const local = loadLocalSavedTactics(team.id);
  const savedTactics = local.savedTactics.length > 0 ? local.savedTactics : (team.savedTactics ?? []);
  const activeTacticId = local.activeTacticId ?? team.activeTacticId;
  if (activeTacticId && savedTactics.length > 0) {
    const found = savedTactics.find((t) => t.id === activeTacticId);
    if (found) return found;
  }
  // fallback legacy
  return loadLocalTactics(team.id) ?? team.tactics;
}
