import type { Player, Team } from '@/lib/types';
import type { ITeamBackend } from '@/lib/backend';
import { prapi } from './client';

export class PrApiTeamBackend implements ITeamBackend {
  constructor(private token: string) {}

  async listTeams(_ownerId: string): Promise<Team[]> {
    return prapi.get<Team[]>('/teams', this.token);
  }

  async bulkTeams(slugs?: string[]): Promise<{ team: Team; players: Player[] }[]> {
    const qs = slugs && slugs.length > 0 ? `?slugs=${slugs.join(',')}` : '';
    return prapi.get<{ team: Team; players: Player[] }[]>(`/teams/bulk${qs}`, this.token);
  }

  async loadTeam(slug: string, _ownerId: string): Promise<{ team: Team; players: Player[] } | null> {
    try {
      return prapi.get<{ team: Team; players: Player[] }>(`/teams/${slug}`, this.token);
    } catch {
      return null;
    }
  }

  async saveTeam(team: Team, players: Player[]): Promise<void> {
    let flagUrl = team.flag;
    if (flagUrl && flagUrl.startsWith('data:image/')) {
      const { url } = await prapi.uploadFlag(team.slug, flagUrl, this.token);
      flagUrl = url;
    }
    await prapi.put(`/teams/${team.slug}`, this.token, { team: { ...team, flag: flagUrl }, players });
  }

  async bulkUpdateTeams(items: { slug: string; team: Team; players: Player[] }[]): Promise<void> {
    if (!items.length) return;
    await prapi.post('/teams/bulk-update', this.token, { teams: items });
  }

  async deleteTeam(slug: string, _ownerId: string): Promise<void> {
    await prapi.del(`/teams/${slug}`, this.token);
  }
}
