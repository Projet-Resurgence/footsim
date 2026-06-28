import type { Competition, CompetitionSummary } from '@/lib/competition/types';
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

  async deleteCompetition(id: string): Promise<void> {
    await prapi.del(`/competitions/${id}`, this.token);
  }
}
