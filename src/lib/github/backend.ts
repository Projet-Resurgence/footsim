import type { Player, Team } from '@/lib/types';
import type { ITeamBackend } from '@/lib/backend';
import { saveTeamWithRoster, loadTeam, deleteTeam, listTeams } from './store';

export class GithubTeamBackend implements ITeamBackend {
  constructor(private token: string) {}

  listTeams(_ownerId: string): Promise<Team[]> {
    return listTeams(this.token);
  }

  loadTeam(slug: string, _ownerId: string): Promise<{ team: Team; players: Player[] } | null> {
    return loadTeam(slug, this.token);
  }

  saveTeam(team: Team, players: Player[]): Promise<void> {
    return saveTeamWithRoster({ ...team, publishedAt: new Date().toISOString() }, players, this.token);
  }

  deleteTeam(slug: string, _ownerId: string): Promise<void> {
    return deleteTeam(slug, this.token);
  }
}
