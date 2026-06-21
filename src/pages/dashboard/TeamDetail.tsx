import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { RosterTable } from '@/components/team/RosterTable';
import { PlayerEdit } from '@/components/team/PlayerEdit';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import { TacticsSummary } from '@/components/team/TacticsSummary';
import type { Player, SavedTactic, Team, TeamTactics, Culture, Continent } from '@/lib/types';
import { CULTURE_LABEL, CONTINENT_LABEL, CULTURES_BY_CONTINENT } from '@/lib/types';
import { FlagUpload } from '@/components/team/FlagUpload';
import { Input } from '@/components/ui/Input';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import type { CultureWeight } from '@/lib/gen/names';
import { generateCoach, COACH_TRAIT_LABEL, COACH_TRAIT_DESCRIPTION, type Coach } from '@/lib/gen/coach';

const ADD_COUNTS = [100, 200, 500, 1000];

export default function TeamDetail() {
  const { slug = '' } = useParams();
  const { ownerId, pat: effectivePat } = useBackendArgs();
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const saveTeam = useTeams((s) => s.saveTeam);
  const removeTeam = useTeams((s) => s.removeTeam);
  const navigate = useNavigate();

  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [unpublished, setUnpublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteCount, setDeleteCount] = useState(1);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'roster' | 'tactique' | 'entraineur' | 'infos'>('roster');
  const [savedTactics, setSavedTactics] = useState<SavedTactic[]>([]);
  const [activeTacticId, setActiveTacticId] = useState<string | undefined>();
  const [editingTacticId, setEditingTacticId] = useState<string | null>(null);
const [regenStrength, setRegenStrength] = useState(false);
  const [newStrength, setNewStrength] = useState<number | null>(null);
  const [editCultures, setEditCultures] = useState<CultureWeight[] | null>(null);
  const [editContinent, setEditContinent] = useState<Continent[]>([]);
  const [editName, setEditName] = useState('');
  const [editFlag, setEditFlag] = useState<string | null>(null);
  const [editStrength, setEditStrength] = useState(60);
  const [editManagerId, setEditManagerId] = useState('');

  useEffect(() => {
    if (!ownerId) return;
    setLoading(true);
    (async () => {
      try {
        // IDB first (has unsaved local edits), fallback to GitHub
        const local = await fetchTeam(slug, ownerId, null);
        if (local) {
          // If GitHub version exists too, merge: prefer local data but keep publishedAt from GH
          if (effectivePat) {
            const remote = await fetchTeam(slug, ownerId, effectivePat).catch(() => null);
            if (remote && remote.team.publishedAt) {
              const merged = { ...local, team: { ...local.team, publishedAt: remote.team.publishedAt } };
              setData(merged);
              setUnpublished(!merged.team.publishedAt);
            } else {
              setData(local);
              setUnpublished(true);
            }
          } else {
            setData(local);
            setUnpublished(!local.team.publishedAt);
          }
          setDirty(false);
          return;
        }
        // No local copy — fetch from GitHub
        const res = await fetchTeam(slug, ownerId, effectivePat);
        if (!res) toast('error', 'Équipe introuvable.');
        setData(res);
        setUnpublished(!res?.team.publishedAt);
        setDirty(false);
      } catch (err) {
        toast('error', String(err));
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, ownerId, effectivePat]);

  // Init savedTactics when team data first loads
  useEffect(() => {
    if (!data) return;
    const team = data.team;
    const existing = team.savedTactics ?? [];
    if (existing.length > 0) {
      setSavedTactics(existing);
      setActiveTacticId(team.activeTacticId ?? existing[0]?.id);
    } else if (team.tactics) {
      const seeded: SavedTactic = { ...team.tactics, id: crypto.randomUUID(), name: 'Tactique de base' };
      setSavedTactics([seeded]);
      setActiveTacticId(seeded.id);
    }
  // only on initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.team.id]);

  function mutate(next: { team: Team; players: Player[] }) {
    setData(next);
    setDirty(true);
    setUnpublished(true);
  }

  function mutateSavedTactics(next: SavedTactic[], activeId?: string) {
    setSavedTactics(next);
    setActiveTacticId(activeId);
    if (!data) return;
    mutate({ ...data, team: { ...data.team, savedTactics: next, activeTacticId: activeId } });
  }

  async function saveLocal() {
    if (!data) return;
    setPublishing(true);
    try {
      await saveTeam({ ...data.team, ownerId }, data.players, null);
      setDirty(false);
      setUnpublished(true);
      toast('success', 'Enregistré localement.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setPublishing(false);
    }
  }

  async function publish() {
    if (!data) return;
    setPublishing(true);
    try {
      await saveTeam(data.team, data.players, effectivePat);
      setDirty(false);
      setUnpublished(false);
      toast('success', 'Publié sur GitHub.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setPublishing(false);
    }
  }

  async function addPlayers(extra: number) {
    if (!data) return;
    setAdding(true);
    try {
      const { generatePlayers } = await import('@/lib/gen/players');
      const newPlayers = generatePlayers({
        count: extra,
        culture: data.team.culture,
        globalStrength: data.team.globalStrength,
      });
      const players = [...data.players, ...newPlayers];
      mutate({ team: { ...data.team, playerCount: players.length }, players });
      toast('success', `+${extra} joueurs.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setAdding(false);
    }
  }

  function deleteWeakest(n: number) {
    if (!data || n <= 0) return;
    const sorted = [...data.players].sort((a, b) => a.overall - b.overall);
    const toRemove = new Set(sorted.slice(0, Math.min(n, sorted.length)).map((p) => p.id));
    const players = data.players.filter((p) => !toRemove.has(p.id));
    mutate({ team: { ...data.team, playerCount: players.length }, players });
    toast('success', `${toRemove.size} joueur(s) supprimé(s).`);
  }

  function savePlayer(next: Player) {
    if (!data) return;
    const players = data.players.map((p) => (p.id === next.id ? next : p));
    mutate({ team: data.team, players });
    setEditingId(null);
    toast('success', 'Joueur mis à jour.');
  }

  function deletePlayer(id: string) {
    if (!data) return;
    const players = data.players.filter((p) => p.id !== id);
    mutate({ team: { ...data.team, playerCount: players.length }, players });
    setEditingId(null);
    toast('success', 'Joueur supprimé.');
  }

async function applyNewStrength(strength: number) {
    if (!data) return;
    setRegenStrength(true);
    try {
      const { generatePlayers } = await import('@/lib/gen/players');
      const regen = generatePlayers({
        count: data.players.length,
        culture: data.team.culture,
        globalStrength: strength,
      });
      const players = data.players.map((p, i) => ({
        ...regen[i % regen.length],
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        age: p.age,
        preferredFoot: p.preferredFoot,
      }));
      mutate({ team: { ...data.team, globalStrength: strength }, players });
      setNewStrength(null);
      toast('success', `Force mise à jour : ${strength}.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setRegenStrength(false);
    }
  }

  const tacticsImportRef = useRef<HTMLInputElement>(null);
  const namesImportRef = useRef<HTMLInputElement>(null);

  function importNames(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string) as { id: string; firstName: string; lastName: string }[];
        const byId = new Map(json.map((r) => [r.id, r]));
        const players = data.players.map((p) => {
          const r = byId.get(p.id);
          return r ? { ...p, firstName: r.firstName, lastName: r.lastName } : p;
        });
        const patched = json.filter((r) => byId.has(r.id) && data.players.some((p) => p.id === r.id)).length;
        mutate({ team: data.team, players });
        toast('success', `${patched} noms appliqués.`);
      } catch {
        toast('error', 'Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function saveTactics(tactics: TeamTactics) {
    if (!data) return;
    const editId = editingTacticId;
    if (editId) {
      const next = savedTactics.map((t) => t.id === editId ? { ...t, ...tactics } : t);
      mutateSavedTactics(next, activeTacticId);
      setEditingTacticId(null);
      toast('success', 'Tactique mise à jour.');
    } else {
      const name = `Tactique ${savedTactics.length + 1}`;
      const newT: SavedTactic = { ...tactics, id: crypto.randomUUID(), name };
      const next = [...savedTactics, newT];
      mutateSavedTactics(next, newT.id);
      setEditingTacticId(null);
      toast('success', `"${name}" sauvegardée.`);
    }
  }

  function activateTactic(id: string) { mutateSavedTactics(savedTactics, id); }
  function deleteTacticEntry(id: string) {
    const next = savedTactics.filter((t) => t.id !== id);
    mutateSavedTactics(next, activeTacticId === id ? (next[0]?.id ?? undefined) : activeTacticId);
  }
  function renameTactic(id: string, name: string) {
    mutateSavedTactics(savedTactics.map((t) => t.id === id ? { ...t, name } : t), activeTacticId);
  }

  function exportTactics() {
    if (!data) { toast('error', 'Aucune donnée.'); return; }
    const payload = { teamName: data.team.name, savedTactics, activeTacticId };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tactiques-${data.team.slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function publishTactics() {
    if (!data || !effectivePat) return;
    setPublishing(true);
    try {
      const teamToPublish = { ...data.team, savedTactics, activeTacticId };
      await saveTeam(teamToPublish, data.players, effectivePat);
      setDirty(false);
      setUnpublished(false);
      toast('success', 'Tactiques publiées sur GitHub.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setPublishing(false);
    }
  }

  function importTactics(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (Array.isArray(json.savedTactics)) {
          const imported: SavedTactic[] = json.savedTactics.map((t: SavedTactic) => ({
            ...t,
            id: t.id ?? crypto.randomUUID(),
            name: t.name ?? 'Importée',
            lineup: Array.isArray(t.lineup) ? t.lineup.map((p: { id: string } | string) => typeof p === 'string' ? p : p.id) : [],
          }));
          const existing = new Set(savedTactics.map((t) => t.id));
          const toAdd = imported.filter((t) => !existing.has(t.id));
          mutateSavedTactics([...savedTactics, ...toAdd], activeTacticId);
          toast('success', `${toAdd.length} tactique(s) importée(s).`);
        } else {
          // legacy single tactic
          const tactics: TeamTactics = {
            formation: json.formation,
            style: json.style,
            lineup: Array.isArray(json.lineup) ? json.lineup.map((p: { id: string } | string) => typeof p === 'string' ? p : p.id) : [],
            formationLabel: json.formationLabel,
            customStyles: json.customStyles ?? [],
            activeCustomStyleId: json.activeCustomStyleId,
          };
          const newT: SavedTactic = { ...tactics, id: crypto.randomUUID(), name: json.tacticName ?? `Importée ${savedTactics.length + 1}` };
          mutateSavedTactics([...savedTactics, newT], activeTacticId);
          toast('success', `"${newT.name}" ajoutée.`);
        }
      } catch {
        toast('error', 'Fichier tactique invalide.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function deleteTeamHandler() {
    if (!data) return;
    setDeleting(true);
    try {
      await removeTeam(data.team.slug, ownerId, effectivePat);
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

  // initialize culture/continent edit state when switching to infos tab
  function openInfos() {
    setEditCultures(team.cultures ?? [{ culture: team.culture, weight: 50 }]);
    setEditContinent(team.continents ?? (team.continent ? [team.continent] : []));
    setEditName(team.name);
    setEditFlag(team.flag);
    setEditStrength(team.globalStrength);
    setEditManagerId(team.managerDiscordId ?? '');
    setTab('infos');
  }

  function saveInfos() {
    if (!editCultures || editCultures.length === 0) return;
    if (!editName.trim()) { toast('error', 'Nom requis.'); return; }
    const primary = editCultures[0].culture;
    mutate({
      team: {
        ...team,
        name: editName.trim(),
        flag: editFlag ?? team.flag,
        globalStrength: editStrength,
        culture: primary,
        cultures: editCultures,
        continent: editContinent[0] ?? team.continent,
        continents: editContinent.length > 0 ? editContinent : undefined,
        managerDiscordId: editManagerId.trim() || undefined,
      },
      players,
    });
  }

  return (
    <div className="space-y-8">
      <button
        className="text-sm text-muted hover:text-text"
        onClick={async () => {
          if (dirty && data) await saveTeam({ ...data.team, ownerId }, data.players, null);
          navigate('/dashboard/teams');
        }}
      >
        ← Équipes
      </button>
      {/* Header */}
      <div className="flex items-start gap-6">
        <img src={team.flag} alt="" className="h-24 w-24 object-cover" />
        <div className="flex-1 space-y-2">
          <h1 className="font-display text-4xl">{team.name}</h1>
          <p className="text-sm text-muted">
            {team.cultures && team.cultures.length > 1
              ? team.cultures.map((cw) => CULTURE_LABEL[cw.culture]).join(', ')
              : CULTURE_LABEL[team.culture]}
            {(team.continents ?? (team.continent ? [team.continent] : [])).map((c) => CONTINENT_LABEL[c]).join(' · ')
              ? ` · ${(team.continents ?? (team.continent ? [team.continent] : [])).map((c) => CONTINENT_LABEL[c]).join(' · ')}`
              : ''}
            {' '}· Force {team.globalStrength} ·{' '}
            {team.playerCount} joueurs · Formation {team.formation}
          </p>
          {newStrength === null ? (
            <button
              onClick={() => setNewStrength(team.globalStrength)}
              className="text-xs text-accent transition-colors hover:text-accent/70"
            >
              Regénérer la note…
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={100}
                value={newStrength}
                onChange={(e) => setNewStrength(Number(e.target.value))}
                className="w-32 accent-[var(--accent)]"
              />
              <span className="w-6 text-sm font-medium tabular-nums">{newStrength}</span>
              <Button size="sm" onClick={() => applyNewStrength(newStrength)} disabled={regenStrength}>
                {regenStrength ? <Spinner className="mr-1" /> : null}
                Appliquer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewStrength(null)} disabled={regenStrength}>
                Annuler
              </Button>
            </div>
          )}
        </div>

        {/* Publish / delete zone */}
        <div className="flex flex-col items-end gap-2">
          {(dirty || unpublished) && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warning">{dirty ? 'Non enregistré' : 'Non publié'}</span>
              {dirty && (
                <Button size="sm" variant="ghost" onClick={saveLocal} disabled={publishing}>
                  {publishing ? <Spinner className="mr-1" /> : null}
                  Enregistrer
                </Button>
              )}
              <Button size="sm" onClick={publish} disabled={publishing || !effectivePat}>
                {publishing ? <Spinner className="mr-1" /> : null}
                ↑ GitHub
              </Button>
            </div>
          )}
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
              Supprimer l'équipe
            </Button>
          )}
        </div>
      </div>

      {/* Sticky save/publish bar */}
      {(dirty || unpublished) && (
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-4 py-2">
          <span className="text-sm text-warning">
            {dirty ? 'Modifications non enregistrées.' : 'Modifications locales non publiées sur GitHub.'}
          </span>
          <div className="flex gap-2">
            {dirty && (
              <Button size="sm" variant="ghost" onClick={saveLocal} disabled={publishing}>
                {publishing ? <Spinner className="mr-1" /> : null}
                Enregistrer
              </Button>
            )}
            <Button size="sm" onClick={publish} disabled={publishing || !effectivePat}>
              {publishing ? <Spinner className="mr-1" /> : null}
              ↑ GitHub
            </Button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {(['roster', 'tactique', 'entraineur'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'roster' ? 'Roster' : t === 'tactique' ? 'Tactique' : 'Entraîneur'}
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={openInfos}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${tab === 'infos' ? 'text-accent' : 'text-muted hover:text-text'}`}
            title="Paramètres de l'équipe"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
            </svg>
            Paramètres
          </button>
        </div>
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
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => namesImportRef.current?.click()}>
              ↑ Importer noms (JSON)
            </Button>
            <input ref={namesImportRef} type="file" accept=".json" className="hidden" onChange={importNames} />
          </div>
          <RosterTable players={players} onSelect={setEditingId} />
        </section>
      )}

      {tab === 'tactique' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Tactique</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={exportTactics}>↑ Exporter JSON</Button>
              <Button size="sm" variant="ghost" onClick={() => tacticsImportRef.current?.click()}>↓ Importer JSON</Button>
              <input ref={tacticsImportRef} type="file" accept=".json" className="hidden" onChange={importTactics} />
              <Button size="sm" onClick={publishTactics} disabled={publishing || !effectivePat || savedTactics.length === 0}>
                {publishing ? <Spinner className="mr-1" /> : null}
                ↑ Publier GitHub
              </Button>
            </div>
          </div>

          <TacticsSummary
            savedTactics={savedTactics}
            activeTacticId={activeTacticId}
            players={players}
            onActivate={activateTactic}
            onDelete={deleteTacticEntry}
            onRename={renameTactic}
          />

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">
                {editingTacticId
                  ? `Modifier : ${savedTactics.find((t) => t.id === editingTacticId)?.name ?? ''}`
                  : 'Nouvelle tactique'}
              </span>
              <div className="flex gap-1 flex-wrap">
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
        </section>
      )}

      {tab === 'entraineur' && (
        <CoachPanel
          coach={team.coach ?? null}
          suspended={team.coachSuspended ?? false}
          cultures={team.cultures ?? [{ culture: team.culture, weight: 50 }]}
          onSave={(c: Coach) => mutate({ team: { ...team, coach: c }, players })}
          onToggleSuspension={() => mutate({ team: { ...team, coachSuspended: !team.coachSuspended }, players })}
        />
      )}

      {tab === 'infos' && editCultures !== null && (
        <CultureEditPanel
          name={editName}
          onName={setEditName}
          flag={editFlag}
          onFlag={setEditFlag}
          strength={editStrength}
          onStrength={setEditStrength}
          cultures={editCultures}
          continents={editContinent}
          onChange={setEditCultures}
          onChangeContinents={setEditContinent}
          managerId={editManagerId}
          onManagerId={setEditManagerId}
          onSave={saveInfos}
        />
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

function CoachPanel({ coach, suspended, cultures, onSave, onToggleSuspension }: {
  coach: Coach | null;
  suspended: boolean;
  cultures: CultureWeight[];
  onSave: (c: Coach) => void;
  onToggleSuspension: () => void;
}) {
  const [current, setCurrent] = useState<Coach | null>(coach);

  function regen() {
    const c = generateCoach(cultures);
    setCurrent(c);
    onSave(c);
  }

  if (!current) {
    return (
      <section className="space-y-4">
        <h2 className="font-display text-xl">Entraîneur</h2>
        <p className="text-sm text-muted">Aucun entraîneur généré pour cette équipe.</p>
        <Button onClick={regen}>Générer un entraîneur</Button>
      </section>
    );
  }

  const statKeys = ['motivation', 'tactique', 'offensive', 'defensif', 'mentalite', 'gestion'] as const;
  const statLabel: Record<typeof statKeys[number], string> = {
    motivation: 'Motivation', tactique: 'Tactique', offensive: 'Offensive',
    defensif: 'Défensif', mentalite: 'Mentalité', gestion: 'Gestion',
  };

  const pos = current.positiveTraits ?? (current.trait ? [current.trait] : []);
  const neg = current.negativeTraits ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Entraîneur</h2>
        <Button size="sm" variant="ghost" onClick={regen}>Regénérer</Button>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`font-display text-2xl ${suspended ? 'line-through text-muted' : ''}`}>{current.firstName} {current.lastName}</div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted">
              <span>Overall {current.overall} / 100</span>
              {suspended && <span className="rounded bg-danger/10 px-2 py-0.5 text-xs text-danger border border-danger/30">🟥 Suspendu prochain match</span>}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onToggleSuspension}>
            {suspended ? 'Lever suspension' : 'Suspendre'}
          </Button>
        </div>

        {/* Traits */}
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
          {pos.length === 0 && neg.length === 0 && (
            <p className="text-xs text-muted italic">Aucun trait particulier.</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 border-t border-border pt-4">
          {statKeys.map((k) => (
            <div key={k} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{statLabel[k]}</span>
                <span className="tabular-nums font-semibold">{current.stats[k]}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(current.stats[k] / 20) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CultureEditPanel({
  name, onName, flag, onFlag, strength, onStrength,
  cultures, continents, onChange, onChangeContinents, managerId, onManagerId, onSave,
}: {
  name: string;
  onName: (v: string) => void;
  flag: string | null;
  onFlag: (v: string | null) => void;
  strength: number;
  onStrength: (v: number) => void;
  cultures: CultureWeight[];
  continents: Continent[];
  onChange: (w: CultureWeight[]) => void;
  onChangeContinents: (c: Continent[]) => void;
  managerId: string;
  onManagerId: (v: string) => void;
  onSave: () => void;
}) {
  const total = cultures.reduce((s, c) => s + c.weight, 0);

  function toggleContinent(ct: Continent) {
    if (continents.includes(ct)) {
      if (continents.length === 1) return;
      onChangeContinents(continents.filter((c) => c !== ct));
    } else {
      if (continents.length >= 2) return;
      onChangeContinents([...continents, ct]);
    }
  }

  function toggleCulture(c: Culture) {
    if (cultures.some((w) => w.culture === c)) {
      if (cultures.length === 1) return;
      onChange(cultures.filter((w) => w.culture !== c));
    } else {
    const n = cultures.length + 1;
      const eq = Math.round(100 / n);
      onChange([...cultures.map((w) => ({ ...w, weight: eq })), { culture: c, weight: 100 - eq * (n - 1) }]);
    }
  }

  function setWeight(c: Culture, value: number) {
    const clamped = Math.max(1, Math.min(100, value));
    const others = cultures.filter((w) => w.culture !== c);
    const remaining = Math.max(0, 100 - clamped);
    const otherTotal = others.reduce((s, w) => s + w.weight, 0);
    onChange(cultures.map((w) => {
      if (w.culture === c) return { ...w, weight: clamped };
      const share = otherTotal > 0 ? Math.round((w.weight / otherTotal) * remaining) : Math.round(remaining / others.length);
      return { ...w, weight: Math.max(1, share) };
    }));
  }

  function distribute() {
    const equal = Math.round(100 / cultures.length);
    onChange(cultures.map((w, i) => ({
      ...w,
      weight: i === cultures.length - 1 ? 100 - equal * (cultures.length - 1) : equal,
    })));
  }

  const displayContinents = Object.keys(CULTURES_BY_CONTINENT) as Continent[];

  return (
    <section className="max-w-2xl space-y-6">
      <h2 className="font-display text-xl">Paramètres</h2>

      {/* Nom */}
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Nom du pays</span>
        <Input value={name} onChange={(e) => onName(e.target.value)} placeholder="Nom de l'équipe" />
      </label>

      {/* Drapeau */}
      <div className="block text-sm">
        <span className="mb-1 block text-muted">Drapeau (150×150)</span>
        <FlagUpload value={flag} onChange={(v) => onFlag(v || null)} />
      </div>

      {/* Force globale */}
      <label className="block text-sm">
        <span className="mb-1 block text-muted">
          Force globale : <span className="text-text">{strength}</span>
        </span>
        <input
          type="range" min={1} max={100} value={strength}
          onChange={(e) => onStrength(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </label>

      <hr className="border-border" />

      {/* Continents (max 2) */}
      <div className="block text-sm">
        <span className="mb-2 block font-medium">Cultures & Continents</span>
        <p className="mb-3 text-xs text-muted">Les changements n'affectent pas les noms existants — utilise l'onglet Noms pour régénérer.</p>
        <span className="mb-1 block text-muted">Continents <span className="text-xs opacity-60">(1 ou 2)</span></span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CULTURES_BY_CONTINENT) as Continent[]).map((ct) => {
            const active = continents.includes(ct);
            const disabled = !active && continents.length >= 2;
            return (
              <button
                key={ct}
                onClick={() => toggleContinent(ct)}
                disabled={disabled}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : disabled
                    ? 'cursor-not-allowed border-border opacity-40'
                    : 'border-border hover:border-accent/40'
                }`}
              >
                {CONTINENT_LABEL[ct]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Culture grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted">
            Cultures sélectionnées ({cultures.length})
          </span>
          {cultures.length > 1 && (
            <button onClick={distribute} className="text-xs text-accent transition-colors hover:text-accent/70">
              Répartir également
            </button>
          )}
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {displayContinents.map((ct) => (
            <div key={ct}>
              <div className="mb-1 px-1 text-xs uppercase tracking-widest text-muted">
                {CONTINENT_LABEL[ct]}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {CULTURES_BY_CONTINENT[ct].map((c) => {
                  const active = cultures.some((w) => w.culture === c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleCulture(c)}
                      className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        active ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-accent/40'
                      }`}
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

      {/* Weight sliders */}
      {cultures.length > 1 && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-widest text-muted">Proportions</div>
          {cultures.map((cw) => {
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

      <div className="space-y-2 border-t border-border pt-4">
        <label className="block text-sm text-muted">Discord ID du manager</label>
        <Input
          value={managerId}
          onChange={(e) => onManagerId(e.target.value)}
          placeholder="ex: 772821169664426025"
          className="max-w-xs"
        />
        <p className="text-xs text-muted">
          Ce joueur pourra se connecter et modifier la tactique de cette équipe.
        </p>
      </div>

      <Button onClick={onSave} disabled={cultures.length === 0}>
        Enregistrer (non publié)
      </Button>
    </section>
  );
}

