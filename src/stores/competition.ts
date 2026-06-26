import { create } from 'zustand';
import type { Competition, CompetitionSummary } from '@/lib/competition/types';
import {
  listCompetitions,
  loadCompetition,
  saveCompetition,
  deleteCompetition,
  invalidateIndexCache,
} from '@/lib/github/competitions';

const LS_KEY = (id: string) => `footsim.competition.${id}`;

function lsRead(id: string): Competition | null {
  try {
    const raw = localStorage.getItem(LS_KEY(id));
    return raw ? (JSON.parse(raw) as Competition) : null;
  } catch {
    return null;
  }
}

function lsWrite(c: Competition) {
  try {
    localStorage.setItem(LS_KEY(c.id), JSON.stringify(c));
  } catch {}
}

function lsDelete(id: string) {
  try {
    localStorage.removeItem(LS_KEY(id));
  } catch {}
}

type State = {
  summaries: CompetitionSummary[];
  current: Competition | null;
  loading: boolean;
  dirty: boolean;
  refresh: (token: string) => Promise<void>;
  load: (id: string, token: string) => Promise<Competition | null>;
  save: (competition: Competition, token: string) => Promise<void>;
  remove: (id: string, token: string) => Promise<void>;
  setCurrent: (c: Competition | null) => void;
  saveLocal: (competition: Competition) => void;
};

export const useCompetition = create<State>((set, get) => ({
  summaries: [],
  current: null,
  loading: false,
  dirty: false,

  async refresh(token) {
    set({ loading: true });
    try {
      const summaries = await listCompetitions(token);
      set({ summaries });
    } finally {
      set({ loading: false });
    }
  },

  async load(id, token) {
    // localStorage wins — it holds unsaved match results
    const local = lsRead(id);
    if (local) {
      set({ current: local, dirty: true });
      return local;
    }
    const comp = await loadCompetition(id, token);
    if (comp) lsWrite(comp);
    set({ current: comp, dirty: false });
    return comp;
  },

  async save(competition, token) {
    await saveCompetition(competition, token);
    // After GitHub save, only mark dirty=false if the store still holds this exact version.
    // Never overwrite local state — saveLocal/setCurrent are always more recent.
    const storeCurrent = get().current;
    const isSameVersion = storeCurrent?.id === competition.id && storeCurrent.currentRound === competition.currentRound;
    if (isSameVersion) {
      set({ dirty: false });
    }
    const summary: CompetitionSummary = {
      id: competition.id,
      name: competition.name,
      format: competition.format,
      status: competition.status,
      teamCount: competition.teamIds.length,
      createdAt: competition.createdAt,
      winner: competition.winner,
      year: competition.year,
      kind: competition.kind,
      scope: competition.scope,
      teamIds: competition.teamIds,
    };
    const list = get().summaries;
    const next = list.some((c) => c.id === competition.id)
      ? list.map((c) => (c.id === competition.id ? summary : c))
      : [summary, ...list];
    set({ summaries: next });
  },

  async remove(id, token) {
    await deleteCompetition(id, token);
    lsDelete(id);
    invalidateIndexCache();
    set({ summaries: get().summaries.filter((c) => c.id !== id) });
    if (get().current?.id === id) set({ current: null, dirty: false });
  },

  setCurrent(c) {
    if (c) {
      lsWrite(c);
      set({ current: c, dirty: true });
    } else {
      set({ current: null, dirty: false });
    }
  },

  saveLocal(competition) {
    lsWrite(competition);
    set({ current: competition, dirty: true });
  },
}));
