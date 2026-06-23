import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import { StartingXI } from '@/components/team/StartingXI';
import { TacticsSummary } from '@/components/team/TacticsSummary';
import { useSession } from '@/stores/session';
import { useCredentials } from '@/stores/credentials';
import { GithubTeamBackend } from '@/lib/github/backend';
import { saveTeamWithRoster } from '@/lib/github/store';
import { listCompetitions } from '@/lib/github/competitions';
import { POSITIONS, POSITION_LABEL, POSITION_FULL, CULTURES_BY_CONTINENT, CULTURE_LABEL } from '@/lib/types';
import { listTeams, loadTeam } from '@/lib/github/store';
import type { Continent } from '@/lib/types';
import { FORMAT_LABEL } from '@/lib/competition/types';
import type { Player, SavedTactic, Team, TeamTactics } from '@/lib/types';
import type { CompetitionSummary, CompHistoryEntry } from '@/lib/competition/types';
import type { CultureWeight } from '@/lib/gen/names';
import { loadLocalTactics, loadLocalSavedTactics, saveLocalSavedTactics } from '@/lib/localTactics';
import { env } from '@/lib/env';
import { PlayerView } from '@/components/team/PlayerView';
import Simulation from '@/pages/dashboard/Simulation';
import { COACH_TRAIT_LABEL, COACH_TRAIT_DESCRIPTION } from '@/lib/gen/coach';
import type { Coach } from '@/lib/gen/coach';

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

type Tab = 'tactique' | 'joueurs' | 'noms' | 'postes' | 'competitions' | 'palmares' | 'top' | 'simulation' | 'entraineur';

export default function MyTeam() {
  const session = useSession((s) => s.session);
  const isAdmin = useSession((s) => s.isAdmin());
  const pat = useCredentials((s) => s.githubPat);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [savedTactics, setSavedTactics] = useState<SavedTactic[]>([]);
  const [activeTacticId, setActiveTacticId] = useState<string | undefined>();
  const [editingTacticId, setEditingTacticId] = useState<string | null>(null); // null = new
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
    const cacheKey = `footsim.myteam.slug.${session.id}`;

    async function resolveSlug(): Promise<string | null> {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return cached;
      const teams = await ghPublic.listTeams(session!.id);
      const mine = teams.find((t) => t.managerDiscordId === session!.id);
      if (!mine) return null;
      localStorage.setItem(cacheKey, mine.slug);
      return mine.slug;
    }

    async function applyFull(full: { team: Team; players: Player[] }) {
      const local = loadLocalSavedTactics(full.team.id);
      const merged = local.savedTactics.length > 0
        ? local.savedTactics
        : (full.team.savedTactics ?? []);
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
    }

    async function load() {
      try {
        const slug = await resolveSlug();
        if (!slug) { setData(null); return; }

        let full = await ghPublic.loadTeam(slug, session!.id);
        if (!full) {
          // slug stale — bust cache, refetch list
          localStorage.removeItem(cacheKey);
          const teams = await ghPublic.listTeams(session!.id);
          const mine = teams.find((t) => t.managerDiscordId === session!.id);
          if (!mine) { setData(null); return; }
          localStorage.setItem(cacheKey, mine.slug);
          full = await ghPublic.loadTeam(mine.slug, session!.id);
        }
        if (!full) { toast('error', 'Équipe introuvable.'); return; }
        await applyFull(full);
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
    // Also persist to GitHub so other clients (multiplex, competition match) see the active tactic
    if (isAdmin && pat) {
      const updatedTeam: Team = { ...data.team, savedTactics: next, activeTacticId: activeId };
      setData({ ...data, team: updatedTeam });
      saveTeamWithRoster(updatedTeam, data.players, pat).catch(() => {
        // non-blocking — localStorage is the source of truth for local sessions
      });
    }
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
            bench: Array.isArray(t.bench) ? t.bench : undefined,
            plannedSubs: Array.isArray(t.plannedSubs) ? t.plannedSubs : undefined,
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
            bench: Array.isArray(json.bench) ? json.bench : undefined,
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
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl space-y-4">
          <SkeletonCard lines={2} />
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
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
        <AccountMenu />
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
        {(['tactique', 'joueurs', 'noms', 'postes', 'competitions', 'palmares', 'top', 'entraineur', 'simulation'] as Tab[]).map((t) => (
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
              : t === 'palmares' ? 'Palmarès'
              : t === 'top' ? 'Meilleurs joueurs'
              : t === 'entraineur' ? 'Entraîneur'
              : 'Simulation'}
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
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
            </div>
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
      {/* Palmarès */}
      {tab === 'palmares' && (
        <MyTeamPalmaresTab compHistory={data.team.compHistory ?? []} />
      )}
      {/* Meilleurs joueurs */}
      {tab === 'top' && (
        <div className="space-y-4">
          {loadingTop ? (
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
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
      {tab === 'entraineur' && (
        <CoachReadPanel coach={data.team.coach ?? null} teamSlug={data.team.slug} isAdmin={isAdmin} />
      )}

      {/* Simulation (tous sous-onglets : moteur, entraineurs, moral, notes, presse) */}
      {tab === 'simulation' && <Simulation />}
    </main>

    {viewingPlayer && (
      <PlayerView player={viewingPlayer} onClose={() => setViewingPlayer(null)} />
    )}
    </>
  );
}

function CoachReadPanel({ coach, teamSlug, isAdmin }: { coach: Coach | null; teamSlug?: string; isAdmin: boolean }) {
  const statKeys = ['motivation', 'tactique', 'offensive', 'defensif', 'mentalite', 'gestion'] as const;
  const statLabel: Record<typeof statKeys[number], string> = {
    motivation: 'Motivation', tactique: 'Tactique', offensive: 'Offensive',
    defensif: 'Défensif', mentalite: 'Mentalité', gestion: 'Gestion',
  };

  if (!coach) {
    return (
      <div className="space-y-3">
        <h2 className="font-display text-xl">Entraîneur</h2>
        <p className="text-sm text-muted">Aucun entraîneur pour cette équipe.</p>
        {isAdmin && teamSlug && (
          <Link to={`/dashboard/teams/${teamSlug}`} className="text-sm text-accent hover:underline">
            Aller dans le dashboard pour en générer un →
          </Link>
        )}
      </div>
    );
  }

  const pos = coach.positiveTraits ?? (coach.trait ? [coach.trait] : []);
  const neg = coach.negativeTraits ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Entraîneur</h2>
        {isAdmin && teamSlug && (
          <Link to={`/dashboard/teams/${teamSlug}`} className="text-sm text-accent hover:underline text-xs">
            Modifier →
          </Link>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 space-y-5">
        <div>
          <div className="font-display text-2xl">{coach.firstName} {coach.lastName}</div>
          <div className="text-sm text-muted mt-1">Overall {coach.overall} / 100</div>
        </div>

        {(pos.length > 0 || neg.length > 0) && (
          <div className="space-y-2">
            {pos.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-widest text-muted">Traits positifs</div>
                {pos.map((t) => (
                  <div key={t} className="rounded border border-green-500/20 bg-green-500/5 px-3 py-2">
                    <div className="text-xs font-semibold text-green-400">{COACH_TRAIT_LABEL[t]}</div>
                    <div className="text-xs text-muted mt-0.5">{COACH_TRAIT_DESCRIPTION[t]}</div>
                  </div>
                ))}
              </div>
            )}
            {neg.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-widest text-muted">Traits négatifs</div>
                {neg.map((t) => (
                  <div key={t} className="rounded border border-danger/20 bg-danger/5 px-3 py-2">
                    <div className="text-xs font-semibold text-danger">{COACH_TRAIT_LABEL[t]}</div>
                    <div className="text-xs text-muted mt-0.5">{COACH_TRAIT_DESCRIPTION[t]}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 border-t border-border pt-4">
          {statKeys.map((k) => (
            <div key={k} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{statLabel[k]}</span>
                <span className="tabular-nums font-semibold">{coach.stats[k]}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(coach.stats[k] / 20) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
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

const RESULT_LABEL: Record<CompHistoryEntry['result'], string> = {
  winner: '🏆 Vainqueur',
  finalist: '🥈 Finaliste',
  third: '🥉 3ème place',
  semi: '4ème (demi-finale)',
  participant: 'Participant',
};
const RESULT_COLOR: Record<CompHistoryEntry['result'], string> = {
  winner: 'text-warning border-warning/40 bg-warning/10',
  finalist: 'text-text border-border bg-surface',
  third: 'text-accent border-accent/40 bg-accent/10',
  semi: 'text-muted border-border bg-surface',
  participant: 'text-muted border-border bg-surface',
};

function MyTeamPalmaresTab({ compHistory }: { compHistory: CompHistoryEntry[] }) {
  if (compHistory.length === 0) {
    return (
      <div className="py-16 text-center text-muted text-sm">
        Aucun palmarès enregistré. Les résultats apparaissent ici après chaque compétition sauvegardée.
      </div>
    );
  }

  const byName = compHistory.reduce<Record<string, CompHistoryEntry[]>>((acc, e) => {
    (acc[e.compName] ??= []).push(e);
    return acc;
  }, {});

  const wins = compHistory.filter((e) => e.result === 'winner').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-5 py-3 text-center">
          <div className="font-display text-3xl text-warning">{wins}</div>
          <div className="text-xs text-muted mt-0.5">Titre{wins > 1 ? 's' : ''}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-5 py-3 text-center">
          <div className="font-display text-3xl">{compHistory.length}</div>
          <div className="text-xs text-muted mt-0.5">Participation{compHistory.length > 1 ? 's' : ''}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-5 py-3 text-center">
          <div className="font-display text-3xl">{Object.keys(byName).length}</div>
          <div className="text-xs text-muted mt-0.5">Compétition{Object.keys(byName).length > 1 ? 's' : ''} différente{Object.keys(byName).length > 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(byName).map(([compName, entries]) => {
          const entryWins = entries.filter((e) => e.result === 'winner').length;
          const sorted = [...entries].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
          return (
            <div key={compName} className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {compName}
                  {entryWins > 0 && (
                    <span className="text-warning text-sm">
                      {'🏆'.repeat(Math.min(entryWins, 5))}{entryWins > 5 ? ` ×${entryWins}` : ''}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {FORMAT_LABEL[entries[0].format]} · {entries.length} participation{entries.length > 1 ? 's' : ''}
                </div>
              </div>
              <div className="space-y-1.5">
                {sorted.map((e, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted text-xs">{e.year ?? '—'}</span>
                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${RESULT_COLOR[e.result]}`}>
                      {RESULT_LABEL[e.result]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
