import { create } from 'zustand';
import type { League, Player } from '@/lib/types';
import type { ILeagueBackend } from '@/lib/leagueBackend';
import { GithubLeagueBackend } from '@/lib/github/leagues';
import { IdbLeagueBackend } from '@/lib/idb/leagues';
import { PrApiLeagueBackend } from '@/lib/prapi/leagueBackend';

const idbBackend = new IdbLeagueBackend();

function getBackend(pat: string | null, prApiToken: string | null = null): ILeagueBackend {
  if (prApiToken) return new PrApiLeagueBackend(prApiToken);
  if (pat) return new GithubLeagueBackend(pat);
  return idbBackend;
}

type State = {
  leagues: League[];
  loading: boolean;
  error: string | null;

  fetchLeagues: (nationSlug: string, pat: string | null, prApiToken?: string | null) => Promise<void>;
  loadLeague: (id: string, pat: string | null, prApiToken?: string | null) => Promise<League | null>;
  saveLeague: (league: League, pat: string | null, prApiToken?: string | null) => Promise<void>;
  removeLeague: (id: string, nationSlug: string, pat: string | null, prApiToken?: string | null) => Promise<void>;
};

export const useLeagues = create<State>((set, get) => ({
  leagues: [],
  loading: false,
  error: null,

  async fetchLeagues(nationSlug, pat, prApiToken = null) {
    set({ loading: true, error: null });
    try {
      const leagues = await getBackend(pat, prApiToken).listLeagues(nationSlug);
      set({ leagues, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  async loadLeague(id, pat, prApiToken = null) {
    return getBackend(pat, prApiToken).loadLeague(id);
  },

  async saveLeague(league, pat, prApiToken = null) {
    await getBackend(pat, prApiToken).saveLeague(league);
    const next = [...get().leagues.filter((l) => l.id !== league.id), league];
    set({ leagues: next });
  },

  async removeLeague(id, nationSlug, pat, prApiToken = null) {
    await getBackend(pat, prApiToken).deleteLeague(id, nationSlug);
    set({ leagues: get().leagues.filter((l) => l.id !== id) });
  },
}));

/** Auto-assign up to 30 unassigned players from roster to a new club */
export function assignPlayersToClub(
  allPlayers: Player[],
  existingClubIds: string[],
  count = 30,
): { assigned: Player[]; updatedRoster: Player[] } {
  const taken = new Set(existingClubIds);
  const unassigned = allPlayers
    .filter((p) => !p.clubId || !taken.has(p.clubId))
    .sort((a, b) => b.overall - a.overall);

  // pick top `count` unassigned players, with some randomness to distribute talent
  const pool = unassigned.slice(0, Math.min(count * 3, unassigned.length));
  // shuffle pool then take count
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const assigned = pool.slice(0, count);
  return { assigned, updatedRoster: allPlayers };
}
