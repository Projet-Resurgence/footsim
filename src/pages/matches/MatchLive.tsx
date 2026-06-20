import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

import { Pitch } from '@/components/match/Pitch';
import { Scoreboard } from '@/components/match/Scoreboard';
import { EventFeed } from '@/components/match/EventFeed';
import { StatsPanel } from '@/components/match/StatsPanel';
import { SpeedControls } from '@/components/match/SpeedControls';
import { HalftimeOverlay } from '@/components/match/HalftimeOverlay';
import { GoalCelebration } from '@/components/match/GoalCelebration';
import { useMatch } from '@/stores/match';


import { computeMotm } from '@/lib/competition/statsAccumulator';
import { isRevealed } from '@/lib/sim/corruption';
import type { Team } from '@/lib/types';

export default function MatchLive() {
  const state = useMatch((s) => s.state);
  const input = useMatch((s) => s.input);
  const paused = useMatch((s) => s.paused);
  const finished = useMatch((s) => s.finished);
  const setSpeed = useMatch((s) => s.setSpeed);
  const pause = useMatch((s) => s.pause);
  const resume = useMatch((s) => s.resume);
  const resetMatch = useMatch((s) => s.reset);
  const navigate = useNavigate();
  const savedRef = useRef(false);
  const [corruptionRevealed, setCorruptionRevealed] = useState(false);

  const prevScoreRef = useRef({ home: 0, away: 0 });
  const [celebration, setCelebration] = useState<{ team: Team; score: { home: number; away: number } } | null>(null);
  const celebTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const motm = finished && state && input
    ? computeMotm(
        state,
        { team: input.home.team, players: input.home.players },
        { team: input.away.team, players: input.away.players },
      )
    : null;

  // Detect goals
  useEffect(() => {
    if (!state || !input) return;
    const prev = prevScoreRef.current;
    const curr = state.score;

    if (curr.home > prev.home) {
      triggerCelebration(input.home.team, curr);
    } else if (curr.away > prev.away) {
      triggerCelebration(input.away.team, curr);
    }
    prevScoreRef.current = { ...curr };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.score.home, state?.score.away]);

  function triggerCelebration(team: Team, score: { home: number; away: number }) {
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    setCelebration({ team, score });
    celebTimerRef.current = setTimeout(() => setCelebration(null), 3000);
  }

  // Corruption reveal check on finish
  useEffect(() => {
    if (!finished || !state || !input || savedRef.current) return;
    savedRef.current = true;
    if (state.corruption?.accepted && isRevealed()) {
      setCorruptionRevealed(true);
    }
  }, [finished, state, input]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetMatch();
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state || !input) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Spinner className="h-6 w-6" />
        <p className="text-muted text-sm">Préparation du match…</p>
        <Link to="/match" className="text-accent text-sm underline">Retour à la configuration</Link>
      </main>
    );
  }

  const showHalftime = state.status === 'halftime' || state.status === 'extraTimeHalfTime';
  const isET = state.status === 'extraTimeFirst' || state.status === 'extraTimeHalfTime' || state.status === 'extraTimeSecond';

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <GoalCelebration
        visible={celebration !== null}
        scoringTeam={celebration?.team ?? null}
        home={input.home.team}
        away={input.away.team}
        score={celebration?.score ?? state.score}
      />

      <div className="flex items-center justify-between">
        <Link to="/dashboard" className="text-sm text-muted hover:text-text">← Dashboard</Link>
        {finished ? (
          <Button size="sm" onClick={() => navigate('/match')}>Nouveau match</Button>
        ) : null}
      </div>

      <Scoreboard state={state} home={input.home.team} away={input.away.team} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Pitch state={state} homeFormation={input.home.formation} awayFormation={input.away.formation} />
          <SpeedControls
            speed={state.speed}
            paused={paused}
            finished={finished}
            onSpeed={setSpeed}
            onPause={pause}
            onResume={resume}
          />
        </div>
        <div className="space-y-6">
          <StatsPanel state={state} />
          <EventFeed events={state.events} />
        </div>
      </div>

      {showHalftime ? (
        <HalftimeOverlay
          state={state}
          home={input.home.team}
          away={input.away.team}
          onResume={resume}
        />
      ) : null}

      {isET && !showHalftime && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-center text-sm text-warning">
          ⏱ Prolongations en cours
        </div>
      )}

      {finished ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-5 text-center space-y-4">
          <div className="font-display text-2xl">Fin du match</div>
          <div className="text-sm text-muted">
            {input.home.team.name} {state.score.home} — {state.score.away} {input.away.team.name}
          </div>
          {state.penaltyScore && (
            <div className="text-sm text-muted">
              Tirs au but : {state.penaltyScore.home} – {state.penaltyScore.away}
            </div>
          )}
          {motm && (
            <div className="inline-flex flex-col items-center gap-1 rounded-md border border-warning/30 bg-warning/5 px-5 py-3">
              <div className="text-xs uppercase tracking-widest text-muted">🏅 Homme du match</div>
              <div className="font-display text-lg">{motm.playerName}</div>
              <div className="text-xs text-muted">{motm.teamName}</div>
              <div className="text-sm font-medium text-warning">{motm.rating.toFixed(1)} / 10</div>
            </div>
          )}
        </div>
      ) : null}

      {corruptionRevealed && state.corruption && (
        <div className="rounded-lg border border-danger bg-danger/10 p-5 text-center space-y-2">
          <div className="font-display text-2xl text-danger">🚨 Scandale révélé !</div>
          <div className="text-sm">
            La corruption de{' '}
            <span className="font-medium">
              {state.corruption.side === 'home' ? input.home.team.name : input.away.team.name}
            </span>{' '}
            ({state.corruption.bribe}M€) a été découverte par les autorités.
          </div>
          <div className="text-sm text-danger font-medium">
            Le match est annulé. L'équipe est disqualifiée.
          </div>
        </div>
      )}
    </main>
  );
}
