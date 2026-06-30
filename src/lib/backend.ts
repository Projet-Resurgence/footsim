import type { Player, Team } from '@/lib/types';

export interface ITeamBackend {
  listTeams(ownerId: string): Promise<Team[]>;
  loadTeam(slug: string, ownerId: string): Promise<{ team: Team; players: Player[] } | null>;
  saveTeam(team: Team, players: Player[]): Promise<Team>;
  deleteTeam(slug: string, ownerId: string): Promise<void>;
}
