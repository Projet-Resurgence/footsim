import type { Competition, CompetitionSummary } from '@/lib/competition/types';
import { readJson, writeJson, deleteFile } from './api';

const INDEX_PATH = 'data/competitions/index.json';
const COMP_PATH = (id: string) => `data/competitions/${id}.json`;

// Cache the last known index SHA to avoid GitHub API replication lag (stale reads right after a write)
let cachedIndexSha: string | undefined;
let cachedIndexData: CompetitionSummary[] | undefined;

async function readIndex(token: string | null): Promise<{ data: CompetitionSummary[]; sha: string } | null> {
  const res = await readJson<CompetitionSummary[]>(INDEX_PATH, token);
  if (res) {
    cachedIndexSha = res.sha;
    cachedIndexData = res.data;
  }
  return res;
}

async function writeIndex(data: CompetitionSummary[], token: string, message: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await writeJson({
        path: INDEX_PATH,
        token,
        data,
        message,
        sha: cachedIndexSha,
      });
      cachedIndexSha = result.sha;
      cachedIndexData = data;
      return;
    } catch (err) {
      const msg = String(err);
      if ((msg.includes('409') || msg.includes('422')) && attempt < 3) {
        // SHA stale — re-fetch and retry
        const fresh = await readJson<CompetitionSummary[]>(INDEX_PATH, token);
        cachedIndexSha = fresh?.sha;
        cachedIndexData = fresh?.data;
        continue;
      }
      throw err;
    }
  }
}

// Single global queue — toutes les ops compétition touchent index.json (partagé)
let globalQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = globalQueue.then(fn);
  globalQueue = result.then(() => {}, () => {});
  return result;
}

export async function listCompetitions(token: string | null): Promise<CompetitionSummary[]> {
  const res = await readIndex(token);
  return res?.data ?? [];
}

export async function loadCompetition(id: string, token: string): Promise<Competition | null> {
  const res = await readJson<Competition>(COMP_PATH(id), token);
  return res?.data ?? null;
}

export function saveCompetition(competition: Competition, token: string): Promise<void> {
  return enqueue(async () => {
    const existing = await readJson<Competition>(COMP_PATH(competition.id), token);
    await writeJson({
      path: COMP_PATH(competition.id),
      token,
      data: competition,
      message: existing
        ? `chore(competitions): update ${competition.name}`
        : `feat(competitions): create ${competition.name}`,
      sha: existing?.sha,
    });

    // Use cached index data if available to avoid re-reading stale SHA right after a write
    const idx = cachedIndexData !== undefined && cachedIndexSha !== undefined
      ? { data: cachedIndexData, sha: cachedIndexSha }
      : await readIndex(token);
    const summary: CompetitionSummary = {
      id: competition.id,
      name: competition.name,
      format: competition.format,
      status: competition.status,
      teamCount: competition.teamIds.length,
      createdAt: competition.createdAt,
      winner: competition.winner,
    };
    const list = idx?.data ?? [];
    const next = list.some((c) => c.id === competition.id)
      ? list.map((c) => (c.id === competition.id ? summary : c))
      : [summary, ...list];
    await writeIndex(next, token, `chore(competitions): update index`);
  });
}

export function deleteCompetition(id: string, token: string): Promise<void> {
  return enqueue(async () => {
    const existing = await readJson<Competition>(COMP_PATH(id), token);
    if (existing) {
      await deleteFile(COMP_PATH(id), existing.sha, token, `chore(competitions): delete ${id}`);
    }
    const idx = cachedIndexData !== undefined && cachedIndexSha !== undefined
      ? { data: cachedIndexData, sha: cachedIndexSha }
      : await readIndex(token);
    if (!idx) return;
    const next = idx.data.filter((c) => c.id !== id);
    await writeIndex(next, token, `chore(competitions): remove ${id} from index`);
  });
}
