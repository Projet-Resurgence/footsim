import type { Competition, CompetitionSummary } from '@/lib/competition/types';
import type { StoredMatch } from './matchBackend';
import type { Player, Team } from '@/lib/types';
import { prapi } from './client';

export class PrApiCompetitionBackend {
  constructor(private token: string) {}

  async listCompetitions(): Promise<CompetitionSummary[]> {
    return prapi.get<CompetitionSummary[]>('/competitions', this.token);
  }

  async loadCompetition(id: string): Promise<Competition | null> {
    try {
      return prapi.get<Competition>(`/competitions/${id}`, this.token);
    } catch {
      return null;
    }
  }

  async saveCompetition(competition: Competition): Promise<void> {
    await prapi.put(`/competitions/${competition.id}`, this.token, { competition });
  }

  /**
   * Save competition + matches + teams in one request/transaction. Replaces the
   * save-competition + bulk-save-matches + bulk-update-teams sequence so LPM barrage
   * rounds (leg1 → leg2 auto-chain within seconds) don't burst nginx's per-IP rate limit.
   */
  async roundComplete(
    competition: Competition,
    matches: StoredMatch[],
    teams: { slug: string; team: Team; players: Player[] }[],
  ): Promise<{ competitionId: string; matchesSaved: number; teamsUpdated: number }> {
    return prapi.post(`/competitions/${competition.id}/round-complete`, this.token, {
      competition,
      matches,
      teams,
    });
  }

  async deleteCompetition(id: string): Promise<void> {
    await prapi.del(`/competitions/${id}`, this.token);
  }
}
