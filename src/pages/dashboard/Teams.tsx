import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { TeamCard } from '@/components/team/TeamCard';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';

export default function Teams() {
  const teams = useTeams((s) => s.teams);
  const loading = useTeams((s) => s.loading);
  const error = useTeams((s) => s.error);
  const refresh = useTeams((s) => s.refresh);
  const pat = useCredentials((s) => s.githubPat);

  useEffect(() => {
    if (pat) refresh(pat);
  }, [pat, refresh]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Équipes</h1>
        <Link to="/dashboard/teams/new">
          <Button>+ Nouvelle équipe</Button>
        </Link>
      </div>

      {!pat ? (
        <p className="text-muted">
          Configure ton token GitHub dans{' '}
          <Link to="/dashboard/settings" className="text-accent underline">
            Réglages
          </Link>{' '}
          pour charger les équipes.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-muted">
          <Spinner /> Chargement…
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
