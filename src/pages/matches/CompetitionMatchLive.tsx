import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { Pitch } from '@/components/match/Pitch';
import { Scoreboard } from '@/components/match/Scoreboard';
import { EventFeed } from '@/components/match/EventFeed';
import { StatsPanel } from '@/components/match/StatsPanel';
import { SpeedControls } from '@/components/match/SpeedControls';
import { HalftimeOverlay } from '@/components/match/HalftimeOverlay';
import { GoalCelebration } from '@/components/match/GoalCelebration';
import { useMatch } from '@/stores/match';
import { useCompetition } from '@/stores/competition';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';
import { saveMatch } from '@/lib/github/matches';
import { advanceBracket, applyResultToStandings } from '@/lib/competition/scheduler';

import type { Team } from '@/lib/types';
import type { MatchInput } from '@/lib/sim/types';

export default function CompetitionMatchLive() {
  const { competitionId, matchId } = useParams<{ competitionId: string; matchId: string }>();
  const load = useCompetition((s) => s.load);
  const save = useCompetition((s) => s.save);
  const setCurrent = useCompetition((s) => s.setCurrent);
  const current = useCompetition((s) => s.current);
  const teamsStore = useTeams((s) => s.teams);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const refreshTeams = useTeams((s) => s.refresh);
  const pat = useCredentials((s) => s.githubPat);
  const navigate = useNavigate();

  const matchState = useMatch((s) => s.state);
  const matchInput = useMatch((s) => s.input);
  const paused = useMatch((s) => s.paused);
  const finished = useMatch((s) => s.finished);
  const setSpeed = useMatch((s) => s.setSpeed);
  const pause = useMatch((s) => s.pause);
  const resume = useMatch((s) => s.resume);
  const stop = useMatch((s) => s.stop);
  const startMatch = useMatch((s) => s.start);

  const dirty = useCompetition((s) => s.dirty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  const prevScoreRef = useRef({ home: 0, away: 0 });
  const [celebration, setCelebration] = useState<{ team: Team; score: { home: number; away: number } } | null>(null);
  const celebTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset all per-match state when params change (même composant réutilisé)
  useEffect(() => {
    savedRef.current = false;
    prevScoreRef.current = { home: 0, away: 0 };
    setCelebration(null);
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    setLoading(true);
  }, [competitionId, matchId]);

  useEffect(() => {
    if (!pat || !competitionId || !matchId) return;
    async function setup() {
      try {
        const comp = await load(competitionId!, pat!);
        if (!comp) { toast('error', 'Compétition introuvable.'); return; }

        const compMatch = comp.matches.find((m) => m.id === matchId);
        if (!compMatch) { toast('error', 'Match introuvable.'); return; }
        if (!compMatch.homeTeamId || !compMatch.awayTeamId) {
          toast('error', 'Équipes non définies pour ce match.');
          return;
        }

        if (teamsStore.length === 0) await refreshTeams(pat!);

        const homeSlug = teamsStore.find((t) => t.id === compMatch.homeTeamId)?.slug;
        const awaySlug = teamsStore.find((t) => t.id === compMatch.awayTeamId)?.slug;

        if (!homeSlug || !awaySlug) { toast('error', 'Équipes introuvables.'); return; }

        const [homeData, awayData] = await Promise.all([
          fetchTeam(homeSlug, pat!),
          fetchTeam(awaySlug, pat!),
        ]);

        if (!homeData || !awayData) { toast('error', 'Données équipes introuvables.'); return; }

        const mid = `comp-${competitionId}-${matchId}`;
        const input: MatchInput = {
          matchId: mid,
          home: {
            team: homeData.team,
            players: homeData.players,
            formation: homeData.team.formation,
          },
          away: {
            team: awayData.team,
            players: awayData.players,
            formation: awayData.team.formation,
          },
          speed: '1',
          rules: comp.config.matchRules,
        };
        startMatch(input);
      } catch (err) {
        toast('error', String(err));
      } finally {
        setLoading(false);
      }
    }
    setup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pat, competitionId, matchId]);

  // Detect goals for celebration
  useEffect(() => {
    if (!matchState || !matchInput) return;
    if (matchState.matchId !== matchInput.matchId) return;
    const prev = prevScoreRef.current;
    const curr = matchState.score;
    if (curr.home > prev.home) triggerCelebration(matchInput.home.team, curr);
    else if (curr.away > prev.away) triggerCelebration(matchInput.away.team, curr);
    prevScoreRef.current = { ...curr };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchState?.score.home, matchState?.score.away]);

  function triggerCelebration(team: Team, score: { home: number; away: number }) {
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    setCelebration({ team, score });
    celebTimerRef.current = setTimeout(() => setCelebration(null), 3000);
  }

  // Save result to competition on finish
  useEffect(() => {
    if (!finished || !matchState || !matchInput || !pat || !current || !matchId || savedRef.current) return;
    savedRef.current = true;

    async function persist() {
      const compMatch = current!.matches.find((m) => m.id === matchId);
      if (!compMatch) return;

      let updatedMatches = current!.matches.map((m) =>
        m.id === matchId
          ? {
              ...m,
              status: 'completed' as const,
              result: {
                home: matchState!.score.home,
                away: matchState!.score.away,
                penalties: matchState!.penaltyScore,
              },
              matchFileId: matchState!.matchId,
              simulatedAt: new Date().toISOString(),
            }
          : m,
      );

      if (compMatch.phase !== 'group' && compMatch.phase !== 'league') {
        updatedMatches = advanceBracket(updatedMatches, matchId!);
      }

      let updatedStandings = current!.standings;
      if ((compMatch.phase === 'group' || compMatch.phase === 'league') && compMatch.homeTeamId && compMatch.awayTeamId) {
        updatedStandings = applyResultToStandings(
          updatedStandings,
          compMatch.homeTeamId,
          compMatch.awayTeamId,
          matchState!.score.home,
          matchState!.score.away,
        );
      }

      const nextRound = updatedMatches.every(
        (m) => m.round <= current!.currentRound ? m.status === 'completed' : true,
      )
        ? current!.currentRound + 1
        : current!.currentRound;

      const allDone = updatedMatches.every((m) => m.status === 'completed');
      let winner: string | undefined;
      if (allDone) {
        const finalMatch = updatedMatches.find((m) => m.phase === 'F');
        if (finalMatch?.result) {
          winner = finalMatch.result.home > finalMatch.result.away
            ? finalMatch.homeTeamId ?? undefined
            : finalMatch.awayTeamId ?? undefined;
        } else if (current!.format === 'league') {
          const sorted = Object.values(updatedStandings).sort((a, b) => b.points - a.points);
          winner = sorted[0]?.teamId;
        }
      }

      const updated = {
        ...current!,
        matches: updatedMatches,
        standings: updatedStandings,
        currentRound: Math.min(nextRound, Math.max(...updatedMatches.map((m) => m.round))),
        status: allDone ? ('completed' as const) : ('ongoing' as const),
        winner,
      };

      // Résultat appliqué en mémoire + localStorage — sauvegarde GitHub manuelle
      setCurrent(updated);
      toast('success', 'Résultat enregistré localement.');
    }
    persist();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  useEffect(() => {
    return () => {
      stop();
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !matchState || !matchInput) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner className="h-6 w-6" />
        <p className="text-muted text-sm">Préparation du match…</p>
      </main>
    );
  }

  const showHalftime = matchState.status === 'halftime' || matchState.status === 'extraTimeHalfTime';
  const isET = matchState.status === 'extraTimeFirst' || matchState.status === 'extraTimeHalfTime' || matchState.status === 'extraTimeSecond';

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <GoalCelebration
        visible={celebration !== null}
        scoringTeam={celebration?.team ?? null}
        home={matchInput.home.team}
        away={matchInput.away.team}
        score={celebration?.score ?? matchState.score}
      />

      <div className="flex items-center justify-between">
        <Link to={`/dashboard/competitions/${competitionId}`} className="text-sm text-muted hover:text-text">
          ← {current?.name ?? 'Compétition'}
        </Link>
        {finished && (
          <Button size="sm" onClick={() => navigate(`/dashboard/competitions/${competitionId}`)}>
            Retour à la compétition
          </Button>
        )}
      </div>

      <Scoreboard state={matchState} home={matchInput.home.team} away={matchInput.away.team} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Pitch state={matchState} homeFormation={matchInput.home.formation} awayFormation={matchInput.away.formation} />
          <SpeedControls
            speed={matchState.speed}
            paused={paused}
            finished={finished}
            onSpeed={setSpeed}
            onPause={pause}
            onResume={resume}
          />
        </div>
        <div className="space-y-6">
          <StatsPanel state={matchState} />
          <EventFeed events={matchState.events} />
        </div>
      </div>

      {showHalftime && (
        <HalftimeOverlay
          state={matchState}
          home={matchInput.home.team}
          away={matchInput.away.team}
          onResume={resume}
        />
      )}

      {isET && !showHalftime && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-center text-sm text-warning">
          ⏱ Prolongations en cours
        </div>
      )}

      {finished && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-5 text-center space-y-4">
          <div className="font-display text-2xl">Fin du match</div>
          <div className="text-sm text-muted">
            {matchInput.home.team.name} {matchState.score.home} — {matchState.score.away} {matchInput.away.team.name}
          </div>
          {matchState.penaltyScore && (
            <div className="text-sm text-muted">
              Tirs au but : {matchState.penaltyScore.home} – {matchState.penaltyScore.away}
            </div>
          )}
          {dirty && (
            <div className="flex flex-wrap justify-center gap-3 pt-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={async () => {
                  if (!pat || !current) return;
                  setSaving(true);
                  try {
                    await saveMatch(matchInput, matchState, pat);
                    toast('success', 'Match sauvegardé sur GitHub.');
                  } catch (err) {
                    toast('error', `Match : ${err}`);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? <Spinner className="h-4 w-4" /> : 'Sauvegarder le match'}
              </Button>
              <Button
                size="sm"
                disabled={saving}
                onClick={async () => {
                  if (!pat || !current) return;
                  setSaving(true);
                  try {
                    await save(current, pat);
                    toast('success', 'Compétition sauvegardée sur GitHub.');
                  } catch (err) {
                    toast('error', `Compétition : ${err}`);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? <Spinner className="h-4 w-4" /> : 'Sauvegarder la compétition'}
              </Button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
