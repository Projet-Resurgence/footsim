import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { useLeagues } from '@/stores/leagues';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { useSession } from '@/stores/session';

export default function LeagueNew() {
  const { slug: nationSlug = '' } = useParams<{ slug: string }>();
  const { ownerId, prApiToken: effectivePat } = useBackendArgs();
  const session = useSession((s) => s.session);
  const saveLeague = useLeagues((s) => s.saveLeague);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [divisions, setDivisions] = useState<string[]>(['Division 1', 'Division 2']);
  const [saving, setSaving] = useState(false);

  function addDivision() {
    setDivisions([...divisions, `Division ${divisions.length + 1}`]);
  }

  function removeDivision(i: number) {
    if (divisions.length <= 1) return;
    setDivisions(divisions.filter((_, idx) => idx !== i));
  }

  function renameDivision(i: number, val: string) {
    setDivisions(divisions.map((d, idx) => (idx === i ? val : d)));
  }

  async function handleCreate() {
    if (!name.trim()) { toast('error', 'Nom requis.'); return; }
    if (divisions.some((d) => !d.trim())) { toast('error', 'Toutes les divisions doivent avoir un nom.'); return; }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      await saveLeague(
        {
          id,
          nationSlug,
          name: name.trim(),
          divisions: divisions.map((dname) => ({
            id: crypto.randomUUID(),
            name: dname.trim(),
            clubs: [],
          })),
          createdAt: new Date().toISOString(),
          createdBy: session?.id ?? ownerId,
          ownerId,
        },
        effectivePat,
      );
      toast('success', `Championnat "${name.trim()}" créé.`);
      navigate(`/dashboard/leagues/${encodeURIComponent(nationSlug + '/' + id)}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="font-display text-4xl">Nouveau championnat</h1>

      <section className="space-y-5 rounded-lg border border-border bg-surface p-6">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nom du championnat</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ligue Nationale" />
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Divisions ({divisions.length})</span>
            <button
              onClick={addDivision}
              className="text-xs text-accent transition-colors hover:text-accent/70"
            >
              + Ajouter une division
            </button>
          </div>
          {divisions.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={d}
                onChange={(e) => renameDivision(i, e.target.value)}
                placeholder={`Division ${i + 1}`}
                className="flex-1"
              />
              {divisions.length > 1 && (
                <button
                  onClick={() => removeDivision(i)}
                  className="text-xs text-danger transition-colors hover:text-danger/70"
                >
                  Supprimer
                </button>
              )}
            </div>
          ))}
          <p className="text-xs text-muted">
            Tu pourras ajouter les clubs dans chaque division après la création.
          </p>
        </div>
      </section>

      <div className="flex gap-3">
        <Button onClick={handleCreate} disabled={saving} size="lg">
          {saving ? <Spinner className="mr-2" /> : null}
          Créer le championnat
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => navigate(`/dashboard/teams/${nationSlug}`)}
          disabled={saving}
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}
