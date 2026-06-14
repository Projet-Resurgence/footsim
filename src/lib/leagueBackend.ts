import type { League } from '@/lib/types';

export interface ILeagueBackend {
  listLeagues(nationSlug: string): Promise<League[]>;
  loadLeague(id: string): Promise<League | null>;
  saveLeague(league: League): Promise<void>;
  deleteLeague(id: string, nationSlug: string): Promise<void>;
}
