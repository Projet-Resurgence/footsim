import type { League } from '@/lib/types';
import type { ILeagueBackend } from '@/lib/leagueBackend';
import { prapi } from './client';

export class PrApiLeagueBackend implements ILeagueBackend {
  constructor(private token: string) {}

  async listLeagues(nationSlug: string): Promise<League[]> {
    return prapi.get<League[]>(`/leagues/${nationSlug}`, this.token);
  }

  async loadLeague(id: string): Promise<League | null> {
    try {
      return prapi.get<League>(`/leagues/${id}`, this.token);
    } catch {
      return null;
    }
  }

  async saveLeague(league: League): Promise<void> {
    await prapi.put(`/leagues/${league.id}`, this.token, { league });
  }

  async deleteLeague(id: string, _nationSlug: string): Promise<void> {
    await prapi.del(`/leagues/${id}`, this.token);
  }
}
