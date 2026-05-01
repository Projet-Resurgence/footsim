import type { Competition, CompetitionSummary } from '@/lib/competition/types';
import { readJson, writeJson, deleteFile } from './api';

const INDEX_PATH = 'data/competitions/index.json';
const COMP_PATH = (id: string) => `data/competitions/${id}.json`;

async function readIndex(token: string): Promise<{ data: CompetitionSummary[]; sha: string } | null> {
  return readJson<CompetitionSummary[]>(INDEX_PATH, token);
}

// Single global queue — toutes les ops compétition touchent index.json (partagé)
let globalQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = globalQueue.then(fn);
  globalQueue = result.then(() => {}, () => {});
  return result;
}

export async function listCompetitions(token: string): Promise<CompetitionSummary[]> {
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

    const idx = await readIndex(token);
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
    await writeJson({
      path: INDEX_PATH,
      token,
      data: next,
      message: `chore(competitions): update index`,
      sha: idx?.sha,
    });
  });
}

export function deleteCompetition(id: string, token: string): Promise<void> {
  return enqueue(async () => {
    const existing = await readJson<Competition>(COMP_PATH(id), token);
    if (existing) {
      await deleteFile(COMP_PATH(id), existing.sha, token, `chore(competitions): delete ${id}`);
    }
    const idx = await readIndex(token);
    if (!idx) return;
    const next = idx.data.filter((c) => c.id !== id);
    await writeJson({
      path: INDEX_PATH,
      token,
      data: next,
      message: `chore(competitions): remove ${id} from index`,
      sha: idx.sha,
    });
  });
}
