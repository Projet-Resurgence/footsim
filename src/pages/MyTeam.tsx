import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getThemeOverride, setThemeOverride, modeForHour, applyTheme } from '@/lib/theme';
import type { ThemeMode } from '@/lib/theme';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import { TacticsSummary } from '@/components/team/TacticsSummary';
import { useSession } from '@/stores/session';
import { GithubTeamBackend } from '@/lib/github/backend';
import { listCompetitions } from '@/lib/github/competitions';
import { POSITIONS, POSITION_LABEL, POSITION_FULL, CULTURES_BY_CONTINENT, CULTURE_LABEL } from '@/lib/types';
import type { Continent } from '@/lib/types';
import { FORMAT_LABEL } from '@/lib/competition/types';
import type { Player, Team, TeamTactics } from '@/lib/types';
import type { CompetitionSummary } from '@/lib/competition/types';
import type { CultureWeight } from '@/lib/gen/names';
import { loadLocalTactics, saveLocalTactics } from '@/lib/localTactics';
import { env } from '@/lib/env';
import { PlayerView } from '@/components/team/PlayerView';

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

type Tab = 'tactique' | 'joueurs' | 'noms' | 'postes' | 'competitions';

export default function MyTeam() {
  const session = useSession((s) => s.session);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getThemeOverride() ?? modeForHour(new Date().getHours()));

  function toggleTheme() {
    const next: ThemeMode = themeMode === 'day' ? 'night' : 'day';
    setThemeOverride(next);
    applyTheme(next);
    setThemeMode(next);
  }
  const [tab, setTab] = useState<Tab>('tactique');
  const [summaries, setSummaries] = useState<CompetitionSummary[]>([]);
  const [loadingComps, setLoadingComps] = useState(false);
  const [viewingPlayer, setViewingPlayer] = useState<Player | null>(null);
  const [nameWeights, setNameWeights] = useState<CultureWeight[]>([]);
  const [generatingNames, setGeneratingNames] = useState(false);
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
      formationLabel: team.tactics!.formationLabel,
      style: team.tactics!.style,
      customStyles: team.tactics!.customStyles ?? [],
      activeCustomStyleId: team.tactics!.activeCustomStyleId,
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
          lineup: Array.isArray(json.lineup) ? json.lineup.map((p: { id: string } | string) => typeof p === 'string' ? p : p.id) : [],
          formationLabel: json.formationLabel,
          customStyles: json.customStyles ?? [],
          activeCustomStyleId: json.activeCustomStyleId,
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

  async function exportNames() {
    if (!data || nameWeights.length === 0) { toast('error', 'Sélectionne au moins une culture.'); return; }
    setGeneratingNames(true);
    try {
      const { pickNameMixed } = await import('@/lib/gen/names');
      const payload = data.players.map((p) => {
        const { firstName, lastName } = pickNameMixed(nameWeights);
        return { id: p.id, firstName, lastName };
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `noms-${data.team.slug ?? data.team.name.toLowerCase().replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('success', `${payload.length} noms générés.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setGeneratingNames(false);
    }
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
    <>
    <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted hover:text-text">← Retour</Link>
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text/70 hover:bg-border/40 transition-colors"
          title={themeMode === 'day' ? 'Passer en mode nuit' : 'Passer en mode jour'}
        >
          <span>{themeMode === 'day' ? '🌙' : '☀️'}</span>
          <span className="text-xs">{themeMode === 'day' ? 'Nuit' : 'Jour'}</span>
        </button>
      </div>
      <div className="flex items-center gap-4">
        <img src={team.flag} alt="" className="h-16 w-16 object-cover rounded" />
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest text-muted mb-1">Mon équipe</div>
          <h1 className="font-display text-3xl">{team.name}</h1>
          <p className="text-sm text-muted mt-1">Force {team.globalStrength} · {players.length} joueurs</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={exportTactics}>
            ↓ Exporter la tactique
          </Button>
          <Button size="sm" variant="ghost" onClick={() => importRef.current?.click()}>
            ↑ Importer
          </Button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(['tactique', 'joueurs', 'noms', 'postes', 'competitions'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'tactique' ? 'Tactique' : t === 'joueurs' ? 'Joueurs' : t === 'noms' ? 'Noms' : t === 'postes' ? 'Postes' : 'Compétitions'}
          </button>
        ))}
      </div>

      {/* Tactique */}
      {tab === 'tactique' && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <p className="text-xs text-muted">Modifie ta formation, ton 11 et ton style. Sauvegarde locale uniquement.</p>
          {team.tactics && (
            <TacticsSummary tactics={team.tactics} players={players} />
          )}
          <TacticsPanel key={`${team.id}-${team.tactics?.formation ?? ''}-${team.tactics?.lineup?.join(',') ?? ''}`} team={team} players={players} onSave={saveTactics} />
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
                  <tr
                    key={p.id}
                    className="border-t border-border cursor-pointer hover:bg-accent/10 hover:text-accent transition-colors"
                    onClick={() => setViewingPlayer(p)}
                  >
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

      {/* Noms */}
      {tab === 'noms' && (
        <NomExportPanel
          weights={nameWeights}
          onChange={setNameWeights}
          onExport={exportNames}
          busy={generatingNames}
          playerCount={data.players.length}
        />
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
                const clickable = s.status === 'ongoing' || s.status === 'completed';
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

    {viewingPlayer && (
      <PlayerView player={viewingPlayer} onClose={() => setViewingPlayer(null)} />
    )}
    </>
  );
}

function NomExportPanel({
  weights, onChange, onExport, busy, playerCount,
}: {
  weights: CultureWeight[];
  onChange: (w: CultureWeight[]) => void;
  onExport: () => void;
  busy: boolean;
  playerCount: number;
}) {
  const selected = weights.map((w) => w.culture);
  const total = weights.reduce((s, c) => s + c.weight, 0);

  function toggleCulture(culture: CultureWeight['culture']) {
    if (selected.includes(culture)) {
      if (weights.length === 1) return;
      onChange(weights.filter((w) => w.culture !== culture));
    } else {
      const n = weights.length + 1;
      const eq = Math.round(100 / n);
      onChange([...weights.map((w) => ({ ...w, weight: eq })), { culture, weight: 100 - eq * (n - 1) }]);
    }
  }

  function setWeight(culture: CultureWeight['culture'], value: number) {
    const clamped = Math.max(1, Math.min(100, value));
    const others = weights.filter((w) => w.culture !== culture);
    const remaining = Math.max(0, 100 - clamped);
    const otherTotal = others.reduce((s, w) => s + w.weight, 0);
    onChange(weights.map((w) => {
      if (w.culture === culture) return { ...w, weight: clamped };
      const share = otherTotal > 0 ? Math.round((w.weight / otherTotal) * remaining) : Math.round(remaining / others.length);
      return { ...w, weight: Math.max(1, share) };
    }));
  }

  function distribute() {
    if (weights.length === 0) return;
    const equal = Math.round(100 / weights.length);
    onChange(weights.map((w, i) => ({ ...w, weight: i === weights.length - 1 ? 100 - equal * (weights.length - 1) : equal })));
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-display text-xl mb-1">Générer des noms</h2>
        <p className="text-sm text-muted">
          Choisis une ou plusieurs cultures, définis leurs proportions, puis télécharge un fichier JSON à transmettre à l'administrateur.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted">Cultures ({weights.length})</span>
          {weights.length > 1 && (
            <button onClick={distribute} className="text-xs text-accent hover:text-accent/70 transition-colors">
              Répartir également
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
          {(Object.keys(CULTURES_BY_CONTINENT) as Continent[]).map((continent) => (
            <div key={continent}>
              <div className="mb-1 px-1 text-xs uppercase tracking-widest text-muted">{continent}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CULTURES_BY_CONTINENT[continent].map((c) => {
                  const active = selected.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleCulture(c)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${active ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-border/70'}`}
                    >
                      {CULTURE_LABEL[c]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {weights.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <div className="text-xs uppercase tracking-widest text-muted">Proportions</div>
          {weights.map((cw) => {
            const pct = total > 0 ? Math.round((cw.weight / total) * 100) : 0;
            return (
              <div key={cw.culture} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{CULTURE_LABEL[cw.culture]}</span>
                  <span className="font-medium tabular-nums text-accent">{pct}%</span>
                </div>
                <input
                  type="range" min={1} max={100} value={cw.weight}
                  onChange={(e) => setWeight(cw.culture, Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onExport}
        disabled={busy || weights.length === 0 || playerCount === 0}
        className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-opacity"
      >
        {busy ? 'Génération…' : `↓ Télécharger JSON (${playerCount} joueurs)`}
      </button>
    </div>
  );
}
