import { create } from 'zustand';
import type { Player, Team } from '@/lib/types';
import type { ITeamBackend } from '@/lib/backend';
import { GithubTeamBackend } from '@/lib/github/backend';
import { IdbTeamBackend } from '@/lib/idb/store';
import { PrApiTeamBackend } from '@/lib/prapi/teamBackend';

const idbBackend = new IdbTeamBackend();

function getBackend(prApiToken: string | null, pat: string | null): ITeamBackend {
  if (prApiToken) return new PrApiTeamBackend(prApiToken);
  if (pat) return new GithubTeamBackend(pat);
  return idbBackend;
}

type State = {
  teams: Team[];
  loading: boolean;
  error: string | null;
  refresh: (ownerId: string, pat: string | null, prApiToken?: string | null) => Promise<void>;
  saveTeam: (team: Team, players: Player[], pat: string | null, prApiToken?: string | null) => Promise<void>;
  fetchTeam: (slug: string, ownerId: string, pat: string | null, prApiToken?: string | null) => Promise<{ team: Team; players: Player[] } | null>;
  removeTeam: (slug: string, ownerId: string, pat: string | null, prApiToken?: string | null) => Promise<void>;
};

export const useTeams = create<State>((set, get) => ({
  teams: [],
  loading: false,
  error: null,

  async refresh(ownerId, pat, prApiToken = null) {
    set({ loading: true, error: null });
    try {
      if (prApiToken) {
        const teams = await new PrApiTeamBackend(prApiToken).listTeams(ownerId);
        set({ teams, loading: false });
      } else if (pat) {
        // Merge: IDB local (unpublished) + GitHub (published source of truth)
        const [idbTeams, ghTeams] = await Promise.all([
          idbBackend.listTeams(ownerId),
          new GithubTeamBackend(pat).listTeams(ownerId),
        ]);
        const ghSlugs = new Set(ghTeams.map((t) => t.slug));
        const idbBySlug = new Map(idbTeams.map((t) => [t.slug, t]));
        const localOnly = idbTeams.filter((t) => !ghSlugs.has(t.slug)).map((t) => ({ ...t, publishedAt: undefined }));
        const published = ghTeams.map((t) => {
          const local = idbBySlug.get(t.slug);
          const base = t.publishedAt ? t : { ...t, publishedAt: new Date(0).toISOString() };
          if (!local) return base;
          return {
            ...base,
            managerDiscordId: local.managerDiscordId ?? base.managerDiscordId,
            tactics: local.tactics ?? base.tactics,
          };
        });
        set({ teams: [...published, ...localOnly], loading: false });
      } else {
        const teams = await idbBackend.listTeams(ownerId);
        set({ teams, loading: false });
      }
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  async saveTeam(team, players, pat, prApiToken = null) {
    const backend = getBackend(prApiToken, pat);
    await backend.saveTeam(team, players);
    const saved = (prApiToken || pat)
      ? { ...team, publishedAt: new Date().toISOString() }
      : { ...team, publishedAt: undefined };
    const next = [...get().teams.filter((t) => t.slug !== team.slug), saved];
    set({ teams: next });
  },

  async fetchTeam(slug, ownerId, pat, prApiToken = null) {
    return getBackend(prApiToken, pat).loadTeam(slug, ownerId);
  },

  async removeTeam(slug, ownerId, pat, prApiToken = null) {
    await getBackend(prApiToken, pat).deleteTeam(slug, ownerId);
    set({ teams: get().teams.filter((t) => t.slug !== slug) });
  },
}));
