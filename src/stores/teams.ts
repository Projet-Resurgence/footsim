import { create } from 'zustand';
import type { Player, Team } from '@/lib/types';
import type { ITeamBackend } from '@/lib/backend';
import { GithubTeamBackend } from '@/lib/github/backend';
import { IdbTeamBackend } from '@/lib/idb/store';

const idbBackend = new IdbTeamBackend();

function getBackend(pat: string | null): ITeamBackend {
  if (pat) return new GithubTeamBackend(pat);
  return idbBackend;
}

type State = {
  teams: Team[];
  loading: boolean;
  error: string | null;
  refresh: (ownerId: string, pat: string | null) => Promise<void>;
  saveTeam: (team: Team, players: Player[], pat: string | null) => Promise<void>;
  fetchTeam: (slug: string, ownerId: string, pat: string | null) => Promise<{ team: Team; players: Player[] } | null>;
  removeTeam: (slug: string, ownerId: string, pat: string | null) => Promise<void>;
};

export const useTeams = create<State>((set, get) => ({
  teams: [],
  loading: false,
  error: null,

  async refresh(ownerId, pat) {
    set({ loading: true, error: null });
    try {
      if (pat) {
        // Merge: IDB local (unpublished) + GitHub (published source of truth)
        const [idbTeams, ghTeams] = await Promise.all([
          idbBackend.listTeams(ownerId),
          new GithubTeamBackend(pat).listTeams(ownerId),
        ]);
        const ghSlugs = new Set(ghTeams.map((t) => t.slug));
        // IDB teams not yet on GitHub → keep as unpublished
        const localOnly = idbTeams.filter((t) => !ghSlugs.has(t.slug)).map((t) => ({ ...t, publishedAt: undefined }));
        // GitHub teams are published by definition — inject fallback if field missing in stored JSON
        const published = ghTeams.map((t) => t.publishedAt ? t : { ...t, publishedAt: new Date(0).toISOString() });
        set({ teams: [...published, ...localOnly], loading: false });
      } else {
        const teams = await idbBackend.listTeams(ownerId);
        set({ teams, loading: false });
      }
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  async saveTeam(team, players, pat) {
    const backend = getBackend(pat);
    await backend.saveTeam(team, players);
    const saved = pat ? { ...team, publishedAt: new Date().toISOString() } : team;
    const next = [...get().teams.filter((t) => t.slug !== team.slug), saved];
    set({ teams: next });
  },

  async fetchTeam(slug, ownerId, pat) {
    const backend = getBackend(pat);
    return backend.loadTeam(slug, ownerId);
  },

  async removeTeam(slug, ownerId, pat) {
    const backend = getBackend(pat);
    await backend.deleteTeam(slug, ownerId);
    set({ teams: get().teams.filter((t) => t.slug !== slug) });
  },
}));
