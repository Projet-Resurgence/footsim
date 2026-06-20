import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { RosterTable } from '@/components/team/RosterTable';
import { PlayerEdit } from '@/components/team/PlayerEdit';
import { TacticsPanel } from '@/components/team/TacticsPanel';
import type { Player, Team, TeamTactics, Culture, Continent } from '@/lib/types';
import { CULTURE_LABEL, CONTINENT_LABEL, CULTURES_BY_CONTINENT } from '@/lib/types';
import { useTeams } from '@/stores/teams';
import { useLeagues as useLeaguesStore } from '@/stores/leagues';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import type { CultureWeight } from '@/lib/gen/names';

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
  const [publishing, setPublishing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteCount, setDeleteCount] = useState(1);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'roster' | 'tactique' | 'noms' | 'infos' | 'leagues'>('roster');
  const [nameWeights, setNameWeights] = useState<CultureWeight[]>([]);
  const [renamingAll, setRenamingAll] = useState(false);
  const [regenStrength, setRegenStrength] = useState(false);
  const [newStrength, setNewStrength] = useState<number | null>(null);
  const [editCultures, setEditCultures] = useState<CultureWeight[] | null>(null);
  const [editContinent, setEditContinent] = useState<Continent[]>([]);

  useEffect(() => {
    if (!ownerId) return;
    setLoading(true);
    fetchTeam(slug, ownerId, effectivePat)
      .then((res) => {
        if (!res) toast('error', 'Équipe introuvable.');
        setData(res);
        setDirty(false);
      })
      .catch((err) => toast('error', String(err)))
      .finally(() => setLoading(false));
  }, [slug, ownerId, effectivePat, fetchTeam]);

  function mutate(next: { team: Team; players: Player[] }) {
    setData(next);
    setDirty(true);
  }

  async function publish() {
    if (!data) return;
    setPublishing(true);
    try {
      await saveTeam(data.team, data.players, effectivePat);
      setDirty(false);
      toast('success', 'Publié.');
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

  async function renameAll() {
    if (!data || nameWeights.length === 0) return;
    const total = nameWeights.reduce((s, c) => s + c.weight, 0);
    if (total === 0) return;
    setRenamingAll(true);
    try {
      const { pickNameMixed } = await import('@/lib/gen/names');
      const players = data.players.map((p) => ({ ...p, ...pickNameMixed(nameWeights) }));
      mutate({ team: data.team, players });
      toast('success', `${players.length} noms régénérés.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setRenamingAll(false);
    }
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

  async function saveTactics(tactics: TeamTactics) {
    if (!data) return;
    mutate({ team: { ...data.team, tactics }, players: data.players });
    toast('success', 'Tactique enregistrée.');
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
    setTab('infos');
  }

  function saveInfos() {
    if (!editCultures || editCultures.length === 0) return;
    const primary = editCultures[0].culture;
    mutate({
      team: { ...team, culture: primary, cultures: editCultures, continent: editContinent[0] ?? team.continent, continents: editContinent.length > 0 ? editContinent : undefined },
      players,
    });
  }

  return (
    <div className="space-y-8">
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
          {dirty && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warning">Modifications non publiées</span>
              <Button size="sm" onClick={publish} disabled={publishing}>
                {publishing ? <Spinner className="mr-1" /> : null}
                Publier
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

      {/* Sticky publish bar when dirty */}
      {dirty && (
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-4 py-2">
          <span className="text-sm text-warning">
            Modifications non publiées — les changements n'existent que localement.
          </span>
          <Button size="sm" onClick={publish} disabled={publishing}>
            {publishing ? <Spinner className="mr-1" /> : null}
            Publier
          </Button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(['roster', 'noms', 'tactique', 'infos', 'leagues'] as const).map((t) => (
          <button
            key={t}
            onClick={() => t === 'infos' ? openInfos() : setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'roster' ? 'Roster' : t === 'noms' ? 'Noms' : t === 'tactique' ? 'Tactique' : t === 'infos' ? 'Cultures' : 'Championnats'}
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

      {tab === 'noms' && (
        <NameMixPanel
          weights={nameWeights}
          onChange={setNameWeights}
          onApply={renameAll}
          busy={renamingAll}
          playerCount={players.length}
        />
      )}

      {tab === 'tactique' && (
        <section className="space-y-4">
          <h2 className="font-display text-xl">Tactique</h2>
          <TacticsPanel team={team} players={players} onSave={saveTactics} />
        </section>
      )}

      {tab === 'infos' && editCultures !== null && (
        <CultureEditPanel
          cultures={editCultures}
          continents={editContinent}
          onChange={setEditCultures}
          onChangeContinents={setEditContinent}
          onSave={saveInfos}
        />
      )}

      {tab === 'leagues' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Championnats</h2>
            <Link to={`/dashboard/teams/${team.slug}/leagues/new`}>
              <Button size="sm">+ Nouveau championnat</Button>
            </Link>
          </div>
          <LeagueListInline nationSlug={team.slug} pat={effectivePat} />
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

function CultureEditPanel({
  cultures,
  continents,
  onChange,
  onChangeContinents,
  onSave,
}: {
  cultures: CultureWeight[];
  continents: Continent[];
  onChange: (w: CultureWeight[]) => void;
  onChangeContinents: (c: Continent[]) => void;
  onSave: () => void;
}) {
  const total = cultures.reduce((s, c) => s + c.weight, 0);

  function toggleContinent(ct: Continent) {
    if (continents.includes(ct)) {
      if (continents.length === 1) return;
      const next = continents.filter((c) => c !== ct);
      onChangeContinents(next);
      const valid = new Set(next.flatMap((c) => CULTURES_BY_CONTINENT[c]));
      const kept = cultures.filter((w) => valid.has(w.culture));
      onChange(kept.length > 0 ? kept : [{ culture: CULTURES_BY_CONTINENT[next[0]][0], weight: 50 }]);
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
      onChange([...cultures, { culture: c, weight: 50 }]);
    }
  }

  function setWeight(c: Culture, value: number) {
    onChange(cultures.map((w) => (w.culture === c ? { ...w, weight: value } : w)));
  }

  function distribute() {
    const equal = Math.round(100 / cultures.length);
    onChange(cultures.map((w, i) => ({
      ...w,
      weight: i === cultures.length - 1 ? 100 - equal * (cultures.length - 1) : equal,
    })));
  }

  const displayContinents = continents.length > 0 ? continents : (Object.keys(CULTURES_BY_CONTINENT) as Continent[]);

  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h2 className="mb-1 font-display text-xl">Cultures & Continents</h2>
        <p className="text-sm text-muted">
          Modifie les cultures de cette équipe. Les changements n'affectent pas les noms existants — utilise l'onglet Noms pour régénérer.
        </p>
      </div>

      {/* Continents (max 2) */}
      <div className="block text-sm">
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
              {displayContinents.length > 1 && (
                <div className="mb-1 px-1 text-xs uppercase tracking-widest text-muted">
                  {CONTINENT_LABEL[ct]}
                </div>
              )}
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
                  type="range" min={1} max={200} value={cw.weight}
                  onChange={(e) => setWeight(cw.culture, Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            );
          })}
        </div>
      )}

      <Button onClick={onSave} disabled={cultures.length === 0}>
        Enregistrer (non publié)
      </Button>
    </section>
  );
}

function NameMixPanel({
  weights,
  onChange,
  onApply,
  busy,
  playerCount,
}: {
  weights: CultureWeight[];
  onChange: (w: CultureWeight[]) => void;
  onApply: () => void;
  busy: boolean;
  playerCount: number;
}) {
  const selected = weights.map((w) => w.culture);
  const total = weights.reduce((s, c) => s + c.weight, 0);

  function toggleCulture(culture: Culture) {
    if (selected.includes(culture)) {
      onChange(weights.filter((w) => w.culture !== culture));
    } else {
      onChange([...weights, { culture, weight: 50 }]);
    }
  }

  function setWeight(culture: Culture, value: number) {
    onChange(weights.map((w) => (w.culture === culture ? { ...w, weight: value } : w)));
  }

  function distribute() {
    if (weights.length === 0) return;
    const equal = Math.round(100 / weights.length);
    onChange(weights.map((w, i) => ({ ...w, weight: i === weights.length - 1 ? 100 - equal * (weights.length - 1) : equal })));
  }

  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h2 className="mb-1 font-display text-xl">Régénération des noms</h2>
        <p className="text-sm text-muted">
          Sélectionne une ou plusieurs cultures et définis leur part dans l'équipe. Les noms sont remplacés, les stats restent inchangées.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted">
            Cultures sélectionnées ({weights.length})
          </span>
          {weights.length > 1 && (
            <button onClick={distribute} className="text-xs text-accent transition-colors hover:text-accent/70">
              Répartir également
            </button>
          )}
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {(Object.keys(CULTURES_BY_CONTINENT) as Continent[]).map((continent) => (
            <div key={continent}>
              <div className="mb-1 px-1 text-xs uppercase tracking-widest text-muted">
                {CONTINENT_LABEL[continent]}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CULTURES_BY_CONTINENT[continent].map((c) => {
                  const active = selected.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleCulture(c)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        active ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-border/70'
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

      {weights.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
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
                  type="range"
                  min={1}
                  max={200}
                  value={cw.weight}
                  onChange={(e) => setWeight(cw.culture, Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            );
          })}
          <div className="pt-1 text-xs text-muted">
            {weights.map((cw) => {
              const pct = total > 0 ? Math.round((cw.weight / total) * 100) : 0;
              return `${CULTURE_LABEL[cw.culture]} ${pct}%`;
            }).join(' · ')}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={onApply}
          disabled={busy || weights.length === 0 || playerCount === 0}
          size="lg"
        >
          {busy && <Spinner className="mr-2" />}
          Régénérer les {playerCount} noms
        </Button>
        {weights.length === 0 && (
          <span className="text-sm text-muted">Sélectionne au moins une culture</span>
        )}
      </div>
    </section>
  );
}

function LeagueListInline({ nationSlug, pat }: { nationSlug: string; pat: string | null }) {
  const fetchLeagues = useLeaguesStore((s) => s.fetchLeagues);
  const leagues = useLeaguesStore((s) => s.leagues);
  const loading = useLeaguesStore((s) => s.loading);

  useEffect(() => {
    fetchLeagues(nationSlug, pat);
  }, [nationSlug, pat, fetchLeagues]);

  if (loading) return <div className="flex items-center gap-2 text-muted"><Spinner /> Chargement…</div>;
  if (leagues.length === 0) return <p className="text-muted">Aucun championnat. Crée-en un.</p>;

  return (
    <div className="space-y-2">
      {leagues.map((l) => (
        <Link
          key={l.id}
          to={`/dashboard/leagues/${encodeURIComponent(l.nationSlug + '/' + l.id)}`}
          className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm transition-colors hover:border-accent/40"
        >
          <span className="font-medium">{l.name}</span>
          <span className="text-muted">{l.divisions.length} division{l.divisions.length > 1 ? 's' : ''} · {l.divisions.reduce((s, d) => s + d.clubs.length, 0)} clubs</span>
        </Link>
      ))}
    </div>
  );
}
