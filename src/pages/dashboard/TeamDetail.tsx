import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { RosterTable } from '@/components/team/RosterTable';
import type { Player, Team } from '@/lib/types';
import { CULTURE_LABEL } from '@/lib/types';
import { useCredentials } from '@/stores/credentials';
import { useTeams } from '@/stores/teams';

const ADD_COUNTS = [100, 200, 500, 1000];

export default function TeamDetail() {
  const { slug = '' } = useParams();
  const pat = useCredentials((s) => s.githubPat);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const saveTeam = useTeams((s) => s.saveTeam);
  const navigate = useNavigate();

  const [data, setData] = useState<{ team: Team; players: Player[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!pat) return;
    setLoading(true);
    fetchTeam(slug, pat)
      .then((res) => {
        if (!res) toast('error', 'Équipe introuvable.');
        setData(res);
      })
      .catch((err) => toast('error', String(err)))
      .finally(() => setLoading(false));
  }, [slug, pat, fetchTeam]);

  async function addPlayers(extra: number) {
    if (!data || !pat) return;
    setAdding(true);
    try {
      const { generatePlayers } = await import('@/lib/gen/players');
      const newPlayers = generatePlayers({
        count: extra,
        culture: data.team.culture,
        globalStrength: data.team.globalStrength,
      });
      const merged = [...data.players, ...newPlayers];
      const team = { ...data.team, playerCount: merged.length };
      await saveTeam(team, merged, pat);
      setData({ team, players: merged });
      toast('success', `+${extra} joueurs.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setAdding(false);
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
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-6">
        <img
          src={team.flag}
          alt=""
          className="h-24 w-24 rounded-lg border border-border object-cover"
        />
        <div className="space-y-1">
          <h1 className="font-display text-4xl">{team.name}</h1>
          <p className="text-sm text-muted">
            {CULTURE_LABEL[team.culture]} · Force {team.globalStrength} ·{' '}
            {team.playerCount} joueurs · Formation {team.formation}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Roster</h2>
          <div className="flex items-center gap-2">
            {ADD_COUNTS.map((n) => (
              <Button
                key={n}
                variant="ghost"
                size="sm"
                onClick={() => addPlayers(n)}
                disabled={adding}
              >
                + {n}
              </Button>
            ))}
            {adding ? <Spinner /> : null}
          </div>
        </div>
        <RosterTable players={players} />
      </section>
    </div>
  );
}
