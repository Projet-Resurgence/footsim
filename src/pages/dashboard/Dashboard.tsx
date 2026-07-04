import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';

export default function Dashboard() {
  const teams = useTeams((s) => s.teams);
  const loading = useTeams((s) => s.loading);
  const refreshIfStale = useTeams((s) => s.refreshIfStale);
  const { ownerId, prApiToken } = useBackendArgs();

  useEffect(() => {
    if (ownerId) refreshIfStale(ownerId, null, prApiToken);
  }, [ownerId, prApiToken, refreshIfStale]);

  const totalPlayers = teams.reduce((sum, t) => sum + t.playerCount, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 font-display text-3xl sm:text-4xl">Vue d'ensemble</h1>
        <p className="text-muted">Bienvenue dans FootSim.</p>
      </div>

      {(
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card label="Équipes" value={loading ? <Spinner /> : teams.length} />
          <Card
            label="Joueurs"
            value={loading ? <Spinner /> : totalPlayers.toLocaleString('fr-FR')}
          />
          <Card
            label="Action rapide"
            value={
              <Link to="/dashboard/teams/new">
                <Button size="sm">Créer une équipe</Button>
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="mb-2 text-sm text-muted">{label}</div>
      <div className="font-display text-3xl">{value}</div>
    </div>
  );
}
