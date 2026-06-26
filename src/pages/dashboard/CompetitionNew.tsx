import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';
import { useCompetition } from '@/stores/competition';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import {
  generateLeagueMatches,
  generateCupBracket,
  generateGroupsKnockoutFromGroups,
  generateLPMMatches,
  buildInitialStandings,
} from '@/lib/competition/scheduler';
import { FORMAT_LABEL, FORMAT_DESCRIPTION, COMPETITION_KIND_LABEL, COMPETITION_SCOPE_LABEL } from '@/lib/competition/types';
import { CULTURE_CONTINENT, CONTINENT_LABEL, type Continent } from '@/lib/types';
import type { CompetitionFormat, CompetitionConfig, Competition, CompetitionKind, CompetitionScope } from '@/lib/competition/types';
import { COMPETITION_IMPORTANCE_LABEL } from '@/lib/competition/types';
import type { CompetitionImportance } from '@/lib/competition/types';
import type { MatchRules } from '@/lib/sim/types';
import { DEFAULT_RULES } from '@/lib/sim/types';
import { buildPots, conductDraw, isEvenTeamCount } from '@/lib/competition/draw';
import { DrawCeremony } from '@/components/competition/DrawCeremony';
import type { Injury, Suspension } from '@/lib/competition/injuries';

const PRESETS_KEY = 'footsim.competition.presets';

type CompetitionPreset = {
  id: string;
  label: string;
  savedAt: string;
  name: string;
  format: CompetitionFormat;
  year?: number;
  kind: CompetitionKind;
  scope: CompetitionScope;
  importance?: CompetitionImportance;
  legs: 1 | 2;
  thirdPlace: boolean;
  groupsCount: number;
  qualifyPerGroup: number;
  bestThirds?: number;
  rules: MatchRules;
  knockoutRules: MatchRules;
  teamIds?: string[];
};

function loadPresets(): CompetitionPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]'); } catch { return []; }
}
function savePresets(presets: CompetitionPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export default function CompetitionNew() {
  const teams = useTeams((s) => s.teams);
  const refresh = useTeams((s) => s.refresh);
  const saveLocal = useCompetition((s) => s.saveLocal);
  const pat = useCredentials((s) => s.githubPat);
  const { ownerId, pat: effectivePat } = useBackendArgs();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [format, setFormat] = useState<CompetitionFormat>('league');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [continentFilter, setContinentFilter] = useState<Continent | 'all'>('all');
  const [legs, setLegs] = useState<1 | 2>(1);
  const [thirdPlace, setThirdPlace] = useState(false);
  const [groupsCount, setGroupsCount] = useState(4);
  const [qualifyPerGroup, setQualifyPerGroup] = useState(2);
  const [bestThirds, setBestThirds] = useState(0);
  const [rules, setRules] = useState<MatchRules>(DEFAULT_RULES);
  const [knockoutRules, setKnockoutRules] = useState<MatchRules>({ ...DEFAULT_RULES, extraTime: true, penalties: true });
  const [drawResult, setDrawResult] = useState<ReturnType<typeof conductDraw> | null>(null);
  const [hostTeamId, setHostTeamId] = useState<string>('');
  const [year, setYear] = useState<number | undefined>(undefined);
  const [kind, setKind] = useState<CompetitionKind>('officielle');
  const [scope, setScope] = useState<CompetitionScope>('internationale');
  const [importance, setImportance] = useState<CompetitionImportance | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<CompetitionPreset[]>(() => loadPresets());
  const [showPresets, setShowPresets] = useState(false);
  const [presetLabel, setPresetLabel] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [includeTeams, setIncludeTeams] = useState(false);
  const presetLabelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ownerId && teams.length === 0) refresh(ownerId, effectivePat);
  }, [pat, teams.length, refresh]);

  function currentPresetData(withTeams: boolean): Omit<CompetitionPreset, 'id' | 'label' | 'savedAt'> {
    return {
      name, format, year, kind, scope, importance,
      legs, thirdPlace, groupsCount, qualifyPerGroup, bestThirds,
      rules, knockoutRules,
      teamIds: withTeams ? [...selectedTeams] : undefined,
    };
  }

  function doSavePreset() {
    const label = presetLabel.trim();
    if (!label) return;
    const preset: CompetitionPreset = {
      id: crypto.randomUUID(),
      label,
      savedAt: new Date().toISOString(),
      ...currentPresetData(includeTeams),
    };
    const next = [preset, ...presets];
    savePresets(next);
    setPresets(next);
    setPresetLabel('');
    setSavingPreset(false);
    toast('success', `Preset "${label}" sauvegardé.`);
  }

  function applyPreset(p: CompetitionPreset) {
    setName(p.name);
    setFormat(p.format);
    setYear(p.year);
    setKind(p.kind);
    setScope(p.scope);
    setImportance(p.importance);
    setLegs(p.legs);
    setThirdPlace(p.thirdPlace);
    setGroupsCount(p.groupsCount);
    setQualifyPerGroup(p.qualifyPerGroup);
    setBestThirds(p.bestThirds ?? 0);
    setRules(p.rules);
    setKnockoutRules(p.knockoutRules);
    if (p.teamIds) setSelectedTeams(p.teamIds);
    setShowPresets(false);
    toast('success', `Preset "${p.label}" chargé.`);
  }

  function deletePreset(id: string) {
    const next = presets.filter((p) => p.id !== id);
    savePresets(next);
    setPresets(next);
  }

  function toggleTeam(id: string) {
    setSelectedTeams((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const minTeamsPerGroup = 4;
  const minTeams = format === 'lpm' ? 48 : format === 'league' ? 3 : format === 'cup' ? 2 : groupsCount * minTeamsPerGroup;
  const needsEven = format === 'groups_knockout';
  const evenOk = !needsEven || isEvenTeamCount(selectedTeams.length);
  const lpmOk = format !== 'lpm' || selectedTeams.length === 48;
  const valid = name.trim().length > 0 && selectedTeams.length >= minTeams && evenOk && lpmOk;

  function startDraw() {
    if (!valid) return;
    const selectedTeamObjs = teams.filter((t) => selectedTeams.includes(t.id));
    const host = (format === 'groups_knockout' && hostTeamId && selectedTeams.includes(hostTeamId)) ? hostTeamId : undefined;
    const pots = buildPots(selectedTeamObjs, host);
    const gc = format === 'cup' ? Math.ceil(selectedTeams.length / 2) : groupsCount;
    const result = conductDraw(pots, gc, host);
    setDrawResult(result);
  }

  async function createWithGroups(drawnGroups: Record<string, string[]>) {
    setBusy(true);
    try {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const config: CompetitionConfig = {
        legsPerMatch: legs,
        thirdPlaceMatch: thirdPlace,
        groupsCount: format === 'groups_knockout' ? groupsCount : undefined,
        qualifyPerGroup: format === 'groups_knockout' ? qualifyPerGroup : undefined,
        bestThirds: format === 'groups_knockout' && bestThirds > 0 ? bestThirds : undefined,
        matchRules: rules,
        knockoutRules: (format === 'groups_knockout' || format === 'lpm') ? knockoutRules : undefined,
      };

      let teamIds: string[];
      let matches, groups;

      if (format === 'lpm') {
        teamIds = [...selectedTeams];
        matches = generateLPMMatches(teamIds);
        groups = undefined;
      } else if (format === 'league') {
        teamIds = [...selectedTeams];
        matches = generateLeagueMatches(teamIds, legs);
        groups = undefined;
      } else if (format === 'cup') {
        // drawnGroups from cup draw = ordered pairs; flatten gives seeded order
        teamIds = Object.keys(drawnGroups).length > 0
          ? Object.values(drawnGroups).flat()
          : [...selectedTeams];
        matches = generateCupBracket(teamIds, legs, thirdPlace);
        groups = undefined;
      } else {
        // groups_knockout: drawnGroups comes from DrawCeremony
        const groupList = Object.entries(drawnGroups).map(([key, tids], i) => ({
          id: key,
          name: `Groupe ${'ABCDEFGHIJKLMNOP'[i]}`,
          teamIds: tids,
        }));
        teamIds = groupList.flatMap((g) => g.teamIds);
        const result = generateGroupsKnockoutFromGroups(groupList, qualifyPerGroup, legs, thirdPlace, bestThirds);
        matches = result.matches;
        groups = result.groups;
      }

      const teamSnapshot: Record<string, { name: string; flag: string; slug?: string; globalStrength?: number }> = {};
      for (const id of teamIds) {
        const t = teams.find((x) => x.id === id);
        if (t) teamSnapshot[id] = { name: t.name, flag: t.flag, slug: t.slug, globalStrength: t.globalStrength };
      }

      // Collect carry-over injuries/suspensions from participating teams
      const carryInjuries: Injury[] = [];
      const carrySuspensions: Suspension[] = [];
      for (const tid of teamIds) {
        const t = teams.find((x) => x.id === tid);
        if (!t) continue;
        if (t.injuries) carryInjuries.push(...t.injuries);
        if (t.suspensions) carrySuspensions.push(...t.suspensions);
      }

      const comp: Competition = {
        id,
        name: name.trim(),
        format,
        year,
        kind,
        scope,
        importance,
        teamIds,
        matches,
        groups,
        standings: buildInitialStandings(teamIds),
        playerStats: {},
        config,
        currentRound: 1,
        status: 'ongoing',
        createdAt: new Date().toISOString(),
        teamSnapshot,
        hostTeamId: ((format === 'lpm' || format === 'groups_knockout') && hostTeamId && teamIds.includes(hostTeamId)) ? hostTeamId : undefined,
        injuries: carryInjuries.length > 0 ? carryInjuries : undefined,
        suspensions: carrySuspensions.length > 0 ? carrySuspensions : undefined,
      };

      saveLocal(comp);
      toast('success', 'Compétition créée.');
      navigate(`/dashboard/competitions/${id}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!valid) return;
    if (format === 'groups_knockout' || format === 'cup') {
      startDraw();
      return;
    }
    await createWithGroups({});
  }

  function applyLPMPreset() {
    setName('Ligue Préliminaire Mondiale');
    setFormat('lpm');
    setLegs(1);
    setKnockoutRules({ ...DEFAULT_RULES, extraTime: true, penalties: true });
    const ids = teams.slice(0, 48).map((t) => t.id);
    setSelectedTeams(ids);
    setHostTeamId('');
  }

  function applyWorldCupPreset() {
    setName('Coupe du Monde');
    setFormat('groups_knockout');
    setGroupsCount(8);
    setQualifyPerGroup(2);
    setLegs(1);
    setThirdPlace(true);
    setRules({ ...DEFAULT_RULES });
    setKnockoutRules({ ...DEFAULT_RULES, extraTime: true, penalties: true });
    const ids = teams.slice(0, 32).map((t) => t.id);
    setSelectedTeams(ids);
  }

  if (drawResult) {
    const isCupDraw = format === 'cup';
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="mb-1 font-display text-4xl">Tirage au sort</h1>
          <p className="text-muted text-sm">{name}</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end rounded-lg border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-widest text-muted w-full">Paramètres finaux</div>
          <div className="text-sm text-muted">
            <span className="text-text font-medium">{kind === 'officielle' ? 'Officielle' : 'Amicale'}</span>
            {' · '}
            <span className="text-text font-medium">{scope}</span>
          </div>
          <label className="flex items-center gap-2 text-sm ml-auto">
            <span className="text-muted shrink-0">Importance CMF</span>
            <select
              className="h-8 rounded-md border border-border bg-bg px-2 text-sm"
              value={importance ?? ''}
              onChange={(e) => setImportance(e.target.value ? e.target.value as CompetitionImportance : undefined)}
            >
              <option value="">— National (défaut) —</option>
              {(Object.keys(COMPETITION_IMPORTANCE_LABEL) as CompetitionImportance[]).map((i) => (
                <option key={i} value={i}>{COMPETITION_IMPORTANCE_LABEL[i]}</option>
              ))}
            </select>
          </label>
        </div>
        <DrawCeremony
          result={drawResult}
          teams={teams.filter((t) => selectedTeams.includes(t.id))}
          groupCount={isCupDraw ? Math.ceil(selectedTeams.length / 2) : groupsCount}
          onConfirm={createWithGroups}
          knockoutMode={isCupDraw}
        />
        {busy && <div className="flex items-center gap-2 text-muted text-sm"><span className="animate-spin">⏳</span> Création…</div>}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="mb-1 font-display text-4xl">Nouvelle compétition</h1>
        <p className="text-muted">Configure le format et les équipes participantes.</p>
      </div>

      {/* Presets sauvegardés */}
      {presets.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-muted">Mes presets</div>
            <button
              type="button"
              onClick={() => setShowPresets((v) => !v)}
              className="text-xs text-accent hover:text-accent/70 transition-colors"
            >
              {showPresets ? 'Masquer' : `Afficher (${presets.length})`}
            </button>
          </div>
          {showPresets && (
            <div className="space-y-2">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.label}</div>
                    <div className="text-xs text-muted">
                      {p.name} · {p.format} · {p.kind}
                      {p.teamIds ? ` · ${p.teamIds.length} équipes` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-md border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  >
                    Charger
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePreset(p.id)}
                    className="shrink-0 text-xs text-danger hover:text-danger/70 transition-colors"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Presets built-in */}
      <div className="space-y-2">
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Ligue Préliminaire Mondiale</div>
            <div className="text-xs text-muted mt-0.5">48 équipes · 11 journées · barrages A/R · pré-remplit tout automatiquement</div>
          </div>
          <button
            type="button"
            onClick={applyLPMPreset}
            className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
          >
            Preset LPM
          </button>
        </div>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Coupe du Monde</div>
            <div className="text-xs text-muted mt-0.5">32 équipes · 8 groupes · 2 qualifiés/groupe · 8èmes → Finale · prolong. + TAB · match 3ème place</div>
          </div>
          <button
            type="button"
            onClick={applyWorldCupPreset}
            className="shrink-0 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-500/20 transition-colors"
          >
            Preset CdM
          </button>
        </div>
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="text-xs uppercase tracking-widest text-muted">Informations</div>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nom de la compétition</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Coupe des Nations" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Année (édition)</span>
          <Input
            type="number"
            value={year ?? ''}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="Ex : 2026"
            min={1900}
            max={2200}
          />
        </label>
        <div className="flex gap-3 flex-wrap">
          <label className="block text-sm flex-1 min-w-[140px]">
            <span className="mb-1 block text-muted">Statut</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as CompetitionKind)}
            >
              {(Object.keys(COMPETITION_KIND_LABEL) as CompetitionKind[]).map((k) => (
                <option key={k} value={k}>{COMPETITION_KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm flex-1 min-w-[160px]">
            <span className="mb-1 block text-muted">Type</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value as CompetitionScope)}
            >
              {(Object.keys(COMPETITION_SCOPE_LABEL) as CompetitionScope[]).map((s) => (
                <option key={s} value={s}>{COMPETITION_SCOPE_LABEL[s]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Importance CMF</span>
          <select
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={importance ?? ''}
            onChange={(e) => setImportance(e.target.value ? e.target.value as CompetitionImportance : undefined)}
          >
            <option value="">— Non défini (National par défaut) —</option>
            {(Object.keys(COMPETITION_IMPORTANCE_LABEL) as CompetitionImportance[]).map((i) => (
              <option key={i} value={i}>{COMPETITION_IMPORTANCE_LABEL[i]}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="text-xs uppercase tracking-widest text-muted">Format</div>
        <div className="grid gap-3">
          {(Object.keys(FORMAT_LABEL) as CompetitionFormat[]).map((f) => (
            <label
              key={f}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${
                format === f ? 'border-accent bg-accent/5' : 'border-border hover:border-border/80'
              }`}
            >
              <input
                type="radio"
                name="format"
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
                className="mt-0.5 shrink-0"
              />
              <div>
                <div className="font-medium">{FORMAT_LABEL[f]}</div>
                <div className="text-sm text-muted">{FORMAT_DESCRIPTION[f]}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="text-xs uppercase tracking-widest text-muted">Options du format</div>
        {format !== 'lpm' && (
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <select
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
              value={legs}
              onChange={(e) => setLegs(Number(e.target.value) as 1 | 2)}
            >
              <option value={1}>1 match aller</option>
              <option value={2}>2 matchs (aller-retour)</option>
            </select>
          </label>
        )}
        {(format === 'lpm' || format === 'groups_knockout') && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Pays hôte</span>
            <span className="text-xs text-muted block mb-2">
              {format === 'lpm'
                ? 'Si qualifié d\'office, sa place est réattribuée au suivant.'
                : 'Forcé dans le chapeau 1 et placé en tête du groupe A lors du tirage.'}
            </span>
            <select
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm w-full max-w-xs"
              value={hostTeamId}
              onChange={(e) => setHostTeamId(e.target.value)}
            >
              <option value="">— Aucun pays hôte —</option>
              {(format === 'groups_knockout' ? teams.filter((t) => selectedTeams.includes(t.id)) : teams).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        {format !== 'league' && (
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={thirdPlace}
              onChange={(e) => setThirdPlace(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Match pour la 3ème place
          </label>
        )}
        {format === 'groups_knockout' && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Nombre de groupes</span>
              <select
                className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                value={groupsCount}
                onChange={(e) => setGroupsCount(Number(e.target.value))}
              >
                {[2, 3, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>{n} groupes</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Équipes qualifiées par groupe</span>
              <select
                className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                value={qualifyPerGroup}
                onChange={(e) => { setQualifyPerGroup(Number(e.target.value)); setBestThirds(0); }}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? 'équipe' : 'équipes'}</option>
                ))}
              </select>
            </label>
            {(() => {
              const base = groupsCount * qualifyPerGroup;
              // Valid bestThirds values: those where base + n is a power of 2, n <= groupsCount, n > 0
              const validOptions = Array.from({ length: groupsCount }, (_, i) => i + 1).filter((n) => {
                const total = base + n;
                return total >= 2 && (total & (total - 1)) === 0;
              });
              if (validOptions.length === 0) return null;
              return (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Meilleurs 3es qualifiés</span>
                  <select
                    className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                    value={bestThirds}
                    onChange={(e) => setBestThirds(Number(e.target.value))}
                  >
                    <option value={0}>Aucun</option>
                    {validOptions.map((n) => (
                      <option key={n} value={n}>{n} meilleur{n > 1 ? 's' : ''} 3e{n > 1 ? 's' : ''} → {base + n} équipes en phase finale</option>
                    ))}
                  </select>
                </label>
              );
            })()}
          </>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="text-xs uppercase tracking-widest text-muted">
          {format === 'groups_knockout' ? 'Règles — Phase de groupes' : 'Règles des matchs'}
        </div>
        <RulesEditor rules={rules} onChange={setRules} showKnockoutOptions={format !== 'groups_knockout'} />
      </section>

      {format === 'groups_knockout' && (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-widest text-muted">Règles — Phase finale</div>
          <RulesEditor rules={knockoutRules} onChange={setKnockoutRules} showKnockoutOptions />
        </section>
      )}

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs uppercase tracking-widest text-muted">Équipes participantes</div>
          <span className="text-xs text-muted">{selectedTeams.length} sélectionnée{selectedTeams.length > 1 ? 's' : ''} · min {minTeams}</span>
        </div>

        {/* Filters + bulk actions */}
        {(() => {
          const visibleTeams = continentFilter === 'all'
            ? teams
            : teams.filter((t) => CULTURE_CONTINENT[t.culture] === continentFilter);
          const allVisibleSelected = visibleTeams.length > 0 && visibleTeams.every((t) => selectedTeams.includes(t.id));

          // Continents that actually have teams loaded
          const availableContinents = [...new Set(teams.map((t) => CULTURE_CONTINENT[t.culture]))];

          return (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={continentFilter}
                  onChange={(e) => setContinentFilter(e.target.value as Continent | 'all')}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text"
                >
                  <option value="all">Tous les continents</option>
                  {availableContinents.map((c) => (
                    <option key={c} value={c}>{CONTINENT_LABEL[c]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (allVisibleSelected) {
                      setSelectedTeams((prev) => prev.filter((id) => !visibleTeams.find((t) => t.id === id)));
                    } else {
                      const toAdd = visibleTeams.map((t) => t.id);
                      setSelectedTeams((prev) => [...new Set([...prev, ...toAdd])]);
                    }
                  }}
                  className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-border/40 transition-colors"
                >
                  {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                {continentFilter !== 'all' && (
                  <span className="text-xs text-muted">{visibleTeams.length} équipe{visibleTeams.length > 1 ? 's' : ''} visible{visibleTeams.length > 1 ? 's' : ''}</span>
                )}
              </div>

              <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
                {visibleTeams.map((team) => (
                  <label
                    key={team.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                      selectedTeams.includes(team.id)
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-border/70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeams.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                      className="h-4 w-4 shrink-0"
                    />
                    {team.flag && <img src={team.flag} alt="" className="h-8 w-8 object-cover rounded-sm shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{team.name}</div>
                      <div className="text-xs text-muted">Force {team.globalStrength}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          );
        })()}
      </section>

      {needsEven && selectedTeams.length > 0 && !evenOk && (
        <p className="text-sm text-warning">
          Les poules requièrent un nombre pair d'équipes ({selectedTeams.length} sélectionnée{selectedTeams.length > 1 ? 's' : ''}).
        </p>
      )}
      {needsEven && selectedTeams.length > 0 && evenOk && selectedTeams.length < minTeams && (
        <p className="text-sm text-warning">
          Minimum {minTeamsPerGroup} équipes par groupe — il faut au moins {minTeams} équipes pour {groupsCount} groupe{groupsCount > 1 ? 's' : ''}.
        </p>
      )}
      {format === 'lpm' && selectedTeams.length > 0 && selectedTeams.length !== 48 && (
        <p className="text-sm text-warning">
          La LPM requiert exactement 48 équipes ({selectedTeams.length} sélectionnée{selectedTeams.length > 1 ? 's' : ''}).
        </p>
      )}

      {/* Sauvegarde preset */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <div className="text-xs uppercase tracking-widest text-muted">Sauvegarder comme preset</div>
        {savingPreset ? (
          <div className="space-y-2">
            <input
              ref={presetLabelRef}
              autoFocus
              type="text"
              value={presetLabel}
              onChange={(e) => setPresetLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSavePreset(); if (e.key === 'Escape') setSavingPreset(false); }}
              placeholder="Nom du preset (ex : LPM standard)"
              className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm focus:border-accent outline-none"
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={includeTeams}
                onChange={(e) => setIncludeTeams(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Inclure la sélection des équipes ({selectedTeams.length} pays)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={doSavePreset}
                disabled={!presetLabel.trim()}
                className="text-xs px-3 py-1.5 rounded-md bg-accent text-white disabled:opacity-40 hover:bg-accent/80 transition-colors"
              >
                Sauvegarder
              </button>
              <button
                type="button"
                onClick={() => setSavingPreset(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-border text-muted hover:text-text transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setSavingPreset(true); setTimeout(() => presetLabelRef.current?.focus(), 50); }}
            className="text-xs px-3 py-1.5 rounded-md border border-border text-muted hover:text-text hover:border-accent/40 transition-colors"
          >
            + Enregistrer la configuration actuelle
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={create} size="lg" disabled={!valid || busy}>
          {busy && <Spinner className="mr-2" />}
          {format === 'groups_knockout' || format === 'cup' ? 'Lancer le tirage' : 'Créer la compétition'}
        </Button>
        {selectedTeams.length < minTeams && format !== 'lpm' && (
          <span className="text-sm text-muted">
            Sélectionne au moins {minTeams} équipes
          </span>
        )}
      </div>
    </div>
  );
}

function RulesEditor({
  rules,
  onChange,
  showKnockoutOptions,
}: {
  rules: MatchRules;
  onChange: (r: MatchRules) => void;
  showKnockoutOptions: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={rules.noOffside}
          onChange={(e) => onChange({ ...rules, noOffside: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
        Pas de hors-jeu
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Remplaçants max</span>
        <select
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
          value={rules.maxSubs}
          onChange={(e) => onChange({ ...rules, maxSubs: Number(e.target.value) as 3 | 5 })}
        >
          <option value={3}>3</option>
          <option value={5}>5</option>
        </select>
      </label>
      {showKnockoutOptions && (
        <>
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={rules.extraTime}
              onChange={(e) => onChange({ ...rules, extraTime: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Prolongations
          </label>
          {rules.extraTime && (
            <label className="flex items-center gap-3 text-sm cursor-pointer pl-5">
              <input
                type="checkbox"
                checked={rules.goldenGoal}
                onChange={(e) => onChange({ ...rules, goldenGoal: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              But en or
            </label>
          )}
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={rules.penalties}
              onChange={(e) => onChange({ ...rules, penalties: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Tirs au but
          </label>
        </>
      )}
    </div>
  );
}
