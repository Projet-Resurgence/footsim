import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import { useSession } from '@/stores/session';
import { GithubTeamBackend } from '@/lib/github/backend';
import { listCompetitions } from '@/lib/github/competitions';
import { POSITIONS, POSITION_LABEL, POSITION_FULL } from '@/lib/types';
import { FORMAT_LABEL } from '@/lib/competition/types';
import type { Player, Team, TeamTactics } from '@/lib/types';
import type { CompetitionSummary } from '@/lib/competition/types';
import { loadLocalTactics, saveLocalTactics } from '@/lib/localTactics';
import { env } from '@/lib/env';

const ghPublic = new GithubTeamBackend(env.githubReadToken ?? null);

const STATUS_LABEL: Record<string, string> = {
  setup: 'Configuration',
  ongoing: 'En cours',
  completed: 'Terminée',
};
const STATUS_COLOR: Record<string, string> = {
  setup: 'text-muted',
  ongoing: 'text-accent',
  completed: 'text-warning',
};

type Tab = 'tactique' | 'joueurs' | 'postes' | 'competitions';

export default function MyTeam() {
  const session = useSession((s) => s.session);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [tab, setTab] = useState<Tab>('tactique');
  const [summaries, setSummaries] = useState<CompetitionSummary[]>([]);
  const [loadingComps, setLoadingComps] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session) return;
    async function load() {
      try {
        const teams = await ghPublic.listTeams(session!.id);
        const mine = teams.find((t) => t.managerDiscordId === session!.id);
        if (!mine) { setData(null); return; }
        const full = await ghPublic.loadTeam(mine.slug, session!.id);
        if (!full) { toast('error', 'Équipe introuvable.'); return; }

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
  }, [session?.id]);

  useEffect(() => {
    if (tab !== 'competitions') return;
    setLoadingComps(true);
    listCompetitions(env.githubReadToken ?? null)
      .then(setSummaries)
      .catch(() => toast('error', 'Impossible de charger les compétitions.'))
      .finally(() => setLoadingComps(false));
  }, [tab]);

  async function saveTactics(tactics: TeamTactics) {
    if (!data) return;
    saveLocalTactics(data.team.id, tactics);
    setData((prev) => prev ? { ...prev, team: { ...prev.team, tactics } } : prev);
    toast('success', 'Tactique enregistrée localement.');
  }

  function exportTactics() {
    if (!data?.team.tactics) { toast('error', 'Aucune tactique à exporter.'); return; }
    const { team, players } = data;
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const lineup = team.tactics!.lineup.map((id) => {
      const p = playerMap.get(id);
      return p ? { id, name: `${p.firstName} ${p.lastName}`, position: p.position, overall: p.overall } : { id };
    });
    const filledSet = new Set(team.tactics!.lineup);
    const bench = players
      .filter((p) => !filledSet.has(p.id))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 12)
      .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position, overall: p.overall }));

    const payload = {
      teamName: team.name,
      formation: team.tactics!.formation,
      style: team.tactics!.style,
      lineup,
      bench,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tactique-${team.slug ?? team.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const tactics: TeamTactics = {
          formation: json.formation,
          style: json.style,
          lineup: json.lineup.map((p: { id: string }) => p.id),
        };
        saveLocalTactics(data.team.id, tactics);
        setData((prev) => prev ? { ...prev, team: { ...prev.team, tactics } } : prev);
        toast('success', 'Tactique importée.');
      } catch {
        toast('error', 'Fichier invalide.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
      {/* Header */}
      <div className="flex items-center gap-4">
        <img src={team.flag} alt="" className="h-16 w-16 object-cover rounded" />
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest text-muted mb-1">Mon équipe</div>
          <h1 className="font-display text-3xl">{team.name}</h1>
          <p className="text-sm text-muted mt-1">Force {team.globalStrength} · {players.length} joueurs</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={exportTactics}>
            ↑ Exporter la tactique
          </Button>
          <Button size="sm" variant="ghost" onClick={() => importRef.current?.click()}>
            ↓ Importer
          </Button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(['tactique', 'joueurs', 'postes', 'competitions'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'tactique' ? 'Tactique' : t === 'joueurs' ? 'Joueurs' : t === 'postes' ? 'Postes' : 'Compétitions'}
          </button>
        ))}
      </div>

      {/* Tactique */}
      {tab === 'tactique' && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <p className="text-xs text-muted">Modifie ta formation, ton 11 et ton style. Sauvegarde locale uniquement.</p>
          <TacticsPanel team={team} players={players} onSave={saveTactics} />
        </div>
      )}

      {/* Joueurs */}
      {tab === 'joueurs' && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-bg text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Poste</th>
                <th className="px-4 py-2 font-medium text-right">Overall</th>
              </tr>
            </thead>
            <tbody>
              {[...players]
                .sort((a, b) => b.overall - a.overall)
                .map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs">{POSITION_LABEL[p.position]}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{p.overall}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Postes */}
      {tab === 'postes' && (
        <div className="space-y-4 max-w-sm">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-bg text-left text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Abrév.</th>
                  <th className="px-4 py-2 font-medium">Poste</th>
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((p) => (
                  <tr key={p} className="border-t border-border">
                    <td className="px-4 py-2">
                      <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs font-medium">
                        {POSITION_LABEL[p]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text/80">{POSITION_FULL[p]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Compétitions */}
      {tab === 'competitions' && (
        <div className="space-y-4">
          {loadingComps ? (
            <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
          ) : summaries.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
              Aucune compétition disponible.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {summaries.map((s) => {
                const clickable = s.status === 'ongoing';
                const inner = (
                  <div className={`rounded-lg border border-border bg-surface p-4 space-y-2 transition-colors ${clickable ? 'hover:border-accent/50 cursor-pointer' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{s.name}</div>
                      <span className={`text-xs ${STATUS_COLOR[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {FORMAT_LABEL[s.format]} · {s.teamCount} équipes
                    </div>
                    {s.winner && (
                      <div className="text-xs text-warning">🏆 Vainqueur enregistré</div>
                    )}
                  </div>
                );
                return clickable
                  ? <Link key={s.id} to={`/competition-view/${s.id}`}>{inner}</Link>
                  : <div key={s.id}>{inner}</div>;
              })}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
