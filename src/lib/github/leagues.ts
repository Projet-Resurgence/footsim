import type { League } from '@/lib/types';
import type { ILeagueBackend } from '@/lib/leagueBackend';
import { env } from '@/lib/env';
import { readJson, writeJson, deleteFile } from './api';

const API = 'https://api.github.com';
const PATH = (nationSlug: string, id: string) => `data/leagues/${nationSlug}/${id}.json`;

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function listLeagueFiles(nationSlug: string, token: string): Promise<string[]> {
  const res = await fetch(
    `${API}/repos/${env.dataRepo}/contents/data/leagues/${nationSlug}?ref=${env.dataBranch}`,
    { headers: authHeaders(token) },
  );
  if (res.status === 404) return [];
  if (!res.ok) return [];
  const json = (await res.json()) as Array<{ name: string; type: string }>;
  return json
    .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
    .map((e) => e.name.replace('.json', ''));
}

export class GithubLeagueBackend implements ILeagueBackend {
  constructor(private token: string) {}

  async listLeagues(nationSlug: string): Promise<League[]> {
    const fileIds = await listLeagueFiles(nationSlug, this.token);
    const out: League[] = [];
    for (const id of fileIds) {
      const res = await readJson<League>(PATH(nationSlug, id), this.token);
      if (res) out.push(res.data);
    }
    return out;
  }

  async loadLeague(id: string): Promise<League | null> {
    // id format: "{nationSlug}/{uuid}"
    const slash = id.indexOf('/');
    if (slash === -1) return null;
    const nationSlug = id.slice(0, slash);
    const fileId = id.slice(slash + 1);
    const res = await readJson<League>(PATH(nationSlug, fileId), this.token);
    return res?.data ?? null;
  }

  async saveLeague(league: League): Promise<void> {
    const filePath = PATH(league.nationSlug, league.id);
    const existing = await readJson<League>(filePath, this.token);
    await writeJson({
      path: filePath,
      token: this.token,
      data: league,
      message: existing
        ? `chore(leagues): update ${league.id}`
        : `feat(leagues): create ${league.name}`,
      sha: existing?.sha,
    });
  }

  async deleteLeague(id: string, nationSlug: string): Promise<void> {
    const filePath = PATH(nationSlug, id);
    const existing = await readJson<League>(filePath, this.token);
    if (!existing) return;
    await deleteFile(filePath, existing.sha, this.token, `chore(leagues): delete ${id}`);
  }
}
