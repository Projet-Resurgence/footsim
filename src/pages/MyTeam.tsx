import { useEffect, useRef, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import { StartingXI } from '@/components/team/StartingXI';
import { TacticsSummary } from '@/components/team/TacticsSummary';
import { useSession } from '@/stores/session';
import { usePrApiToken } from '@/stores/prApiToken';
import { PrApiTeamBackend } from '@/lib/prapi/teamBackend';
import { useCompetition } from '@/stores/competition';
import { POSITIONS, POSITION_LABEL, POSITION_FULL, CULTURES_BY_CONTINENT, CULTURE_LABEL } from '@/lib/types';
import type { Continent } from '@/lib/types';
import { FORMAT_LABEL } from '@/lib/competition/types';
import type { Player, SavedTactic, Team, TeamTactics } from '@/lib/types';
import type { CompetitionSummary, CompHistoryEntry } from '@/lib/competition/types';
import { COMPETITION_IMPORTANCE_LABEL } from '@/lib/competition/types';
import { calcCmfMatchPoints } from '@/lib/github/matches';
import type { RecentMatchSummary } from '@/lib/github/matches';
import type { CultureWeight } from '@/lib/gen/names';
import { loadLocalTactics, loadLocalSavedTactics, saveLocalSavedTactics } from '@/lib/localTactics';
import { PlayerView } from '@/components/team/PlayerView';
import { COACH_TRAIT_LABEL, COACH_TRAIT_DESCRIPTION } from '@/lib/gen/coach';
import type { Coach } from '@/lib/gen/coach';

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

type Tab = 'tactique' | 'joueurs' | 'noms' | 'postes' | 'competitions' | 'palmares' | 'historique' | 'entraineur' | 'stats';

export default function MyTeam() {
  const session = useSession((s) => s.session);
  const isAdmin = useSession((s) => s.isAdmin());
  const prApiToken = usePrApiToken((s) => s.token);
  const refreshComps = useCompetition((s) => s.refresh);
  const compSummaries = useCompetition((s) => s.summaries);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [savedTactics, setSavedTactics] = useState<SavedTactic[]>([]);
  const [activeTacticId, setActiveTacticId] = useState<string | undefined>();
  const [editingTacticId, setEditingTacticId] = useState<string | null>(null); // null = new
  const [tab, setTab] = useState<Tab>('tactique');
  const [summaries, setSummaries] = useState<CompetitionSummary[]>([]);
  const [loadingComps, setLoadingComps] = useState(false);
  const [viewingPlayer, setViewingPlayer] = useState<Player | null>(null);
  const [nameWeights, setNameWeights] = useState<CultureWeight[]>([]);
  const [generatingNames, setGeneratingNames] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session || !prApiToken) return;
    const backend = new PrApiTeamBackend(prApiToken);

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
        const teams = await backend.listTeams(session!.id);
        const mine = teams.find((t) => t.managerDiscordId === session!.id);
        if (!mine) { setData(null); return; }
        const full = await backend.loadTeam(mine.slug, session!.id);
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
  }, [session?.id, prApiToken]);

  useEffect(() => {
    if (tab !== 'competitions' && tab !== 'palmares') return;
    if (compSummaries.length > 0) { setSummaries(compSummaries); return; }
    if (!prApiToken) return;
    setLoadingComps(true);
    refreshComps('', prApiToken)
      .then(() => setSummaries(compSummaries))
      .catch(() => toast('error', 'Impossible de charger les compétitions.'))
      .finally(() => setLoadingComps(false));
  }, [tab, prApiToken]); // eslint-disable-line react-hooks/exhaustive-deps


  function persistSavedTactics(next: SavedTactic[], activeId?: string) {
    if (!data) return;
    setSavedTactics(next);
    setActiveTacticId(activeId);
    saveLocalSavedTactics(data.team.id, next, activeId);
    if (prApiToken) {
      const updatedTeam: Team = { ...data.team, savedTactics: next, activeTacticId: activeId };
      setData({ ...data, team: updatedTeam });
      new PrApiTeamBackend(prApiToken).saveTeam(updatedTeam, data.players).catch(() => {});
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
            formationLabel: t.formationLabel,
            positionMap: t.positionMap,
            tokenPositions: t.tokenPositions,
            customStyles: t.customStyles ?? [],
            activeCustomStyleId: t.activeCustomStyleId,
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
            positionMap: json.positionMap,
            tokenPositions: json.tokenPositions,
            customStyles: json.customStyles ?? [],
            activeCustomStyleId: json.activeCustomStyleId,
            plannedSubs: Array.isArray(json.plannedSubs) ? json.plannedSubs : undefined,
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
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-full max-w-2xl space-y-4">
          <SkeletonCard lines={2} />
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <div className="font-display text-2xl">Aucune équipe affiliée</div>
        <p className="text-muted text-sm max-w-sm">
          Ton identifiant Discord n'est associé à aucune équipe. Contacte l'administrateur.
        </p>
        <Link to="/" className="text-sm text-accent underline">Retour à l'accueil</Link>
      </div>
    );
  }

  const { team, players } = data;

  return (
    <>
    <div className="max-w-4xl space-y-8">
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
        {(['tactique', 'joueurs', 'noms', 'postes', 'competitions', 'palmares', 'historique', 'stats', 'entraineur'] as Tab[]).map((t) => (
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
              : t === 'stats' ? 'Statistiques individuelles'
              : t === 'palmares' ? 'Palmarès'
              : t === 'historique' ? 'Historique matchs'
              : 'Entraîneur'}
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
          positionMap={(savedTactics.find((t) => t.id === activeTacticId) ?? savedTactics[0])?.positionMap}
          onPlayerClick={setViewingPlayer}
        />
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-bg text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Poste</th>
                <th className="px-4 py-2 font-medium text-right">Âge</th>
                <th className="px-4 py-2 font-medium text-right">Pied</th>
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
                    <td className="px-4 py-2 text-right">{p.age}</td>
                    <td className="px-4 py-2 text-right">{p.preferredFoot === 'right' ? 'D' : p.preferredFoot === 'left' ? 'G' : 'D/G'}</td>
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
        <div className="space-y-8">
          {loadingComps ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
            </div>
          ) : summaries.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
              Aucune compétition disponible.
            </div>
          ) : (
            <>
              {/* Officielles */}
              {summaries.filter((s) => (s.kind ?? 'officielle') === 'officielle').length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">Compétitions officielles</span>
                    <div className="flex-1 border-t border-border" />
                    <span className="text-xs text-muted">{summaries.filter((s) => (s.kind ?? 'officielle') === 'officielle').length}</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {summaries.filter((s) => (s.kind ?? 'officielle') === 'officielle').map((s) => {
                      const clickable = s.status === 'ongoing' || s.status === 'completed';
                      const inner = (
                        <div className={`rounded-lg border border-border bg-surface p-4 space-y-2 transition-colors ${clickable ? 'hover:border-accent/50 cursor-pointer' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium">{s.name}</div>
                            <span className={`text-xs ${STATUS_COLOR[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                          </div>
                          <div className="text-xs text-muted">{FORMAT_LABEL[s.format]} · {s.teamCount} équipes</div>
                          {s.winner && <div className="text-xs text-warning">🏆 Vainqueur enregistré</div>}
                        </div>
                      );
                      return clickable
                        ? <Link key={s.id} to={`/competition-view/${s.id}`}>{inner}</Link>
                        : <div key={s.id}>{inner}</div>;
                    })}
                  </div>
                </div>
              )}
              {/* Amicales */}
              {summaries.filter((s) => s.kind === 'amicale').length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">Compétitions amicales</span>
                    <div className="flex-1 border-t border-border" />
                    <span className="text-xs text-muted">{summaries.filter((s) => s.kind === 'amicale').length}</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {summaries.filter((s) => s.kind === 'amicale').map((s) => {
                      const clickable = s.status === 'ongoing' || s.status === 'completed';
                      const inner = (
                        <div className={`rounded-lg border border-border bg-surface p-4 space-y-2 transition-colors ${clickable ? 'hover:border-accent/50 cursor-pointer' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium">{s.name}</div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-xs ${STATUS_COLOR[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                              <span className="text-xs text-muted border border-border rounded px-1.5 py-0.5">Amicale</span>
                            </div>
                          </div>
                          <div className="text-xs text-muted">{FORMAT_LABEL[s.format]} · {s.teamCount} équipes</div>
                          {s.winner && <div className="text-xs text-warning">🏆 Vainqueur enregistré</div>}
                        </div>
                      );
                      return clickable
                        ? <Link key={s.id} to={`/competition-view/${s.id}`}>{inner}</Link>
                        : <div key={s.id}>{inner}</div>;
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* Palmarès */}
      {tab === 'palmares' && (
        <MyTeamPalmaresTab
          compHistory={data.team.compHistory ?? []}
          teamId={data.team.id}
          ongoingSummaries={summaries.filter((s) => s.status === 'ongoing' && s.teamIds?.includes(data.team.id))}
        />
      )}
      {tab === 'stats' && (
        <MyTeamStatsTab
          recentMatches={data.team.recentMatches ?? []}
          players={data.players}
        />
      )}
      {/* Historique des matchs */}
      {tab === 'historique' && (
        <MyTeamHistoriqueTab recentMatches={data.team.recentMatches ?? []} />
      )}
      {tab === 'entraineur' && (
        <CoachReadPanel coach={data.team.coach ?? null} teamSlug={data.team.slug} isAdmin={isAdmin} />
      )}

    </div>

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

function MyTeamHistoriqueTab({ recentMatches }: { recentMatches: RecentMatchSummary[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (recentMatches.length === 0) {
    return (
      <div className="py-16 text-center text-muted text-sm">
        Aucun match enregistré. L'historique apparaît ici après chaque compétition.
      </div>
    );
  }

  const sorted = [...recentMatches].sort((a, b) => b.playedAt.localeCompare(a.playedAt));

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">
        Historique complet · {recentMatches.length} match{recentMatches.length > 1 ? 's' : ''} enregistré{recentMatches.length > 1 ? 's' : ''}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Adversaire</th>
              <th className="px-3 py-2 text-center">D/E</th>
              <th className="px-3 py-2 text-center">Score</th>
              <th className="px-3 py-2 text-center">Résultat</th>
              <th className="px-3 py-2 text-right">Pts CMF</th>
              <th className="px-3 py-2">Importance</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const won = m.scoreFor > m.scoreAgainst;
              const drew = m.scoreFor === m.scoreAgainst;
              const resultLabel = won ? 'V' : drew ? 'N' : 'D';
              const resultColor = won ? 'text-green-400' : drew ? 'text-warning' : 'text-danger';
              const pts = m.opponentStrength != null
                ? calcCmfMatchPoints({ scoreFor: m.scoreFor, scoreAgainst: m.scoreAgainst, opponentStrength: m.opponentStrength, compKind: m.compKind, compScope: m.compScope, compImportance: m.compImportance, participantCount: m.participantCount })
                : (m.cmfPoints ?? 0);
              const key = `${m.matchId}-${m.homeAway}`;
              const hasDetails = !!(m.scorers?.length || m.cards?.length);
              const isExpanded = expanded === key;
              return (
                <Fragment key={key}>
                  <tr
                    className={`border-t border-border transition-colors ${hasDetails ? 'cursor-pointer hover:bg-accent/5' : ''}`}
                    onClick={() => hasDetails && setExpanded(isExpanded ? null : key)}
                  >
                    <td className="px-3 py-2 text-xs text-muted tabular-nums whitespace-nowrap">
                      {new Date(m.playedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td className="px-3 py-2 font-medium">{m.opponentName}</td>
                    <td className="px-3 py-2 text-center text-xs text-muted">{m.homeAway === 'home' ? 'D' : 'E'}</td>
                    <td className="px-3 py-2 text-center font-mono tabular-nums">{m.scoreFor}–{m.scoreAgainst}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`font-bold text-xs ${resultColor}`}>{resultLabel}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-accent">{pts > 0 ? `+${pts}` : pts}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {m.compImportance ? COMPETITION_IMPORTANCE_LABEL[m.compImportance] : '—'}
                    </td>
                  </tr>
                  {isExpanded && hasDetails && (
                    <tr className="border-t border-border/30">
                      <td colSpan={7} className="px-4 py-2 bg-surface/60">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                          {(m.scorers ?? []).map((g, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <span>⚽</span>
                              <span className="font-medium text-text">{g.playerName}</span>
                              <span className="text-muted/60">{g.minute}'</span>
                              {g.assistName && <span className="text-muted/60">(p. {g.assistName})</span>}
                            </span>
                          ))}
                          {(m.cards ?? []).map((c, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <span>{c.type === 'red' ? '🟥' : '🟨'}</span>
                              <span className="font-medium text-text">{c.playerName}</span>
                              <span className="text-muted/60">{c.minute}'</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const RESULT_LABEL: Record<CompHistoryEntry['result'], string> = {
  winner: '🏆 Vainqueur',
  finalist: '🥈 Finaliste',
  third: '🥉 3ème place',
  semi: 'Demi-finale',
  quarter: 'Quart de finale',
  round16: '8e de finale',
  round32: '16e de finale',
  round64: '32e de finale',
  participant: 'Participant',
};
const RESULT_COLOR: Record<CompHistoryEntry['result'], string> = {
  winner: 'text-warning border-warning/40 bg-warning/10',
  finalist: 'text-text border-border bg-surface',
  third: 'text-accent border-accent/40 bg-accent/10',
  semi: 'text-muted border-border bg-surface',
  quarter: 'text-muted border-border bg-surface',
  round16: 'text-muted border-border bg-surface',
  round32: 'text-muted border-border bg-surface',
  round64: 'text-muted border-border bg-surface',
  participant: 'text-muted border-border bg-surface',
};

function MyTeamStatsTab({
  recentMatches,
  players,
}: {
  recentMatches: RecentMatchSummary[];
  players: Player[];
}) {
  type PlayerStat = { goals: number; assists: number };
  const stats = new Map<string, PlayerStat>();

  for (const m of recentMatches.filter((m) => !m.compKind || m.compKind !== 'amicale')) {
    for (const g of m.scorers ?? []) {
      if (!g.playerId) continue;
      const s = stats.get(g.playerId) ?? { goals: 0, assists: 0 };
      s.goals++;
      stats.set(g.playerId, s);
      if (g.assistId) {
        const a = stats.get(g.assistId) ?? { goals: 0, assists: 0 };
        a.assists++;
        stats.set(g.assistId, a);
      }
    }
  }

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const rows = [...stats.entries()]
    .map(([id, s]) => ({ id, player: playerMap.get(id), ...s }))
    .filter((r) => r.player)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists);

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-muted text-sm">
        Aucune statistique individuelle. Les données apparaissent après les matchs de compétition.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {rows.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl">Buteurs & Passeurs</h2>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Joueur</th>
                  <th className="px-4 py-2">Poste</th>
                  <th className="px-4 py-2 text-center">⚽ Buts</th>
                  <th className="px-4 py-2 text-center">🎯 Passes D.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={`border-t border-border ${i % 2 === 1 ? 'bg-surface/50' : ''}`}>
                    <td className="px-4 py-2 text-xs text-muted tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{r.player!.firstName} {r.player!.lastName}</td>
                    <td className="px-4 py-2 text-xs text-muted">{r.player!.position}</td>
                    <td className="px-4 py-2 text-center tabular-nums font-semibold text-accent">{r.goals}</td>
                    <td className="px-4 py-2 text-center tabular-nums text-muted">{r.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function MyTeamPalmaresTab({
  compHistory,
  ongoingSummaries,
}: {
  compHistory: CompHistoryEntry[];
  teamId: string;
  ongoingSummaries: CompetitionSummary[];
}) {
  const totalParticipations = compHistory.length + ongoingSummaries.length;

  if (totalParticipations === 0) {
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
  const distinctComps = Object.keys(byName).length + ongoingSummaries.filter((s) => !byName[s.name]).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-5 py-3 text-center">
          <div className="font-display text-3xl text-warning">{wins}</div>
          <div className="text-xs text-muted mt-0.5">Titre{wins > 1 ? 's' : ''}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-5 py-3 text-center">
          <div className="font-display text-3xl">{totalParticipations}</div>
          <div className="text-xs text-muted mt-0.5">Participation{totalParticipations > 1 ? 's' : ''}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-5 py-3 text-center">
          <div className="font-display text-3xl">{distinctComps}</div>
          <div className="text-xs text-muted mt-0.5">Compétition{distinctComps > 1 ? 's' : ''} différente{distinctComps > 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Compétitions en cours */}
        {ongoingSummaries.map((s) => (
          <div key={s.id} className="rounded-lg border border-accent/30 bg-accent/5 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{s.name}</div>
              <span className="text-xs text-accent">En cours</span>
            </div>
            <div className="text-xs text-muted">{FORMAT_LABEL[s.format]} · {s.teamCount} équipes</div>
          </div>
        ))}

        {/* Compétitions terminées */}
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
