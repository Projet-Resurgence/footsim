import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { SkeletonTeamCard } from '@/components/ui/Skeleton';
import { TeamCard } from '@/components/team/TeamCard';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';

export default function Teams() {
  const teams = useTeams((s) => s.teams);
  const loading = useTeams((s) => s.loading);
  const error = useTeams((s) => s.error);
  const refresh = useTeams((s) => s.refresh);
  const { ownerId, prApiToken } = useBackendArgs();

  useEffect(() => {
    if (ownerId) refresh(ownerId, null, prApiToken);
  }, [ownerId, prApiToken, refresh]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Équipes</h1>
        <Link to="/dashboard/teams/new">
          <Button>+ Nouvelle équipe</Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonTeamCard key={i} />)}
        </div>
      ) : error ? (
        <p className="text-danger">{error}</p>
      ) : teams.length === 0 ? (
        <p className="text-muted">Aucune équipe pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <TeamCard key={t.slug} team={t} />
          ))}
        </div>
      )}
    </div>
  );
}
