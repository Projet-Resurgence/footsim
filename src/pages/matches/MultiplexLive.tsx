import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { useMultiplex } from '@/stores/multiplex';
import { useCompetition } from '@/stores/competition';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { advanceBracket, applyResultToStandings } from '@/lib/competition/scheduler';
import { accumulateMatchStats, computeAwards } from '@/lib/competition/statsAccumulator';
import type { MatchInput, Speed } from '@/lib/sim/types';
import type { Team } from '@/lib/types';

export default function MultiplexLive() {
  const { competitionId, round } = useParams<{ competitionId: string; round: string }>();
  const roundNum = Number(round);

  const load = useCompetition((s) => s.load);
  const save = useCompetition((s) => s.save);
  const current = useCompetition((s) => s.current);
  const teamsStore = useTeams((s) => s.teams);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const refreshTeams = useTeams((s) => s.refresh);
  const pat = useCredentials((s) => s.githubPat);
  const navigate = useNavigate();
  const { ownerId, pat: effectivePat } = useBackendArgs();

  const slots = useMultiplex((s) => s.slots);
  const allFinished = useMultiplex((s) => s.allFinished);
  const globalSpeed = useMultiplex((s) => s.globalSpeed);
  const start = useMultiplex((s) => s.start);
  const setGlobalSpeed = useMultiplex((s) => s.setGlobalSpeed);
  const pauseAll = useMultiplex((s) => s.pauseAll);
  const resumeAll = useMultiplex((s) => s.resumeAll);
  const stopAll = useMultiplex((s) => s.stop);

  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Parameters<typeof save>[0] | null>(null);

  useEffect(() => {
    if (!pat || !competitionId) return;

    async function setup() {
      try {
        const comp = await load(competitionId!, pat!);
        if (!comp) { toast('error', 'Compétition introuvable.'); return; }

        if (teamsStore.length === 0) await refreshTeams(ownerId, effectivePat);

        const roundMatches = comp.matches.filter(
          (m) => m.round === roundNum && m.status === 'pending' && m.homeTeamId && m.awayTeamId,
        );
        if (roundMatches.length === 0) { toast('error', 'Aucun match à simuler.'); return; }

        const inputs: Array<{ compMatchId: string; input: MatchInput }> = [];

        for (const m of roundMatches) {
          const homeSlug = teamsStore.find((t) => t.id === m.homeTeamId)?.slug;
          const awaySlug = teamsStore.find((t) => t.id === m.awayTeamId)?.slug;
          if (!homeSlug || !awaySlug) continue;

          const [homeData, awayData] = await Promise.all([
            fetchTeam(homeSlug, ownerId, effectivePat),
            fetchTeam(awaySlug, ownerId, effectivePat),
          ]);
          if (!homeData || !awayData) continue;

          const mid = `comp-${competitionId}-${m.id}`;
          inputs.push({
            compMatchId: m.id,
            input: {
              matchId: mid,
              home: { team: homeData.team, players: homeData.players, formation: homeData.team.formation },
              away: { team: awayData.team, players: awayData.players, formation: awayData.team.formation },
              speed: '1',
              rules: comp.config.matchRules,
            },
          });
        }

        if (inputs.length === 0) { toast('error', 'Données équipes introuvables.'); return; }
        start(inputs);
      } catch (err) {
        toast('error', String(err));
      } finally {
        setLoading(false);
      }
    }
    setup();

    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pat, competitionId, roundNum]);

  // Compute pending update when all finished — does NOT auto-save
  useEffect(() => {
    if (!allFinished || !current || slots.length === 0 || pendingUpdate) return;

    let updatedMatches = current.matches;
    let updatedStandings = current.standings;
    let updatedPlayerStats = current.playerStats ?? {};

    for (const slot of slots) {
      if (!slot.state || slot.state.status !== 'fulltime') continue;
      const compMatch = current.matches.find((m) => m.id === slot.compMatchId);
      if (!compMatch) continue;

      updatedMatches = updatedMatches.map((m) =>
        m.id === slot.compMatchId
          ? {
              ...m,
              status: 'completed' as const,
              result: {
                home: slot.state!.score.home,
                away: slot.state!.score.away,
                penalties: slot.state!.penaltyScore,
              },
              simulatedAt: new Date().toISOString(),
            }
          : m,
      );

      updatedPlayerStats = accumulateMatchStats(
        updatedPlayerStats,
        slot.state,
        { team: slot.home, players: slot.homePlayers },
        { team: slot.away, players: slot.awayPlayers },
      );

      if ((compMatch.phase === 'group' || compMatch.phase === 'league') && compMatch.homeTeamId && compMatch.awayTeamId) {
        updatedStandings = applyResultToStandings(
          updatedStandings,
          compMatch.homeTeamId,
          compMatch.awayTeamId,
          slot.state.score.home,
          slot.state.score.away,
        );
      } else if (compMatch.phase !== 'group' && compMatch.phase !== 'league') {
        updatedMatches = advanceBracket(updatedMatches, slot.compMatchId);
      }
    }

    const nextRound = updatedMatches.every(
      (m) => m.round <= current.currentRound ? m.status === 'completed' : true,
    )
      ? current.currentRound + 1
      : current.currentRound;

    const allDone = updatedMatches.every((m) => m.status === 'completed');
    let winner: string | undefined;
    if (allDone) {
      const finalMatch = updatedMatches.find((m) => m.phase === 'F');
      if (finalMatch?.result) {
        winner = finalMatch.result.home > finalMatch.result.away
          ? finalMatch.homeTeamId ?? undefined
          : finalMatch.awayTeamId ?? undefined;
      } else if (current.format === 'league') {
        const sorted = Object.values(updatedStandings).sort((a, b) => b.points - a.points);
        winner = sorted[0]?.teamId;
      }
    }

    setPendingUpdate({
      ...current,
      matches: updatedMatches,
      standings: updatedStandings,
      playerStats: updatedPlayerStats,
      awards: allDone ? computeAwards(updatedPlayerStats) : current.awards,
      currentRound: Math.min(nextRound, Math.max(...updatedMatches.map((m) => m.round))),
      status: allDone ? ('completed' as const) : ('ongoing' as const),
      winner,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFinished]);

  async function handleSave() {
    if (!pendingUpdate || !pat) return;
    setSaving(true);
    try {
      await save(pendingUpdate, pat);
      toast('success', 'Résultats enregistrés.');
      setPendingUpdate(null);
    } catch (err) {
      toast('error', `Erreur : ${err}`);
    } finally {
      setSaving(false);
    }
  }

  const SPEEDS: Speed[] = ['0.5', '1', '2', '5', 'instant'];
  const SPEED_LABEL: Record<Speed, string> = { '0.5': '×0.5', '1': '×1', '2': '×2', '5': '×5', instant: '⚡' };

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner className="h-6 w-6" />
        <p className="text-muted text-sm">Chargement des matchs…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to={`/dashboard/competitions/${competitionId}`} className="text-sm text-muted hover:text-text">
            ← {current?.name ?? 'Compétition'}
          </Link>
          <h1 className="mt-1 font-display text-2xl">Multiplex — Journée {roundNum}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setGlobalSpeed(s)}
                className={`px-3 py-1.5 transition-colors ${
                  globalSpeed === s ? 'bg-accent text-white' : 'hover:bg-border/40'
                }`}
              >
                {SPEED_LABEL[s]}
              </button>
            ))}
          </div>
          <button
            onClick={() => { paused ? resumeAll() : pauseAll(); setPaused(!paused); }}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-border/40 transition-colors"
          >
            {paused ? '▶' : '⏸'}
          </button>
        </div>
      </div>

      {allFinished && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 flex items-center justify-between gap-3">
          <span className="font-medium">Tous les matchs sont terminés.</span>
          <div className="flex gap-2">
            {pendingUpdate && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner className="mr-1 h-3 w-3" /> : null}
                Enregistrer les résultats
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate(`/dashboard/competitions/${competitionId}`)}>
              Retour à la compétition
            </Button>
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${slots.length <= 2 ? 'md:grid-cols-2' : slots.length <= 4 ? 'md:grid-cols-2 lg:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
        {slots.map((slot) => (
          <MatchCard key={slot.compMatchId} slot={slot} />
        ))}
      </div>
    </main>
  );
}

function MatchCard({ slot }: { slot: import('@/stores/multiplex').MultiplexSlot }) {
  const state = slot.state;
  const home = slot.home;
  const away = slot.away;

  const prevScoreRef = useRef({ home: 0, away: 0 });
  const [flash, setFlash] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state) return;
    const prev = prevScoreRef.current;
    if (state.score.home > prev.home || state.score.away > prev.away) {
      setFlash(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlash(false), 1500);
    }
    prevScoreRef.current = { ...state.score };
  }, [state?.score.home, state?.score.away]);

  function minuteLabel(): string {
    if (!state) return '—';
    if (state.status === 'pregame') return "0'";
    if (state.status === 'halftime') return 'MT';
    if (state.status === 'fulltime') return 'FT';
    if (state.status === 'penalties') return 'TAB';
    if (state.status === 'extraTimeHalfTime') return 'MT Prol.';
    if (state.half === 1 && state.minute > 45) return `45+${state.minute - 45}'`;
    if (state.half === 2 && state.minute > 90) return `90+${state.minute - 90}'`;
    return `${state.minute}'`;
  }

  // Last 3 notable events
  const notableEvents = state?.events
    .filter((e) => ['goal', 'yellow', 'red', 'penalty'].includes(e.type))
    .slice(-3) ?? [];

  return (
    <motion.div
      className={`rounded-lg border bg-surface p-4 space-y-3 transition-colors ${
        flash ? 'border-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]' : 'border-border'
      } ${slot.finished ? 'opacity-80' : ''}`}
      animate={flash ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="uppercase tracking-wide">
          {state?.status === 'fulltime' ? 'Terminé' : state?.status === 'halftime' ? 'Mi-temps' : 'En cours'}
        </span>
        <span>{minuteLabel()}</span>
      </div>

      {/* Score */}
      <div className="flex items-center gap-3">
        <TeamMini team={home} />
        <div className="flex-1 text-center">
          <div className={`font-display text-3xl tabular-nums ${flash ? 'text-accent' : ''}`}>
            {state?.score.home ?? 0} – {state?.score.away ?? 0}
          </div>
          {state?.penaltyScore && (
            <div className="text-xs text-muted">tab {state.penaltyScore.home}–{state.penaltyScore.away}</div>
          )}
        </div>
        <TeamMini team={away} right />
      </div>

      {/* Recent events */}
      {notableEvents.length > 0 && (
        <div className="space-y-1 border-t border-border/50 pt-2">
          {notableEvents.map((ev) => (
            <div key={ev.id} className="text-xs text-muted truncate">
              {ev.minute}' {ev.text}
            </div>
          ))}
        </div>
      )}

      {!state && (
        <div className="flex justify-center py-2"><Spinner className="h-4 w-4" /></div>
      )}
    </motion.div>
  );
}

function TeamMini({ team, right }: { team: Team; right?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 flex-1 ${right ? 'items-end' : 'items-start'}`}>
      {team.flag ? (
        <img src={team.flag} alt="" className="h-8 w-8 object-cover rounded-sm" />
      ) : (
        <div className="h-8 w-8 rounded-sm bg-border" />
      )}
      <span className="text-xs text-muted truncate max-w-[80px]">{team.name}</span>
    </div>
  );
}
