import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { RosterTable } from '@/components/team/RosterTable';
import { PlayerEdit } from '@/components/team/PlayerEdit';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import type { Player, Team, TeamTactics } from '@/lib/types';
import { CULTURE_LABEL } from '@/lib/types';
import { useCredentials } from '@/stores/credentials';
import { useTeams } from '@/stores/teams';

const ADD_COUNTS = [100, 200, 500, 1000];

export default function TeamDetail() {
  const { slug = '' } = useParams();
  const pat = useCredentials((s) => s.githubPat);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const saveTeam = useTeams((s) => s.saveTeam);
  const removeTeam = useTeams((s) => s.removeTeam);
  const navigate = useNavigate();

  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteCount, setDeleteCount] = useState(1);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'roster' | 'tactique'>('roster');

  useEffect(() => {
    if (!pat) return;
    setLoading(true);
    fetchTeam(slug, pat)
      .then((res) => {
        if (!res) toast('error', 'Équipe introuvable.');
        setData(res);
      })
      .catch((err) => toast('error', String(err)))
      .finally(() => setLoading(false));
  }, [slug, pat, fetchTeam]);

  async function addPlayers(extra: number) {
    if (!data || !pat) return;
    setAdding(true);
    try {
      const { generatePlayers } = await import('@/lib/gen/players');
      const newPlayers = generatePlayers({
        count: extra,
        culture: data.team.culture,
        globalStrength: data.team.globalStrength,
      });
      const merged = [...data.players, ...newPlayers];
      const team = { ...data.team, playerCount: merged.length };
      await saveTeam(team, merged, pat);
      setData({ team, players: merged });
      toast('success', `+${extra} joueurs.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setAdding(false);
    }
  }

  async function deleteWeakest(n: number) {
    if (!data || !pat || n <= 0) return;
    const sorted = [...data.players].sort((a, b) => a.overall - b.overall);
    const toRemove = new Set(sorted.slice(0, Math.min(n, sorted.length)).map((p) => p.id));
    const merged = data.players.filter((p) => !toRemove.has(p.id));
    const team = { ...data.team, playerCount: merged.length };
    try {
      await saveTeam(team, merged, pat);
      setData({ team, players: merged });
      toast('success', `${toRemove.size} joueur(s) supprimé(s).`);
    } catch (err) {
      toast('error', String(err));
    }
  }

  async function savePlayer(next: Player) {
    if (!data || !pat) return;
    const merged = data.players.map((p) => (p.id === next.id ? next : p));
    try {
      await saveTeam(data.team, merged, pat);
      setData({ team: data.team, players: merged });
      setEditingId(null);
      toast('success', 'Joueur mis à jour.');
    } catch (err) {
      toast('error', String(err));
    }
  }

  async function deletePlayer(id: string) {
    if (!data || !pat) return;
    const merged = data.players.filter((p) => p.id !== id);
    const team = { ...data.team, playerCount: merged.length };
    try {
      await saveTeam(team, merged, pat);
      setData({ team, players: merged });
      setEditingId(null);
      toast('success', 'Joueur supprimé.');
    } catch (err) {
      toast('error', String(err));
    }
  }

  async function saveTactics(tactics: TeamTactics) {
    if (!data || !pat) return;
    const team = { ...data.team, tactics };
    try {
      await saveTeam(team, data.players, pat);
      setData({ team, players: data.players });
      toast('success', 'Tactique sauvegardée.');
    } catch (err) {
      toast('error', String(err));
    }
  }

  async function deleteTeamHandler() {
    if (!data || !pat) return;
    setDeleting(true);
    try {
      await removeTeam(data.team.slug, pat);
      toast('success', 'Équipe supprimée.');
      navigate('/dashboard/teams');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Spinner /> Chargement…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <p className="text-danger">Équipe introuvable.</p>
        <Button variant="ghost" onClick={() => navigate('/dashboard/teams')}>
          Retour
        </Button>
      </div>
    );
  }

  const { team, players } = data;
  const editing = editingId ? players.find((p) => p.id === editingId) ?? null : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-6">
        <img
          src={team.flag}
          alt=""
          className="h-24 w-24 object-cover"
        />
        <div className="space-y-1 flex-1">
          <h1 className="font-display text-4xl">{team.name}</h1>
          <p className="text-sm text-muted">
            {CULTURE_LABEL[team.culture]} · Force {team.globalStrength} ·{' '}
            {team.playerCount} joueurs · Formation {team.formation}
          </p>
        </div>
        <div>
          {confirmingDelete ? (
            <div className="flex gap-2">
              <Button variant="danger" onClick={deleteTeamHandler} disabled={deleting}>
                {deleting ? <Spinner className="mr-2" /> : null}
                Confirmer suppression
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
              Supprimer l’équipe
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(['roster', 'tactique'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'roster' ? 'Roster' : 'Tactique'}
          </button>
        ))}
      </div>

      {tab === 'roster' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl">Roster</h2>
            <div className="flex flex-wrap items-center gap-2">
              {ADD_COUNTS.map((n) => (
                <Button key={n} variant="ghost" size="sm" onClick={() => addPlayers(n)} disabled={adding}>
                  + {n}
                </Button>
              ))}
              {adding ? <Spinner /> : null}
              <div className="flex items-center gap-1 border-l border-border pl-2">
                <input
                  type="number"
                  min={1}
                  max={players.length}
                  value={deleteCount}
                  onChange={(e) => setDeleteCount(Math.max(1, Number(e.target.value)))}
                  className="h-8 w-16 rounded border border-border bg-surface px-2 text-sm"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteWeakest(deleteCount)}
                  disabled={adding || players.length === 0}
                >
                  Supprimer les plus faibles
                </Button>
              </div>
            </div>
          </div>
          <RosterTable players={players} onSelect={setEditingId} />
        </section>
      )}

      {tab === 'tactique' && (
        <section className="space-y-4">
          <h2 className="font-display text-xl">Tactique</h2>
          <TacticsPanel team={team} players={players} onSave={saveTactics} />
        </section>
      )}

      <AnimatePresence>
        {editing ? (
          <PlayerEdit
            key={editing.id}
            player={editing}
            onClose={() => setEditingId(null)}
            onSave={savePlayer}
            onDelete={() => deletePlayer(editing.id)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
