import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import { useSession } from '@/stores/session';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import type { Player, Team, TeamTactics } from '@/lib/types';
import { loadLocalTactics, saveLocalTactics } from '@/lib/localTactics';

export default function MyTeam() {
  const session = useSession((s) => s.session);
  const teamsStore = useTeams((s) => s.teams);
  const refreshTeams = useTeams((s) => s.refresh);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const { ownerId, pat } = useBackendArgs();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);

  useEffect(() => {
    if (!session || !ownerId) return;

    async function load() {
      try {
        await refreshTeams(ownerId, pat);
        const teams = useTeams.getState().teams;
        console.debug('[MyTeam] teams after refresh:', teams.map(t => ({ slug: t.slug, managerDiscordId: t.managerDiscordId })));
        console.debug('[MyTeam] session.id:', session!.id);
        const mine = teams.find((t) => t.managerDiscordId === session!.id);
        if (!mine) {
          setData(null);
          return;
        }
        const full = await fetchTeam(mine.slug, ownerId, pat);
        if (!full) { toast('error', 'Équipe introuvable.'); return; }

        // Merge local tactics on top
        const localTactics = loadLocalTactics(full.team.id);
        const team: Team = localTactics
          ? { ...full.team, tactics: localTactics }
          : full.team;

        setData({ team, players: full.players });
      } catch (err) {
        toast('error', String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, ownerId]);

  async function saveTactics(tactics: TeamTactics) {
    if (!data) return;
    saveLocalTactics(data.team.id, tactics);
    setData((prev) => prev ? { ...prev, team: { ...prev.team, tactics } } : prev);
    toast('success', 'Tactique enregistrée localement.');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner className="h-6 w-6" />
        <p className="text-muted text-sm">Chargement…</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="font-display text-2xl">Aucune équipe affiliée</div>
        <p className="text-muted text-sm max-w-sm">
          Ton identifiant Discord n'est associé à aucune équipe. Contacte l'administrateur.
        </p>
        <Link to="/" className="text-sm text-accent underline">Retour à l'accueil</Link>
      </main>
    );
  }

  const { team, players } = data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <img src={team.flag} alt="" className="h-16 w-16 object-cover rounded" />
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1">Mon équipe</div>
          <h1 className="font-display text-3xl">{team.name}</h1>
          <p className="text-sm text-muted mt-1">
            Force {team.globalStrength} · {players.length} joueurs
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
        <div>
          <h2 className="font-display text-xl">Tactique</h2>
          <p className="text-xs text-muted mt-0.5">
            Modifie ta formation, ton 11 et ton style. Sauvegarde locale uniquement.
          </p>
        </div>
        <TacticsPanel team={team} players={players} onSave={saveTactics} />
      </div>
    </main>
  );
}
