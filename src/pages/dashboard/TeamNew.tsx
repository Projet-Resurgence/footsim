import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { FlagUpload } from '@/components/team/FlagUpload';
import {
  CULTURE_LABEL, CONTINENT_LABEL, CULTURES_BY_CONTINENT,
  type Culture, type Continent, type Player, type Team,
} from '@/lib/types';
import type { CultureWeight } from '@/lib/gen/names';
import { generateCoach, COACH_TRAIT_LABEL, type Coach } from '@/lib/gen/coach';
import { slugify } from '@/lib/slug';
import { useSession } from '@/stores/session';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';

const COUNTS = [100, 200, 500, 1000, 2000, 3000, 4000, 5000];

export default function TeamNew() {
  const session = useSession((s) => s.session);
  const { prApiToken } = useBackendArgs();
  const saveTeam = useTeams((s) => s.saveTeam);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [flag, setFlag] = useState<string | null>(null);
  const [selectedContinents, setSelectedContinents] = useState<Continent[]>(['europe']);
  const [cultures, setCultures] = useState<CultureWeight[]>([{ culture: 'francais', weight: 50 }]);
  const [strength, setStrength] = useState(60);
  const [count, setCount] = useState(500);
  const [managerId, setManagerId] = useState('');
  const [jerseyColor, setJerseyColor] = useState('#e63c3c');

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draft, setDraft] = useState<{ team: Team; players: Player[] } | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);

  const totalWeight = cultures.reduce((s, c) => s + c.weight, 0);

  function toggleContinent(ct: Continent) {
    if (selectedContinents.includes(ct)) {
      if (selectedContinents.length === 1) return;
      setSelectedContinents(selectedContinents.filter((c) => c !== ct));
    } else {
      if (selectedContinents.length >= 2) return;
      setSelectedContinents([...selectedContinents, ct]);
    }
  }

  function toggleCulture(c: Culture) {
    if (cultures.some((w) => w.culture === c)) {
      if (cultures.length === 1) return; // keep at least one
      setCultures(cultures.filter((w) => w.culture !== c));
    } else {
      const n = cultures.length + 1;
    const eq = Math.round(100 / n);
    setCultures([...cultures.map((w) => ({ ...w, weight: eq })), { culture: c, weight: 100 - eq * (n - 1) }]);
    }
  }

  function setWeight(c: Culture, value: number) {
    const clamped = Math.max(1, Math.min(100, value));
    const others = cultures.filter((w) => w.culture !== c);
    const remaining = Math.max(0, 100 - clamped);
    const otherTotal = others.reduce((s, w) => s + w.weight, 0);
    setCultures(cultures.map((w) => {
      if (w.culture === c) return { ...w, weight: clamped };
      const share = otherTotal > 0 ? Math.round((w.weight / otherTotal) * remaining) : Math.round(remaining / others.length);
      return { ...w, weight: Math.max(1, share) };
    }));
  }

  function distribute() {
    const equal = Math.round(100 / cultures.length);
    setCultures(cultures.map((w, i) => ({
      ...w,
      weight: i === cultures.length - 1 ? 100 - equal * (cultures.length - 1) : equal,
    })));
  }

  async function generate() {
    if (!name.trim() || !flag) { toast('error', 'Nom et drapeau requis.'); return; }
    if (cultures.length === 0) { toast('error', 'Sélectionne au moins une culture.'); return; }
    setGenerating(true);
    setProgress({ done: 0, total: count });
    setDraft(null);

    try {
      const primaryCulture = cultures[0].culture;
      const players = await runWorker(
        { count, culture: primaryCulture, cultures, globalStrength: strength },
        (p) => setProgress({ done: p.done, total: p.total }),
      );

      const slug = slugify(name);
      const ownerId = session?.id ?? 'unknown';
      const generatedCoach = generateCoach(cultures);
      setCoach(generatedCoach);
      const team: Team = {
        id: crypto.randomUUID(),
        slug,
        name: name.trim(),
        flag,
        culture: primaryCulture,
        cultures,
        continent: selectedContinents[0],
        continents: selectedContinents,
        kind: 'national',
        globalStrength: strength,
        createdAt: new Date().toISOString(),
        createdBy: ownerId,
        ownerId,
        playerCount: players.length,
        formation: '4-3-3',
        managerDiscordId: managerId.trim() || undefined,
        coach: generatedCoach,
        jerseyColor,
      };

      setDraft({ team, players });
      toast('success', `${players.length} joueurs générés. Vérifie puis publie.`);
    } catch (err) {
      console.error('[generate] error:', err);
      toast('error', String(err));
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }

  async function publish() {
    if (!draft) return;
    setPublishing(true);
    try {
      await saveTeam(draft.team, draft.players, null, prApiToken);
      toast('success', `${draft.team.name} sauvegardée avec ${draft.players.length} joueurs.`);
      navigate(`/dashboard/teams/${draft.team.slug}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="font-display text-3xl sm:text-4xl">Nouvelle équipe</h1>

      <section className="space-y-5 rounded-lg border border-border bg-surface p-6">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nom du pays</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="République du Sud" />
        </label>

        <div className="block text-sm">
          <span className="mb-1 block text-muted">Drapeau (150×150)</span>
          <FlagUpload value={flag} onChange={(v) => setFlag(v || null)} />
        </div>

        <div className="block text-sm">
          <span className="mb-1 block text-muted">Couleur du maillot</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={jerseyColor}
              onChange={(e) => setJerseyColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-border bg-transparent p-0.5"
            />
            <span className="font-mono text-xs text-muted">{jerseyColor}</span>
            <div className="h-6 w-6 rounded-full border border-border" style={{ background: jerseyColor }} />
          </div>
        </div>

        {/* Continents (max 2) */}
        <div className="block text-sm">
          <span className="mb-1 block text-muted">
            Continents <span className="text-xs opacity-60">(1 ou 2)</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CULTURES_BY_CONTINENT) as Continent[]).map((ct) => {
              const active = selectedContinents.includes(ct);
              const disabled = !active && selectedContinents.length >= 2;
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

        {/* Multi-culture picker */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Cultures ({cultures.length})</span>
            {cultures.length > 1 && (
              <button onClick={distribute} className="text-xs text-accent hover:text-accent/70 transition-colors">
                Répartir également
              </button>
            )}
          </div>

          {/* Culture grid — all continents, no restriction */}
          <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {(Object.keys(CULTURES_BY_CONTINENT) as Continent[]).map((ct) => (
              <div key={ct}>
                <div className="mb-1 px-1 text-xs uppercase tracking-widest text-muted">{CONTINENT_LABEL[ct]}</div>
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

          {/* Weight sliders for selected cultures */}
          {cultures.length > 1 && (
            <div className="space-y-2 rounded-md border border-border bg-bg p-3">
              {cultures.map((cw) => {
                const pct = totalWeight > 0 ? Math.round((cw.weight / totalWeight) * 100) : 0;
                return (
                  <div key={cw.culture} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span>{CULTURE_LABEL[cw.culture]}</span>
                      <span className="text-accent tabular-nums">{pct}%</span>
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
        </div>

        {/* Manager Discord ID */}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">ID Discord du manager <span className="text-xs opacity-60">(optionnel)</span></span>
          <Input value={managerId} onChange={(e) => setManagerId(e.target.value)} placeholder="772821169664426025" />
        </label>

        {/* Strength */}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">
            Force globale : <span className="text-text">{strength}</span>
          </span>
          <input
            type="range" min={1} max={100} value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full accent-[--accent]"
          />
        </label>

        {/* Player count */}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nombre de joueurs</span>
          <select
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={generate} disabled={generating || publishing} size="lg">
          {generating ? <Spinner className="mr-2" /> : null}
          {generating ? 'Génération…' : draft ? 'Regénérer' : 'Générer'}
        </Button>

        {draft && (
          <Button onClick={publish} disabled={publishing || generating} size="lg">
            {publishing ? <Spinner className="mr-2" /> : null}
            {publishing ? 'Sauvegarde…' : `Sauvegarder ${draft.players.length} joueurs`}
          </Button>
        )}

        {progress && (
          <span className="text-sm text-muted">{progress.done} / {progress.total}</span>
        )}
      </div>

      {progress && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}

      {draft && !generating && (
        <div className="space-y-3">
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
            {draft.players.length} joueurs générés — non encore sauvegardés.
          </div>
          {coach && (
            <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-widest text-muted">Entraîneur généré</div>
                <Button size="sm" variant="ghost" onClick={() => {
                  const fresh = generateCoach(cultures);
                  setCoach(fresh);
                  setDraft(d => d ? { ...d, team: { ...d.team, coach: fresh } } : d);
                }}>Regénérer</Button>
              </div>
              <div>
                <div className="font-semibold">{coach.firstName} {coach.lastName}</div>
                <div className="text-xs text-muted">Overall {coach.overall}</div>
              </div>
              {(coach.positiveTraits?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(coach.positiveTraits ?? []).map(t => (
                    <span key={t} className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400 border border-green-500/20">{COACH_TRAIT_LABEL[t]}</span>
                  ))}
                </div>
              )}
              {(coach.negativeTraits?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(coach.negativeTraits ?? []).map(t => (
                    <span key={t} className="rounded bg-danger/10 px-2 py-0.5 text-xs text-danger border border-danger/20">{COACH_TRAIT_LABEL[t]}</span>
                  ))}
                </div>
              )}
              {(coach.positiveTraits?.length ?? 0) === 0 && (coach.negativeTraits?.length ?? 0) === 0 && (
                <p className="text-xs text-muted italic">Aucun trait particulier.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function runWorker(
  opts: { count: number; culture: Culture; cultures?: CultureWeight[]; globalStrength: number },
  onProgress: (p: { done: number; total: number }) => void,
): Promise<Player[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('@/lib/gen/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data as
        | { type: 'progress'; done: number; total: number }
        | { type: 'done'; players: Player[] }
        | { type: 'error'; message: string };
      if (data.type === 'progress') onProgress({ done: data.done, total: data.total });
      else if (data.type === 'done') { worker.terminate(); resolve(data.players); }
      else if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message)); };
    worker.postMessage({ id: 1, opts });
  });
}
