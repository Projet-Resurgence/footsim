import type { Player, Team } from '@/lib/types';
import type { ITeamBackend } from '@/lib/backend';
import { saveTeamWithRoster, loadTeam, deleteTeam, listTeams } from './store';

export class GithubTeamBackend implements ITeamBackend {
  constructor(private token: string | null) {}

  listTeams(_ownerId: string): Promise<Team[]> {
    return listTeams(this.token);
  }

  loadTeam(slug: string, _ownerId: string): Promise<{ team: Team; players: Player[] } | null> {
    return loadTeam(slug, this.token);
  }

  saveTeam(team: Team, players: Player[]): Promise<void> {
    if (!this.token) return Promise.reject(new Error('PAT requis pour sauvegarder.'));
    return saveTeamWithRoster({ ...team, publishedAt: new Date().toISOString() }, players, this.token);
  }

  deleteTeam(slug: string, _ownerId: string): Promise<void> {
    if (!this.token) return Promise.reject(new Error('PAT requis pour supprimer.'));
    return deleteTeam(slug, this.token);
  }
}
