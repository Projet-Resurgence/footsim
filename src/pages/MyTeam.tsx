import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import { StartingXI } from '@/components/team/StartingXI';
import { TacticsSummary } from '@/components/team/TacticsSummary';
import { CounterTacticsPanel } from '@/components/team/CounterTacticsPanel';
import { MatchHistoryTable } from '@/components/team/MatchHistoryTable';
import { useSession } from '@/stores/session';
import { usePrApiToken } from '@/stores/prApiToken';
import { PrApiTeamBackend } from '@/lib/prapi/teamBackend';
import { prapi } from '@/lib/prapi/client';
import { useCompetition } from '@/stores/competition';
import { FORMAT_LABEL } from '@/lib/competition/types';
import type { Player, SavedTactic, Team, TeamTactics } from '@/lib/types';
import type { CompetitionSummary, CompHistoryEntry } from '@/lib/competition/types';
import type { RecentMatchSummary } from '@/lib/github/matches';
import { loadLocalTactics } from '@/lib/localTactics';
import { PlayerView } from '@/components/team/PlayerView';
import { COACH_TRAIT_LABEL, COACH_TRAIT_DESCRIPTION } from '@/lib/gen/coach';
import type { Coach } from '@/lib/gen/coach';
import { pickNameMixed } from '@/lib/gen/names';
import { Input } from '@/components/ui/Input';


type Tab = 'tactique' | 'joueurs' | 'palmares' | 'historique' | 'entraineur' | 'stats';

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
  const [, setLoadingComps] = useState(false);
  const [viewingPlayer, setViewingPlayer] = useState<Player | null>(null);
  const [renaming, setRenaming] = useState<
    | { kind: 'player'; id: string; first: string; last: string }
    | { kind: 'coach'; first: string; last: string }
    | null
  >(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  function saveTeamData(nextTeam: Team, nextPlayers: Player[]) {
    if (!prApiToken) return;
    setData({ team: nextTeam, players: nextPlayers });
    new PrApiTeamBackend(prApiToken).saveTeam(nextTeam, nextPlayers).catch(() => {
      toast('error', 'Échec de la sauvegarde.');
    });
  }

  function applyRename(first: string, last: string) {
    if (!data || !renaming) return;
    const firstName = first.trim();
    const lastName = last.trim();
    if (!firstName && !lastName) return;
    if (renaming.kind === 'player') {
      const players = data.players.map((p) => p.id === renaming.id ? { ...p, firstName, lastName } : p);
      saveTeamData(data.team, players);
      toast('success', 'Joueur renommé.');
    } else if (data.team.coach) {
      saveTeamData({ ...data.team, coach: { ...data.team.coach, firstName, lastName } }, data.players);
      toast('success', 'Entraîneur renommé.');
    }
    setRenaming(null);
  }

  useEffect(() => {
    if (!session || !prApiToken) return;

    async function applyFull(full: { team: Team; players: Player[] }) {
      const dbTactics = full.team.savedTactics ?? [];
      if (dbTactics.length === 0) {
        // seed from legacy localStorage or team.tactics on first load
        const leg = loadLocalTactics(full.team.id) ?? full.team.tactics;
        if (leg) {
          const seeded: SavedTactic = { ...leg, id: crypto.randomUUID(), name: 'Tactique de base' };
          setSavedTactics([seeded]);
          setActiveTacticId(seeded.id);
          // persist seed to DB immediately
          const updatedTeam: Team = { ...full.team, savedTactics: [seeded], activeTacticId: seeded.id };
          new PrApiTeamBackend(prApiToken!).saveTeam(updatedTeam, full.players).catch(() => {});
          setData({ team: updatedTeam, players: full.players });
          return;
        }
      } else {
        setSavedTactics(dbTactics);
        setActiveTacticId(full.team.activeTacticId);
      }
      setData({ team: full.team, players: full.players });
    }

    async function load() {
      try {
        const full = await prapi.myTeam(prApiToken!);
        await applyFull(full);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, prApiToken]);

  useEffect(() => {
    if (tab !== 'palmares') return;
    if (compSummaries.length > 0) { setSummaries(compSummaries); return; }
    if (!prApiToken) return;
    setLoadingComps(true);
    refreshComps('', prApiToken)
      .then(() => setSummaries(useCompetition.getState().summaries))
      .catch(() => toast('error', 'Impossible de charger les compétitions.'))
      .finally(() => setLoadingComps(false));
  }, [tab, prApiToken]); // eslint-disable-line react-hooks/exhaustive-deps


  function persistSavedTactics(next: SavedTactic[], activeId?: string) {
    if (!data || !prApiToken) return;
    setSavedTactics(next);
    setActiveTacticId(activeId);
    // Merge all custom styles from all tactics into team-level customStyles
    const mergedStyles = Object.values(
      next.flatMap((t) => t.customStyles ?? [])
        .reduce<Record<string, import('@/lib/types').CustomTacticStyle>>((acc, s) => { acc[s.id] = s; return acc; }, {})
    );
    const updatedTeam: Team = { ...data.team, savedTactics: next, activeTacticId: activeId, customStyles: mergedStyles };
    setData({ ...data, team: updatedTeam });
    new PrApiTeamBackend(prApiToken).saveTeam(updatedTeam, data.players).catch(() => {
      toast('error', 'Échec de la sauvegarde des tactiques.');
    });
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

  function duplicateTactic(id: string) {
    const src = savedTactics.find((t) => t.id === id);
    if (!src) return;
    const copy: SavedTactic = { ...src, id: crypto.randomUUID(), name: `${src.name} (copie)` };
    const idx = savedTactics.findIndex((t) => t.id === id);
    const next = [...savedTactics.slice(0, idx + 1), copy, ...savedTactics.slice(idx + 1)];
    persistSavedTactics(next, copy.id);
    toast('success', `Tactique dupliquée : « ${copy.name} »`);
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
        <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>⚙ Paramètres</Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {(['tactique', 'joueurs', 'palmares', 'historique', 'stats', 'entraineur'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'tactique' ? 'Tactique'
              : t === 'joueurs' ? 'Joueurs'
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
            <p className="text-xs text-muted">Tactiques sauvegardées en base de données.</p>
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
            onDuplicate={duplicateTactic}
          />

          <CounterTacticsPanel
            savedTactics={savedTactics}
            selfTeamId={team.id}
            onChange={(next) => persistSavedTactics(next, activeTacticId)}
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
              onSaveStyles={(styles, activeId) => {
                if (!data || !prApiToken) return;
                const updatedTeam: Team = { ...data.team, customStyles: styles };
                const updatedTactics = savedTactics.map((t) => ({ ...t, customStyles: styles, activeCustomStyleId: t.id === editingTacticId ? activeId : t.activeCustomStyleId }));
                setData({ ...data, team: updatedTeam });
                setSavedTactics(updatedTactics);
                new PrApiTeamBackend(prApiToken).saveTeam({ ...updatedTeam, savedTactics: updatedTactics }, data.players).catch(() => {
                  toast('error', 'Échec de la sauvegarde des styles.');
                });
              }}
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
          onRenamePlayer={(p) => setRenaming({ kind: 'player', id: p.id, first: p.firstName, last: p.lastName })}
        />
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
        <MatchHistoryTable
          recentMatches={data.team.recentMatches ?? []}
          teamId={data.team.id}
          onEnrich={(next) => saveTeamData({ ...data.team, recentMatches: next }, data.players)}
        />
      )}
      {tab === 'entraineur' && (
        <CoachReadPanel
          coach={data.team.coach ?? null}
          teamSlug={data.team.slug}
          isAdmin={isAdmin}
          onRename={data.team.coach ? () => setRenaming({ kind: 'coach', first: data.team.coach!.firstName, last: data.team.coach!.lastName }) : undefined}
        />
      )}

    </div>

    {viewingPlayer && (
      <PlayerView player={viewingPlayer} onClose={() => setViewingPlayer(null)} />
    )}
    {settingsOpen && (
      <TeamSettingsModal
        team={team}
        onClose={() => setSettingsOpen(false)}
        onSave={(patch, regenNames) => {
          const nextTeam: Team = { ...data.team, ...patch };
          const cultures = nextTeam.cultures?.length
            ? nextTeam.cultures
            : [{ culture: nextTeam.culture, weight: 100 }];
          const nextPlayers = regenNames
            ? data.players.map((p) => ({ ...p, ...pickNameMixed(cultures) }))
            : data.players;
          saveTeamData(nextTeam, nextPlayers);
          toast('success', regenNames ? 'Paramètres sauvegardés, noms régénérés.' : 'Paramètres sauvegardés.');
          setSettingsOpen(false);
        }}
      />
    )}
    {renaming && (
      <RenameModal
        title={renaming.kind === 'player' ? 'Renommer le joueur' : 'Renommer l\'entraîneur'}
        initialFirst={renaming.first}
        initialLast={renaming.last}
        onSave={applyRename}
        onClose={() => setRenaming(null)}
      />
    )}
    </>
  );
}

function TeamSettingsModal({ team, onSave, onClose }: {
  team: Team;
  onSave: (patch: Pick<Team, 'name' | 'jerseyColor' | 'jerseyAwayColor'>, regenNames: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [jerseyColor, setJerseyColor] = useState(team.jerseyColor ?? '#e63c3c');
  const [jerseyAwayColor, setJerseyAwayColor] = useState(team.jerseyAwayColor ?? '#f4f0e6');
  const [regenNames, setRegenNames] = useState(false);
  const cultures = team.cultures?.length ? team.cultures : [{ culture: team.culture, weight: 100 }];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        className="w-full max-w-md space-y-5 rounded-xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), jerseyColor, jerseyAwayColor }, regenNames); }}
      >
        <h2 className="font-display text-xl">Paramètres de l'équipe</h2>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nom de l'équipe</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Maillot domicile</span>
            <span className="flex items-center gap-2">
              <input type="color" value={jerseyColor} onChange={(e) => setJerseyColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-border bg-bg" />
              <span className="font-mono text-xs text-muted">{jerseyColor}</span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Maillot extérieur</span>
            <span className="flex items-center gap-2">
              <input type="color" value={jerseyAwayColor} onChange={(e) => setJerseyAwayColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-border bg-bg" />
              <span className="font-mono text-xs text-muted">{jerseyAwayColor}</span>
            </span>
          </label>
        </div>

        <label className="flex items-start gap-3 text-sm cursor-pointer rounded-lg border border-border bg-bg p-3">
          <input
            type="checkbox"
            checked={regenNames}
            onChange={(e) => setRegenNames(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span>
            <span className="block font-medium">Régénérer les noms des joueurs</span>
            <span className="block text-xs text-muted mt-0.5">
              Nouveaux prénoms/noms tirés selon les cultures de l'équipe
              ({cultures.map((c) => c.culture).join(', ')}). Stats, postes et âges inchangés. Irréversible.
            </span>
          </span>
        </label>

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!name.trim()}>Sauvegarder</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Annuler</Button>
        </div>
      </form>
    </div>
  );
}

function RenameModal({ title, initialFirst, initialLast, onSave, onClose }: {
  title: string;
  initialFirst: string;
  initialLast: string;
  onSave: (first: string, last: string) => void;
  onClose: () => void;
}) {
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave(first, last); }}
      >
        <h2 className="font-display text-xl">{title}</h2>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Prénom</span>
            <Input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Nom</span>
            <Input value={last} onChange={(e) => setLast(e.target.value)} />
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!first.trim() && !last.trim()}>Renommer</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Annuler</Button>
        </div>
      </form>
    </div>
  );
}

function CoachReadPanel({ coach, teamSlug, isAdmin, onRename }: { coach: Coach | null; teamSlug?: string; isAdmin: boolean; onRename?: () => void }) {
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
          <div className="flex items-center gap-2 font-display text-2xl">
            {coach.firstName} {coach.lastName}
            {onRename && (
              <button onClick={onRename} className="text-base text-muted/50 hover:text-accent transition-colors" title="Renommer l'entraîneur">✏️</button>
            )}
          </div>
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

function lpmRankBadge(rank: number): { label: string; cls: string } {
  const ord = rank === 1 ? '1er' : `${rank}e`;
  if (rank <= 24) return { label: `${ord} — Zone Or`, cls: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10' };
  if (rank <= 40) return { label: `${ord} — Zone Rouge`, cls: 'text-danger border-danger/40 bg-danger/10' };
  return { label: `${ord} — Zone Noire`, cls: 'text-muted border-border bg-surface' };
}

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
                {sorted.map((e, i) => {
                  const lpmBadge = e.format === 'lpm' && e.finishRank ? lpmRankBadge(e.finishRank) : null;
                  return (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted text-xs">{e.year ?? '—'}</span>
                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${lpmBadge ? lpmBadge.cls : RESULT_COLOR[e.result]}`}>
                      {lpmBadge ? lpmBadge.label : RESULT_LABEL[e.result]}
                    </span>
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
