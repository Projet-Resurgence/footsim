import type { Player, Team } from '@/lib/types';
import type { CompHistoryEntry } from '@/lib/competition/types';
import type { Injury, Suspension } from '@/lib/competition/injuries';
import { readJson, writeJson, commitFiles, listDir, deleteFile } from './api';

const TEAM_PATH = (slug: string) => `data/teams/${slug}/team.json`;
const ROSTER_PATH = (slug: string) => `data/teams/${slug}/players.json`;

export async function saveTeamWithRoster(
  team: Team,
  players: Player[],
  token: string,
): Promise<void> {
  const existingTeam = await readJson<Team>(TEAM_PATH(team.slug), token);
  const existingRoster = await readJson<Player[]>(ROSTER_PATH(team.slug), token);
  await writeJson({
    path: TEAM_PATH(team.slug),
    token,
    data: team,
    message: existingTeam
      ? `chore(teams): update ${team.slug}`
      : `feat(teams): create ${team.slug}`,
    sha: existingTeam?.sha,
  });
  await writeJson({
    path: ROSTER_PATH(team.slug),
    token,
    data: players,
    message: `feat(teams/${team.slug}): write ${players.length} players`,
    sha: existingRoster?.sha,
  });
}

export async function loadTeam(
  slug: string,
  token: string | null,
): Promise<{ team: Team; players: Player[] } | null> {
  const team = await readJson<Team>(TEAM_PATH(slug), token);
  if (!team) return null;
  const roster = await readJson<Player[]>(ROSTER_PATH(slug), token);
  return { team: team.data, players: roster?.data ?? [] };
}

export async function deleteTeam(slug: string, token: string): Promise<void> {
  const team = await readJson<Team>(TEAM_PATH(slug), token);
  const roster = await readJson<Player[]>(ROSTER_PATH(slug), token);
  if (roster) {
    await deleteFile(
      ROSTER_PATH(slug),
      roster.sha,
      token,
      `chore(teams/${slug}): delete players.json`,
    );
  }
  if (team) {
    await deleteFile(
      TEAM_PATH(slug),
      team.sha,
      token,
      `chore(teams): delete ${slug}`,
    );
  }
}

/**
 * Update compHistory for multiple teams in a single Git commit.
 * mode 'append': adds entry if compId not already present.
 * mode 'remove': removes entry matching compId.
 */
export async function batchUpdateTeamCompHistory(
  slugs: string[],
  token: string,
  opts: { mode: 'append'; entry: CompHistoryEntry } | { mode: 'remove'; compId: string },
): Promise<void> {
  if (slugs.length === 0) return;

  // Read all team.json in parallel
  const reads = await Promise.all(slugs.map((slug) => readJson<Team>(TEAM_PATH(slug), token)));

  const files: Array<{ path: string; content: Team }> = [];
  for (let i = 0; i < slugs.length; i++) {
    const existing = reads[i];
    if (!existing) continue;
    const team = existing.data;
    const prev = team.compHistory ?? [];

    let next: CompHistoryEntry[];
    if (opts.mode === 'append') {
      if (prev.some((e) => e.compId === opts.entry.compId)) continue;
      next = [...prev, opts.entry];
    } else {
      if (!prev.some((e) => e.compId === opts.compId)) continue;
      next = prev.filter((e) => e.compId !== opts.compId);
    }
    files.push({ path: TEAM_PATH(slugs[i]), content: { ...team, compHistory: next } });
  }

  if (files.length === 0) return;

  const msg = opts.mode === 'append'
    ? `chore(teams): add ${opts.entry.compName} to palmares (${files.length} équipes)`
    : `chore(teams): remove comp ${opts.compId} from palmares (${files.length} équipes)`;

  await commitFiles(files, msg, token);
}

/**
 * Persist remaining injuries/suspensions for each team after a competition ends.
 * Each team only gets its own entries (filtered by teamId).
 */
export async function batchUpdateTeamMedical(
  slugs: string[],
  teamIdBySlug: Record<string, string>,
  injuries: Injury[],
  suspensions: Suspension[],
  token: string,
): Promise<void> {
  if (slugs.length === 0) return;
  const reads = await Promise.all(slugs.map((slug) => readJson<Team>(TEAM_PATH(slug), token)));
  const files: Array<{ path: string; content: Team }> = [];
  for (let i = 0; i < slugs.length; i++) {
    const existing = reads[i];
    if (!existing) continue;
    const team = existing.data;
    const tid = teamIdBySlug[slugs[i]];
    const teamInjuries = injuries.filter((inj) => inj.teamId === tid);
    const teamSuspensions = suspensions.filter((sus) => sus.teamId === tid);
    files.push({ path: TEAM_PATH(slugs[i]), content: { ...team, injuries: teamInjuries, suspensions: teamSuspensions } });
  }
  if (files.length === 0) return;
  await commitFiles(files, `chore(teams): persist medical state post-compétition (${files.length} équipes)`, token);
}

export async function listTeams(token: string | null): Promise<Team[]> {
  const slugs = await listDir('data/teams', token);
  const results = await Promise.all(slugs.map((slug) => readJson<Team>(TEAM_PATH(slug), token)));
  return results.filter(Boolean).map((r) => r!.data);
}
