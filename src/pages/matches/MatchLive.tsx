import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { Pitch } from '@/components/match/Pitch';
import { Scoreboard } from '@/components/match/Scoreboard';
import { EventFeed } from '@/components/match/EventFeed';
import { StatsPanel } from '@/components/match/StatsPanel';
import { SpeedControls } from '@/components/match/SpeedControls';
import { HalftimeOverlay } from '@/components/match/HalftimeOverlay';
import { useMatch } from '@/stores/match';
import { useCredentials } from '@/stores/credentials';
import { saveMatch } from '@/lib/github/matches';

export default function MatchLive() {
  const state = useMatch((s) => s.state);
  const input = useMatch((s) => s.input);
  const paused = useMatch((s) => s.paused);
  const finished = useMatch((s) => s.finished);
  const setSpeed = useMatch((s) => s.setSpeed);
  const pause = useMatch((s) => s.pause);
  const resume = useMatch((s) => s.resume);
  const stop = useMatch((s) => s.stop);
  const pat = useCredentials((s) => s.githubPat);
  const navigate = useNavigate();
  const savedRef = useRef(false);

  // Auto-save on finish
  useEffect(() => {
    if (!finished || !state || !input || !pat || savedRef.current) return;
    savedRef.current = true;
    saveMatch(input, state, pat)
      .then(() => toast('success', 'Match enregistré.'))
      .catch((err) => toast('error', `Sauvegarde : ${err}`));
  }, [finished, state, input, pat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
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
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-5 text-center">
          <div className="font-display text-2xl">Fin du match</div>
          <div className="mt-1 text-sm text-muted">
            {input.home.team.name} {state.score.home} — {state.score.away} {input.away.team.name}
          </div>
          {state.penaltyScore && (
            <div className="mt-1 text-sm text-muted">
              Tirs au but : {state.penaltyScore.home} – {state.penaltyScore.away}
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
