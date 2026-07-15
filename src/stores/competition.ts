import { create } from 'zustand';
import type { Competition, CompetitionSummary } from '@/lib/competition/types';
import {
  listCompetitions,
  loadCompetition,
  saveCompetition,
  deleteCompetition,
  invalidateIndexCache,
} from '@/lib/github/competitions';
import { PrApiCompetitionBackend } from '@/lib/prapi/competitionBackend';
import type { StoredMatch } from '@/lib/prapi/matchBackend';
import type { Player, Team } from '@/lib/types';

function makePrBackend(prApiToken: string | null) {
  return prApiToken ? new PrApiCompetitionBackend(prApiToken) : null;
}

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
  } catch {
    // Quota exceeded — strip heavy fields and retry
    try {
      const slim = { ...c, pressItems: undefined, playerStats: undefined };
      localStorage.setItem(LS_KEY(c.id), JSON.stringify(slim));
      console.warn('[lsWrite] quota exceeded, saved slim version without pressItems/playerStats');
    } catch (e2) {
      console.error('[lsWrite] localStorage write failed even slim:', e2);
    }
  }
}

function lsDelete(id: string) {
  try {
    localStorage.removeItem(LS_KEY(id));
  } catch {}
}

// After a successful backend save, only mark dirty=false if the store still holds this
// exact version. Never overwrite local state — saveLocal/setCurrent are always more recent.
function markSavedAndIndex(
  set: (partial: Partial<State>) => void,
  get: () => State,
  competition: Competition,
) {
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
}

type State = {
  summaries: CompetitionSummary[];
  current: Competition | null;
  loading: boolean;
  dirty: boolean;
  refresh: (token: string, prApiToken?: string | null) => Promise<void>;
  load: (id: string, token: string, prApiToken?: string | null) => Promise<Competition | null>;
  save: (competition: Competition, token: string, prApiToken?: string | null) => Promise<void>;
  roundComplete: (
    competition: Competition,
    matches: StoredMatch[],
    teams: { slug: string; team: Team; players: Player[] }[],
    prApiToken: string,
  ) => Promise<void>;
  remove: (id: string, token: string, prApiToken?: string | null) => Promise<void>;
  setCurrent: (c: Competition | null) => void;
  saveLocal: (competition: Competition) => void;
};

export const useCompetition = create<State>((set, get) => ({
  summaries: [],
  current: null,
  loading: false,
  dirty: false,

  async refresh(token, prApiToken = null) {
    set({ loading: true });
    try {
      const pr = makePrBackend(prApiToken);
      const summaries = pr
        ? await pr.listCompetitions()
        : await listCompetitions(token);
      set({ summaries });
    } finally {
      set({ loading: false });
    }
  },

  async load(id, token, prApiToken = null) {
    // localStorage wins — it holds unsaved match results
    const local = lsRead(id);
    const storeCurrent = get().current;
    const storeRound = storeCurrent?.id === id ? storeCurrent.currentRound : 0;
    console.log('[competition.load]', { id, localRound: local?.currentRound ?? null, storeRound });

    // In-memory store is the most current source (e.g. localStorage quota exceeded — lsWrite failed silently)
    if (!local && storeCurrent?.id === id && storeRound > 0) {
      console.log('[competition.load] localStorage miss but store has data — using store', { storeRound });
      return storeCurrent;
    }

    if (local) {
      // If localStorage has slim version (pressItems stripped due to quota), restore from memory
      let merged: Competition = (!local.pressItems && storeCurrent?.id === id)
        ? { ...local, pressItems: storeCurrent.pressItems, playerStats: storeCurrent.playerStats }
        : local;
      // Still slim after memory restore (fresh page load) — pull heavy fields from backend,
      // otherwise the next save() would persist the slim version and wipe press/stats server-side.
      const hasPlayed = merged.matches.some((m) => m.status === 'completed');
      const missingPress = !merged.pressItems?.length;
      const missingStats = Object.keys(merged.playerStats ?? {}).length === 0;
      if (hasPlayed && (missingPress || missingStats)) {
        try {
          const pr = makePrBackend(prApiToken);
          const remote = pr
            ? await pr.loadCompetition(id)
            : (token ? await loadCompetition(id, token) : null);
          if (remote) {
            merged = {
              ...merged,
              pressItems: missingPress ? remote.pressItems : merged.pressItems,
              playerStats: missingStats ? (remote.playerStats ?? merged.playerStats) : merged.playerStats,
            };
            lsWrite(merged);
          }
        } catch (e) {
          console.warn('[competition.load] backend refetch for slim local failed:', e);
        }
      }
      // Never regress store to an older round (race: saveLocal may have already advanced it)
      if (storeRound <= merged.currentRound) {
        set({ current: merged, dirty: true });
      }
      return merged;
    }
    const pr = makePrBackend(prApiToken);
    const comp = pr
      ? await pr.loadCompetition(id)
      : await loadCompetition(id, token);
    if (comp) lsWrite(comp);
    set({ current: comp, dirty: false });
    return comp;
  },

  async save(competition, token, prApiToken = null) {
    const pr = makePrBackend(prApiToken);
    if (pr) {
      await pr.saveCompetition(competition);
    } else {
      await saveCompetition(competition, token);
    }
    markSavedAndIndex(set, get, competition);
  },

  // PR_API only: save competition + matches + teams in one request, used by barrage
  // rounds where leg1 → leg2 auto-chains within seconds and used to burst nginx's
  // per-IP rate limit when fired as 3-4 separate requests.
  async roundComplete(competition, matches, teams, prApiToken) {
    const pr = new PrApiCompetitionBackend(prApiToken);
    await pr.roundComplete(competition, matches, teams);
    markSavedAndIndex(set, get, competition);
  },

  async remove(id, token, prApiToken = null) {
    const pr = makePrBackend(prApiToken);
    if (pr) {
      await pr.deleteCompetition(id);
    } else {
      await deleteCompetition(id, token);
      invalidateIndexCache();
    }
    lsDelete(id);
    set({ summaries: get().summaries.filter((c) => c.id !== id) });
    if (get().current?.id === id) set({ current: null, dirty: false });
  },

  setCurrent(c) {
    if (c) {
      const storeCurrent = get().current;
      const existingRound = storeCurrent?.id === c.id ? storeCurrent.currentRound : (lsRead(c.id)?.currentRound ?? 0);
      console.log('[competition.setCurrent]', { newRound: c.currentRound, existingRound, willWrite: existingRound <= c.currentRound });
      if (existingRound <= c.currentRound) {
        lsWrite(c);
        set({ current: c, dirty: true });
      } else {
        // Stale setCurrent (older round) — update metadata only, never regress round/matches
        set({ dirty: true });
      }
    } else {
      set({ current: null, dirty: false });
    }
  },

  saveLocal(competition) {
    lsWrite(competition);
    set({ current: competition, dirty: true });
  },
}));
