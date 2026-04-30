import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import type { Formation, Team } from '@/lib/types';
import type { Speed } from '@/lib/sim/types';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';
import { useMatch } from '@/stores/match';

const FORMATIONS: Formation[] = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1'];

export default function MatchSetup() {
  const teams = useTeams((s) => s.teams);
  const refresh = useTeams((s) => s.refresh);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const pat = useCredentials((s) => s.githubPat);
  const start = useMatch((s) => s.start);
  const navigate = useNavigate();

  const [homeSlug, setHomeSlug] = useState<string>('');
  const [awaySlug, setAwaySlug] = useState<string>('');
  const [homeFormation, setHomeFormation] = useState<Formation>('4-3-3');
  const [awayFormation, setAwayFormation] = useState<Formation>('4-3-3');
  const [speed, setSpeed] = useState<Speed>('1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pat && teams.length === 0) refresh(pat);
  }, [pat, teams.length, refresh]);

  async function launch() {
    if (!pat) {
      toast('error', 'Token GitHub manquant.');
      return;
    }
    if (!homeSlug || !awaySlug) {
      toast('error', 'Choisis deux équipes.');
      return;
    }
    if (homeSlug === awaySlug) {
      toast('error', 'Les deux équipes doivent être différentes.');
      return;
    }
    setBusy(true);
    try {
      const [home, away] = await Promise.all([
        fetchTeam(homeSlug, pat),
        fetchTeam(awaySlug, pat),
      ]);
      if (!home || !away) {
        toast('error', 'Impossible de charger les équipes.');
        return;
      }
      if (home.players.length < 11 || away.players.length < 11) {
        toast('error', 'Chaque équipe doit avoir au moins 11 joueurs.');
        return;
      }
      const matchId = crypto.randomUUID();
      start({
        matchId,
        home: { team: home.team, players: home.players, formation: homeFormation },
        away: { team: away.team, players: away.players, formation: awayFormation },
        speed,
      });
      navigate(`/match/${matchId}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!pat) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <h1 className="font-display text-3xl">Configurer le token GitHub</h1>
          <p className="text-muted">Va dans Réglages pour ajouter ton PAT.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
          ← Retour
        </Button>
      </div>
      <div>
        <h1 className="font-display text-4xl">Lancer un match</h1>
        <p className="text-muted">Choisis les deux équipes et leur tactique.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SidePicker
          title="Domicile"
          teams={teams}
          slug={homeSlug}
          onSlug={setHomeSlug}
          formation={homeFormation}
          onFormation={setHomeFormation}
        />
        <SidePicker
          title="Extérieur"
          teams={teams}
          slug={awaySlug}
          onSlug={setAwaySlug}
          formation={awayFormation}
          onFormation={setAwayFormation}
        />
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <label className="block text-sm">
          <span className="mb-2 block text-muted">Vitesse de simulation</span>
          <div className="flex flex-wrap gap-2">
            {(['0.5', '1', '2', '5', 'instant'] as Speed[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={speed === s ? 'primary' : 'ghost'}
                onClick={() => setSpeed(s)}
              >
                {s === 'instant' ? 'Instant' : `×${s}`}
              </Button>
            ))}
          </div>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={launch} size="lg" disabled={busy}>
          {busy ? <Spinner className="mr-2" /> : null}
          Démarrer le match
        </Button>
      </div>
    </main>
  );
}

function SidePicker({
  title, teams, slug, onSlug, formation, onFormation,
}: {
  title: string;
  teams: Team[];
  slug: string;
  onSlug: (s: string) => void;
  formation: Formation;
  onFormation: (f: Formation) => void;
}) {
  const team = teams.find((t) => t.slug === slug);
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div className="text-xs uppercase tracking-widest text-muted">{title}</div>
      <select
        className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
        value={slug}
        onChange={(e) => onSlug(e.target.value)}
      >
        <option value="">— Choisir —</option>
        {teams.map((t) => (
          <option key={t.slug} value={t.slug}>{t.name}</option>
        ))}
      </select>
      {team ? (
        <div className="flex items-center gap-3">
          <img src={team.flag} alt="" className="h-12 w-12 object-cover" />
          <div className="text-sm">
            <div className="font-medium">{team.name}</div>
            <div className="text-xs text-muted">Force {team.globalStrength} · {team.playerCount} joueurs</div>
          </div>
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Formation</span>
        <select
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          value={formation}
          onChange={(e) => onFormation(e.target.value as Formation)}
        >
          {FORMATIONS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

