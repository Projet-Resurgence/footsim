import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getThemeOverride, setThemeOverride, modeForHour, applyTheme } from '@/lib/theme';
import type { ThemeMode } from '@/lib/theme';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import { StartingXI } from '@/components/team/StartingXI';
import { TacticsSummary } from '@/components/team/TacticsSummary';
import { useSession } from '@/stores/session';
import { GithubTeamBackend } from '@/lib/github/backend';
import { listCompetitions } from '@/lib/github/competitions';
import { POSITIONS, POSITION_LABEL, POSITION_FULL, CULTURES_BY_CONTINENT, CULTURE_LABEL } from '@/lib/types';
import { listTeams, loadTeam } from '@/lib/github/store';
import type { Continent } from '@/lib/types';
import { FORMAT_LABEL } from '@/lib/competition/types';
import type { Player, SavedTactic, Team, TeamTactics } from '@/lib/types';
import type { CompetitionSummary } from '@/lib/competition/types';
import type { CultureWeight } from '@/lib/gen/names';
import { loadLocalTactics, loadLocalSavedTactics, saveLocalSavedTactics } from '@/lib/localTactics';
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

type Tab = 'tactique' | 'joueurs' | 'noms' | 'postes' | 'competitions' | 'top' | 'simulation' | 'presse';

export default function MyTeam() {
  const session = useSession((s) => s.session);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [savedTactics, setSavedTactics] = useState<SavedTactic[]>([]);
  const [activeTacticId, setActiveTacticId] = useState<string | undefined>();
  const [editingTacticId, setEditingTacticId] = useState<string | null>(null); // null = new
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
  const [topPlayers, setTopPlayers] = useState<{ player: Player; team: Team }[]>([]);
  const [loadingTop, setLoadingTop] = useState(false);
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

        // merge local saved tactics with GitHub data
        const local = loadLocalSavedTactics(full.team.id);
        const merged = local.savedTactics.length > 0
          ? local.savedTactics
          : (full.team.savedTactics ?? []);
        // compat: if no savedTactics but legacy tactics exist, seed from it
        if (merged.length === 0) {
          const leg = loadLocalTactics(full.team.id) ?? full.team.tactics;
          if (leg) {
            const seeded: SavedTactic = { ...leg, id: crypto.randomUUID(), name: 'Tactique de base' };
            setSavedTactics([seeded]);
            setActiveTacticId(seeded.id);
            saveLocalSavedTactics(full.team.id, [seeded], seeded.id);
          }
        } else {
          setSavedTactics(merged);
          setActiveTacticId(local.activeTacticId ?? full.team.activeTacticId);
        }
        setData({ team: full.team, players: full.players });
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

  useEffect(() => {
    if (tab !== 'top' || topPlayers.length > 0) return;
    setLoadingTop(true);
    async function loadTop() {
      try {
        const teams = await listTeams(env.githubReadToken ?? null);
        const all: { player: Player; team: Team }[] = [];
        await Promise.all(
          teams.map(async (team) => {
            const d = await loadTeam(team.slug, env.githubReadToken ?? null);
            if (!d) return;
            for (const p of d.players) all.push({ player: p, team });
          }),
        );
        all.sort((a, b) => b.player.overall - a.player.overall);
        setTopPlayers(all);
      } catch {
        toast('error', 'Impossible de charger les joueurs.');
      } finally {
        setLoadingTop(false);
      }
    }
    loadTop();
  }, [tab]);

  function persistSavedTactics(next: SavedTactic[], activeId?: string) {
    if (!data) return;
    setSavedTactics(next);
    setActiveTacticId(activeId);
    saveLocalSavedTactics(data.team.id, next, activeId);
  }

  async function saveTactics(tactics: TeamTactics) {
    if (!data) return;
    // if editing existing tactic, update it; else create new
    const editId = editingTacticId;
    if (editId) {
      // update existing
      const next = savedTactics.map((t) => t.id === editId ? { ...t, ...tactics } : t);
      persistSavedTactics(next, activeTacticId);
      setEditingTacticId(null);
      toast('success', 'Tactique mise à jour.');
    } else {
      // new tactic — prompt name via auto-name
      const name = `Tactique ${savedTactics.length + 1}`;
      const newT: SavedTactic = { ...tactics, id: crypto.randomUUID(), name };
      const next = [...savedTactics, newT];
      persistSavedTactics(next, newT.id);
      setEditingTacticId(null);
      toast('success', `"${name}" sauvegardée et activée.`);
    }
  }

  function activateTactic(id: string) {
    persistSavedTactics(savedTactics, id);
  }

  function deleteTactic(id: string) {
    const next = savedTactics.filter((t) => t.id !== id);
    const newActive = activeTacticId === id ? (next[0]?.id ?? undefined) : activeTacticId;
    persistSavedTactics(next, newActive);
  }

  function renameTactic(id: string, name: string) {
    const next = savedTactics.map((t) => t.id === id ? { ...t, name } : t);
    persistSavedTactics(next, activeTacticId);
  }

  function exportTactics() {
    if (!data) return;
    const { team } = data;
    const payload = {
      teamName: team.name,
      savedTactics,
      activeTacticId,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tactiques-${team.slug ?? team.name.toLowerCase().replace(/\s+/g, '-')}.json`;
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
        // new format: savedTactics array
        if (Array.isArray(json.savedTactics)) {
          const imported: SavedTactic[] = json.savedTactics.map((t: SavedTactic) => ({
            ...t,
            id: t.id ?? crypto.randomUUID(),
            name: t.name ?? 'Importée',
            lineup: Array.isArray(t.lineup) ? t.lineup.map((p: { id: string } | string) => typeof p === 'string' ? p : p.id) : [],
          }));
          // merge: add imported if id not already present
          const existing = new Set(savedTactics.map((t) => t.id));
          const toAdd = imported.filter((t) => !existing.has(t.id));
          const next = [...savedTactics, ...toAdd];
          persistSavedTactics(next, activeTacticId);
          toast('success', `${toAdd.length} tactique(s) importée(s).`);
        } else {
          // legacy single-tactic format
          const tactics: TeamTactics = {
            formation: json.formation,
            style: json.style,
            lineup: Array.isArray(json.lineup) ? json.lineup.map((p: { id: string } | string) => typeof p === 'string' ? p : p.id) : [],
            formationLabel: json.formationLabel,
            customStyles: json.customStyles ?? [],
            activeCustomStyleId: json.activeCustomStyleId,
          };
          const newT: SavedTactic = { ...tactics, id: crypto.randomUUID(), name: json.tacticName ?? `Importée ${savedTactics.length + 1}` };
          const next = [...savedTactics, newT];
          persistSavedTactics(next, activeTacticId);
          toast('success', `"${newT.name}" ajoutée.`);
        }
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
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {(['tactique', 'joueurs', 'noms', 'postes', 'competitions', 'top', 'simulation', 'presse'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'tactique' ? 'Tactique'
              : t === 'joueurs' ? 'Joueurs'
              : t === 'noms' ? 'Noms'
              : t === 'postes' ? 'Postes'
              : t === 'competitions' ? 'Compétitions'
              : t === 'top' ? 'Meilleurs joueurs'
              : t === 'simulation' ? 'Simulation'
              : 'Presse'}
          </button>
        ))}
      </div>

      {/* Tactique */}
      {tab === 'tactique' && (
        <div className="rounded-lg border border-border bg-surface p-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Tactiques locales. Sauvegarde locale uniquement.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={exportTactics}>↑ Exporter</Button>
              <Button size="sm" variant="ghost" onClick={() => importRef.current?.click()}>↓ Importer</Button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </div>
          </div>

          <TacticsSummary
            savedTactics={savedTactics}
            activeTacticId={activeTacticId}
            players={players}
            onActivate={activateTactic}
            onDelete={deleteTactic}
            onRename={renameTactic}
          />

          {/* Editor for selected or new tactic */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">
                {editingTacticId
                  ? `Modifier : ${savedTactics.find((t) => t.id === editingTacticId)?.name ?? ''}`
                  : 'Nouvelle tactique'}
              </span>
              {savedTactics.length > 0 && (
                <div className="flex gap-1">
                  {savedTactics.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setEditingTacticId(t.id === editingTacticId ? null : t.id)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${t.id === editingTacticId ? 'border-accent text-accent' : 'border-border text-muted hover:text-text'}`}
                    >
                      {t.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setEditingTacticId(null)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${editingTacticId === null ? 'border-accent text-accent' : 'border-border text-muted hover:text-text'}`}
                  >
                    + Nouvelle
                  </button>
                </div>
              )}
            </div>
            <TacticsPanel
              key={editingTacticId ?? 'new'}
              team={editingTacticId
                ? { ...team, tactics: savedTactics.find((t) => t.id === editingTacticId) }
                : { ...team, tactics: undefined }}
              players={players}
              onSave={saveTactics}
            />
          </div>
        </div>
      )}

      {/* Joueurs */}
      {tab === 'joueurs' && (
        <div className="space-y-6">
        <StartingXI
          players={players}
          formation={(savedTactics.find((t) => t.id === activeTacticId) ?? savedTactics[0])?.formation ?? team.formation}
          lineup={(savedTactics.find((t) => t.id === activeTacticId) ?? savedTactics[0])?.lineup}
        />
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
      {/* Meilleurs joueurs */}
      {tab === 'top' && (
        <div className="space-y-4">
          {loadingTop ? (
            <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
          ) : topPlayers.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
              Aucun joueur chargé.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 w-10 text-center">#</th>
                    <th className="px-4 py-2">Joueur</th>
                    <th className="px-4 py-2">Poste</th>
                    <th className="px-4 py-2">Nationalité</th>
                    <th className="px-4 py-2">Culture</th>
                    <th className="px-3 py-2 text-right font-bold">OVR</th>
                  </tr>
                </thead>
                <tbody>
                  {topPlayers.slice(0, 100).map((e, i) => {
                    const { player: p, team: t } = e;
                    const rankColor = i === 0 ? 'text-yellow-500 font-bold' : i === 1 ? 'text-zinc-400 font-bold' : i === 2 ? 'text-orange-500 font-bold' : 'text-muted';
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-border hover:bg-accent/5 cursor-pointer transition-colors"
                        onClick={() => setViewingPlayer(p)}
                      >
                        <td className={`px-3 py-2.5 text-center tabular-nums ${rankColor}`}>{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium">{p.firstName} {p.lastName}</td>
                        <td className="px-4 py-2.5">
                          <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs">{POSITION_LABEL[p.position]}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {t.flag && <img src={t.flag} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" />}
                            <span className="text-sm truncate max-w-[100px]">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted">{CULTURE_LABEL[t.culture] ?? t.culture}</td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums text-accent">{p.overall}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Simulation */}
      {tab === 'simulation' && <SimulationDocs />}

      {/* Presse */}
      {tab === 'presse' && <PresseDocs />}
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

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function DocTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-widest text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? '' : 'bg-surface/50'}>
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2 ${j === 0 ? 'font-medium' : 'text-muted'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimulationDocs() {
  return (
    <div className="space-y-10 max-w-3xl">
      <DocSection title="1. Pré-calcul des forces">
        <p>Avant le coup d'envoi, chaque équipe reçoit quatre notes calculées depuis les stats de ses titulaires :</p>
        <DocTable
          headers={['Note', 'Formule']}
          rows={[
            ['Attaque', '70 % moyenne des 3 meilleurs attaquants + 30 % moyenne des AM × coachAttackMult'],
            ['Milieu', 'Moyenne de tous les milieux × coachMidfieldMult'],
            ['Défense', '80 % moyenne défenseurs + 20 % overall GK × coachDefenseMult'],
            ['Gardien', 'Overall du GK titulaire'],
          ]}
        />
      </DocSection>

      <DocSection title="2. Événements et probabilités">
        <DocTable
          headers={['Événement', 'Poids de base', 'Modificateurs']}
          rows={[
            ['Tir', '~8 %', '× (0,6 + pAttaque) × style × coachShotFreqMult'],
            ['Faute', '~8 %', '× style adverse × coachFoulRateMult'],
            ['Corner', '4 %', '—'],
            ['Hors-jeu', '3 %', '0 si règle désactivée'],
            ['Passe clé', '18 %', '35 % de chance de déclencher un tir'],
            ['Coup franc', '3 %', '30 % → tir (× 0,75)'],
            ['Dribble', '~4 %', '40 % → tir (× 1,05)'],
            ['Dégagement', '~3 %', 'Proportionnel à (1 − pAttaque)'],
          ]}
        />
      </DocSection>

      <DocSection title="3. Probabilité de but">
        <div className="rounded-lg border border-border bg-surface px-5 py-4 font-mono text-sm">
          pBut = sigmoid( (finition + sang-froid − 0,5 × overall_gardien) ÷ 8 ) × multiplicateur
        </div>
        <p className="text-sm text-muted">Clampé [4 %, 75 %]. 55 % de chances qu'un tir soit cadré.</p>
        <DocTable
          headers={['Origine', 'Multiplicateur']}
          rows={[
            ['Normal / passe clé', '× 1,00'],
            ['Dribble', '× 1,05'],
            ['Corner / coup de tête', '× 0,85'],
            ['Coup franc', '× 0,75'],
            ['Penalty (match)', '× 1,80'],
            ['Penalty (tirs au but)', '× 1,50 — clampé [50 %, 86 %]'],
          ]}
        />
      </DocSection>

      <DocSection title="4. Styles tactiques">
        <DocTable
          headers={['Style', 'Tirs', 'Milieu', 'Attaque', 'Fautes adverses']}
          rows={[
            ['Possession', '−12 %', '+12 %', '=', '='],
            ['Contre-attaque', '+8 %', '−8 %', '+10 %', '='],
            ['Jeu direct', '+18 %', '=', '=', '='],
            ['Pressing', '=', '+15 %', '=', '+12 %'],
            ['Ultra-défensif', '−35 %', '−15 %', '−25 %', '+5 %'],
            ['Gegenpressing', '+10 %', '+18 %', '+5 %', '+20 %'],
            ['Tiki-taka', '−18 %', '+20 %', '−5 %', '−10 %'],
            ['Long ball', '+15 %', '−20 %', '+15 %', '+5 %'],
            ['Chaos', '+30 %', '−5 %', '+10 %', '+35 %'],
          ]}
        />
      </DocSection>

      <DocSection title="5. Notes joueurs et overall">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Overall = moyenne pondérée des stats du poste × 5, clampé [1, 100].</li>
          <li>Les ratings attaque/milieu/défense sont calculés depuis les overalls des 11 titulaires.</li>
          <li>Finition + Sang-froid du tireur et overall du gardien entrent directement dans la probabilité de but.</li>
          <li>Les remplacements automatiques comparent les overalls pour choisir qui rentre.</li>
        </ul>
      </DocSection>

      <DocSection title="6. Moral (compétitions)">
        <DocTable
          headers={['Moral', 'Multiplicateur']}
          rows={[
            ['85–100', '× 1,05'],
            ['70–84', '× 1,03 à 1,05'],
            ['55–69', '× 1,00 à 1,03'],
            ['40–54', '× 0,98 à 1,00'],
            ['30–39', '× 0,98'],
            ['1–29', '× 0,97 à 0,98 (plancher résilient)'],
          ]}
        />
      </DocSection>
    </div>
  );
}

function PresseDocs() {
  return (
    <div className="space-y-10 max-w-3xl">
      <DocSection title="Système de presse">
        <p>
          Après chaque match de compétition, un article de presse est généré automatiquement.
          Il reflète le résultat, le moral de l'équipe, le comportement du coach et les événements marquants.
          Certains articles ont un <strong>effet direct sur le moral</strong>.
        </p>
      </DocSection>

      <DocSection title="Catégories d'articles">
        <DocTable
          headers={['Catégorie', 'Déclencheur', 'Effet moral']}
          rows={[
            ['Victoire', 'Victoire standard', 'Aucun additionnel'],
            ['Exploit', 'Victoire contre favori', '+5 à +10'],
            ['Défaite', 'Défaite standard', 'Aucun additionnel'],
            ['Crise', 'Série de défaites', '−5 à −15'],
            ['Scandale', 'Doping / expulsion coach', '−10 à −20'],
            ['Révolte', 'Moral effondré + humiliation', '−15 à −25'],
            ['Critique', 'Mauvaise prestation', '−3 à −8'],
            ['Forme', 'Bonne dynamique', '+3 à +8'],
            ['Neutralité', 'Nul / résultat sans relief', 'Aucun'],
          ]}
        />
      </DocSection>

      <DocSection title="Effets spéciaux">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li><strong>Choc morale</strong> — Les articles hostiles appliquent un malus immédiat sur le moral, en plus du résultat du match.</li>
          <li><strong>Bonus morale</strong> — Les articles positifs (exploit, forme) appliquent un bonus supplémentaire.</li>
          <li><strong>Destitution du président</strong> — Certains articles de révolte/scandale grave déclenchent une destitution fictive. Un article de rebond est généré au round suivant.</li>
          <li><strong>Suspension dopage</strong> — Un article scandale-dopage peut entraîner la suspension d'un joueur pour le prochain match.</li>
        </ul>
      </DocSection>

      <DocSection title="Mentions cliquables">
        <p className="text-sm text-muted">
          Les joueurs et coachs mentionnés dans un article sont cliquables dans l'onglet <strong>Presse</strong>
          d'une compétition. Cela ouvre une fiche avec les stats au moment de l'article.
        </p>
      </DocSection>
    </div>
  );
}
