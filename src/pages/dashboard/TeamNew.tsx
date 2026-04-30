import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { FlagUpload } from '@/components/team/FlagUpload';
import { CULTURES, CULTURE_LABEL, type Culture, type Player, type Team } from '@/lib/types';
import { slugify } from '@/lib/slug';
import { useCredentials } from '@/stores/credentials';
import { useSession } from '@/stores/session';
import { useTeams } from '@/stores/teams';

const COUNTS = [100, 200, 500, 1000, 2000, 3000, 4000, 5000];

export default function TeamNew() {
  const pat = useCredentials((s) => s.githubPat);
  const session = useSession((s) => s.session);
  const saveTeam = useTeams((s) => s.saveTeam);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [flag, setFlag] = useState<string | null>(null);
  const [culture, setCulture] = useState<Culture>('francais');
  const [strength, setStrength] = useState(60);
  const [count, setCount] = useState(500);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!pat) {
      toast('error', 'Token GitHub manquant.');
      return;
    }
    if (!name.trim() || !flag) {
      toast('error', 'Nom et drapeau requis.');
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: count });

    try {
      const players = await runWorker({ count, culture, globalStrength: strength }, (p) =>
        setProgress({ done: p.done, total: p.total }),
      );

      const slug = slugify(name);
      const team: Team = {
        id: crypto.randomUUID(),
        slug,
        name: name.trim(),
        flag,
        culture,
        globalStrength: strength,
        createdAt: new Date().toISOString(),
        createdBy: session?.id ?? 'unknown',
        playerCount: players.length,
        formation: '4-3-3',
      };

      await saveTeam(team, players, pat);
      toast('success', `${team.name} créée avec ${players.length} joueurs.`);
      navigate(`/dashboard/teams/${slug}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="font-display text-4xl">Nouvelle équipe</h1>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-6">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nom du pays</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="République du Sud"
          />
        </label>

        <div className="block text-sm">
          <span className="mb-1 block text-muted">Drapeau</span>
          <FlagUpload value={flag} onChange={(v) => setFlag(v || null)} />
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Culture des noms</span>
          <select
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={culture}
            onChange={(e) => setCulture(e.target.value as Culture)}
          >
            {CULTURES.map((c) => (
              <option key={c} value={c}>
                {CULTURE_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">
            Force globale : <span className="text-text">{strength}</span>
          </span>
          <input
            type="range"
            min={1}
            max={100}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full accent-[--accent]"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nombre de joueurs</span>
          <select
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={generate} disabled={busy} size="lg">
          {busy ? <Spinner className="mr-2" /> : null}
          {busy ? 'Génération…' : 'Générer l’équipe'}
        </Button>
        {progress ? (
          <span className="text-sm text-muted">
            {progress.done} / {progress.total}
          </span>
        ) : null}
      </div>

      {progress ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function runWorker(
  opts: { count: number; culture: Culture; globalStrength: number },
  onProgress: (p: { done: number; total: number }) => void,
): Promise<Player[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('@/lib/gen/worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data as
        | { type: 'progress'; done: number; total: number }
        | { type: 'done'; players: Player[] }
        | { type: 'error'; message: string };
      if (data.type === 'progress') onProgress({ done: data.done, total: data.total });
      else if (data.type === 'done') {
        worker.terminate();
        resolve(data.players);
      } else if (data.type === 'error') {
        worker.terminate();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ id: 1, opts });
  });
}
