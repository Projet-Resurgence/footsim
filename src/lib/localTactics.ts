import type { SavedTactic, TeamTactics } from '@/lib/types';

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

/** Resolve the active tactic from team data + local overrides */
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
