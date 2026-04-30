import type { Player, Team } from '@/lib/types';
import { readJson, writeJson, listDir, deleteFile } from './api';

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
  token: string,
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

export async function listTeams(token: string): Promise<Team[]> {
  const slugs = await listDir('data/teams', token);
  const out: Team[] = [];
  for (const slug of slugs) {
    const t = await readJson<Team>(TEAM_PATH(slug), token);
    if (t) out.push(t.data);
  }
  return out;
}
