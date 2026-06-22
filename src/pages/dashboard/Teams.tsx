import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SkeletonTeamCard } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { TeamCard } from '@/components/team/TeamCard';
import { useTeams } from '@/stores/teams';
import { useSession } from '@/stores/session';
import { useBackendArgs } from '@/hooks/useBackendArgs';

export default function Teams() {
  const teams = useTeams((s) => s.teams);
  const loading = useTeams((s) => s.loading);
  const error = useTeams((s) => s.error);
  const refresh = useTeams((s) => s.refresh);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const saveTeam = useTeams((s) => s.saveTeam);
  const isAdmin = useSession((s) => s.isAdmin());
  const { ownerId, pat: effectivePat } = useBackendArgs();

  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (ownerId) refresh(ownerId, effectivePat);
  }, [ownerId, effectivePat, refresh]);

  const unpublished = effectivePat ? teams.filter((t) => !t.publishedAt) : [];

  async function publishAll() {
    if (!effectivePat || unpublished.length === 0) return;
    setPublishing(true);
    let ok = 0;
    try {
      for (const team of unpublished) {
        const res = await fetchTeam(team.slug, ownerId, null); // fetch from IDB
        if (!res) continue;
        await saveTeam(res.team, res.players, effectivePat);
        ok++;
      }
      toast('success', `${ok} équipe(s) publiée(s) sur GitHub.`);
      await refresh(ownerId, effectivePat);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Équipes</h1>
        <Link to="/dashboard/teams/new">
          <Button>+ Nouvelle équipe</Button>
        </Link>
      </div>

      {unpublished.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
          <span className="text-sm text-warning">
            {unpublished.length} équipe{unpublished.length > 1 ? 's' : ''} non publiée{unpublished.length > 1 ? 's' : ''} sur GitHub.
          </span>
          <Button size="sm" onClick={publishAll} disabled={publishing}>
            {publishing ? <Spinner className="mr-1 h-3 w-3" /> : null}
            Publier tout
          </Button>
        </div>
      )}

      {isAdmin && !effectivePat ? (
        <p className="text-muted">
          Configure ton token GitHub dans{' '}
          <Link to="/dashboard/settings" className="text-accent underline">
            Réglages
          </Link>{' '}
          pour charger les équipes.
        </p>
      ) : loading ? (
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
