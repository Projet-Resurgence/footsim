import type { MatchInput, MatchState } from '@/lib/sim/types';
import type { Team, Player } from '@/lib/types';
import { prapi } from './client';

export type StoredMatch = {
  id: string;
  input: MatchInput;
  state: MatchState;
  home: { team: Team; players: Player[] };
  away: { team: Team; players: Player[] };
  playedAt: string;
};

export class PrApiMatchBackend {
  constructor(private token: string) {}

  async saveMatch(match: StoredMatch): Promise<void> {
    await prapi.post('/matches', this.token, { match });
  }

  async loadMatch(id: string): Promise<StoredMatch | null> {
    try {
      return prapi.get<StoredMatch>(`/matches/${id}`, this.token);
    } catch {
      return null;
    }
  }
}
