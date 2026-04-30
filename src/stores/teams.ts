import { create } from 'zustand';
import type { Player, Team } from '@/lib/types';
import { listTeams, loadTeam, saveTeamWithRoster, deleteTeam } from '@/lib/github/store';

type State = {
  teams: Team[];
  loading: boolean;
  error: string | null;
  refresh: (token: string) => Promise<void>;
  saveTeam: (team: Team, players: Player[], token: string) => Promise<void>;
  fetchTeam: (slug: string, token: string) => Promise<{ team: Team; players: Player[] } | null>;
  removeTeam: (slug: string, token: string) => Promise<void>;
};

export const useTeams = create<State>((set, get) => ({
  teams: [],
  loading: false,
  error: null,
  async refresh(token) {
    set({ loading: true, error: null });
    try {
      const teams = await listTeams(token);
      set({ teams, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },
  async saveTeam(team, players, token) {
    await saveTeamWithRoster(team, players, token);
    const next = [...get().teams.filter((t) => t.slug !== team.slug), team];
    set({ teams: next });
  },
  async fetchTeam(slug, token) {
    return loadTeam(slug, token);
  },
  async removeTeam(slug, token) {
    await deleteTeam(slug, token);
    set({ teams: get().teams.filter((t) => t.slug !== slug) });
  },
}));
