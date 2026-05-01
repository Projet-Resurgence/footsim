import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { StandingsTable } from '@/components/competition/StandingsTable';
import { BracketView } from '@/components/competition/BracketView';
import { useCompetition } from '@/stores/competition';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';
import type { Competition, CompMatch } from '@/lib/competition/types';
import type { Team } from '@/lib/types';

export default function CompetitionDetail() {
  const { id } = useParams<{ id: string }>();
  const load = useCompetition((s) => s.load);
  const remove = useCompetition((s) => s.remove);
  const current = useCompetition((s) => s.current);
  const teams = useTeams((s) => s.teams);
  const refreshTeams = useTeams((s) => s.refresh);
  const pat = useCredentials((s) => s.githubPat);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bracket' | 'rounds'>('overview');

  useEffect(() => {
    if (!pat || !id) return;

    const teamLoad = teams.length === 0 ? refreshTeams(pat) : Promise.resolve();

    // Si la compétition est déjà en mémoire (mise à jour optimiste), on ne recharge pas depuis GitHub
    if (current?.id === id) {
      teamLoad.finally(() => setLoading(false));
      return;
    }

    Promise.all([load(id, pat), teamLoad]).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pat]);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;
  }

  if (!current) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/competitions" className="text-sm text-muted hover:text-text">← Compétitions</Link>
        <p className="text-muted">Compétition introuvable.</p>
      </div>
    );
  }

  const teamMap: Record<string, Team> = {};
  for (const t of teams) teamMap[t.id] = t;

  const isGroupsKO = current.format === 'groups_knockout';
  const isLeague = current.format === 'league';

  const allStandings = Object.values(current.standings);

  async function handleDelete() {
    if (!pat || !current) return;
    if (!confirm(`Supprimer « ${current.name} » ? Cette action est irréversible.`)) return;
    setDeleting(true);
    try {
      await remove(current.id, pat);
      navigate('/dashboard/competitions');
    } catch (err) {
      toast('error', String(err));
      setDeleting(false);
    }
  }

  const currentRound = current.currentRound;

  async function simulateRound(round: number) {
    if (!pat || !current) return;
    const roundMatches = current.matches.filter(
      (m) => m.round === round && m.status === 'pending' && m.homeTeamId && m.awayTeamId,
    );
    if (roundMatches.length === 0) return;

    if (roundMatches.length === 1) {
      // Single match — navigate to live
      navigate(`/competition/${current.id}/match/${roundMatches[0].id}`);
    } else {
      // Multiplex
      navigate(`/competition/${current.id}/round/${round}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/dashboard/competitions" className="text-sm text-muted hover:text-text">← Compétitions</Link>
          <h1 className="mt-2 font-display text-4xl">{current.name}</h1>
          <p className="text-muted text-sm mt-1">
            {current.format === 'league' ? 'Championnat' : current.format === 'cup' ? 'Coupe' : 'Groupes + Phase finale'}
            {' · '}
            {current.teamIds.length} équipes
          </p>
        </div>
        <div className="flex gap-2">
          {current.status !== 'completed' && (
            <Button
              size="sm"
              onClick={() => simulateRound(currentRound)}
              disabled={!current.matches.some(
                (m) => m.round === currentRound && m.status === 'pending' && m.homeTeamId && m.awayTeamId,
              )}
            >
              ▶ Journée {currentRound}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Spinner className="h-4 w-4" /> : 'Supprimer'}
          </Button>
        </div>
      </div>

      {current.status === 'completed' && current.winner && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-5 text-center space-y-2">
          <div className="text-xs uppercase tracking-widest text-muted">Vainqueur</div>
          <div className="flex items-center justify-center gap-3">
            {teamMap[current.winner]?.flag && (
              <img src={teamMap[current.winner].flag} alt="" className="h-12 w-12 object-cover rounded" />
            )}
            <div className="font-display text-3xl">{teamMap[current.winner]?.name ?? current.winner}</div>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {(['overview', 'bracket', 'rounds'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {tab === 'overview' ? 'Classement' : tab === 'bracket' ? 'Tableau' : 'Journées'}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {isLeague && (
            <StandingsTable standings={allStandings} teams={teamMap} />
          )}
          {isGroupsKO && current.groups && (
            <div className="grid gap-6 md:grid-cols-2">
              {current.groups.map((group) => {
                const groupStandings = group.teamIds.map((id) => current.standings[id]).filter(Boolean);
                return (
                  <StandingsTable
                    key={group.id}
                    standings={groupStandings}
                    teams={teamMap}
                    title={group.name}
                    highlightCount={current.config.qualifyPerGroup}
                  />
                );
              })}
            </div>
          )}
          {!isLeague && !isGroupsKO && (
            <p className="text-muted text-sm">Format coupe — pas de classement général.</p>
          )}
        </div>
      )}

      {activeTab === 'bracket' && (
        <div className="space-y-4">
          {isLeague ? (
            <p className="text-muted text-sm">Format ligue — utilise l'onglet Journées.</p>
          ) : (
            <BracketView
              matches={current.matches.filter((m) => m.phase !== 'group')}
              teams={teamMap}
              onSimulate={(matchId) => {
                navigate(`/competition/${current.id}/match/${matchId}`);
              }}
            />
          )}
        </div>
      )}

      {activeTab === 'rounds' && (
        <RoundsView
          competition={current}
          teamMap={teamMap}
          onSimulateRound={simulateRound}
          onSimulateMatch={(matchId) => navigate(`/competition/${current.id}/match/${matchId}`)}
        />
      )}
    </div>
  );
}

function RoundsView({
  competition,
  teamMap,
  onSimulateRound,
  onSimulateMatch,
}: {
  competition: Competition;
  teamMap: Record<string, Team>;
  onSimulateRound: (round: number) => void;
  onSimulateMatch: (matchId: string) => void;
}) {
  const rounds = Array.from(
    new Set(competition.matches.map((m) => m.round)),
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {rounds.map((round) => {
        const roundMatches = competition.matches.filter((m) => m.round === round);
        const hasPending = roundMatches.some(
          (m) => m.status === 'pending' && m.homeTeamId && m.awayTeamId,
        );
        const label = competition.format === 'league'
          ? `Journée ${round}`
          : roundMatches[0]?.phase === 'group'
          ? `Phase de groupes — J${round}`
          : `Tour ${round} — ${roundMatches[0]?.phase ?? ''}`;

        return (
          <div key={round} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-muted uppercase tracking-wide">{label}</div>
              {hasPending && roundMatches.filter((m) => m.homeTeamId && m.awayTeamId).length > 1 && (
                <button
                  onClick={() => onSimulateRound(round)}
                  className="text-xs text-accent hover:text-accent/70 transition-colors"
                >
                  ▶ Simuler tous en multiplex
                </button>
              )}
            </div>
            <div className="grid gap-2">
              {roundMatches.map((m) => (
                <RoundMatchRow
                  key={m.id}
                  match={m}
                  teamMap={teamMap}
                  onSimulate={() => onSimulateMatch(m.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoundMatchRow({
  match,
  teamMap,
  onSimulate,
}: {
  match: CompMatch;
  teamMap: Record<string, Team>;
  onSimulate: () => void;
}) {
  const home = match.homeTeamId ? teamMap[match.homeTeamId] : null;
  const away = match.awayTeamId ? teamMap[match.awayTeamId] : null;
  const done = match.status === 'completed';
  const canSim = match.status === 'pending' && match.homeTeamId && match.awayTeamId;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${done ? 'border-border/50 bg-surface/50' : 'border-border bg-surface'}`}>
      <TeamCell team={home} side="home" />
      <div className="flex-1 text-center font-display tabular-nums">
        {done && match.result ? (
          <span>
            {match.result.home} – {match.result.away}
            {match.result.penalties && (
              <span className="ml-1 text-xs text-muted">
                ({match.result.penalties.home}–{match.result.penalties.away} tab)
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted">vs</span>
        )}
      </div>
      <TeamCell team={away} side="away" />
      {canSim && (
        <button
          onClick={onSimulate}
          className="ml-2 shrink-0 text-xs text-accent hover:text-accent/70 transition-colors"
        >
          ▶
        </button>
      )}
      {!match.homeTeamId && !match.awayTeamId && (
        <span className="ml-2 shrink-0 text-xs text-muted">À définir</span>
      )}
    </div>
  );
}

function TeamCell({ team, side }: { team: Team | null; side: 'home' | 'away' }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 flex-1 ${side === 'away' ? 'flex-row-reverse text-right' : ''}`}>
      {team?.flag ? (
        <img src={team.flag} alt="" className="h-6 w-6 object-cover rounded-sm shrink-0" />
      ) : (
        <div className="h-6 w-6 rounded-sm bg-border shrink-0" />
      )}
      <span className="truncate text-sm">{team?.name ?? 'À définir'}</span>
    </div>
  );
}
