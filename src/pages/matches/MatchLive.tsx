import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

import { Pitch, KitLegend } from '@/components/match/Pitch';
import { resolveKits } from '@/lib/kits';
import { Scoreboard } from '@/components/match/Scoreboard';
import { EventFeed } from '@/components/match/EventFeed';
import { StatsPanel } from '@/components/match/StatsPanel';
import { SpeedControls } from '@/components/match/SpeedControls';
import { HalftimeOverlay } from '@/components/match/HalftimeOverlay';
import { TacticalReportModal } from '@/components/match/TacticalReportModal';
import { PauseTacticPanel } from '@/components/match/PauseTacticPanel';
import { GoalCelebration } from '@/components/match/GoalCelebration';
import { PenaltyShootout } from '@/components/match/PenaltyShootout';
import { useMatch } from '@/stores/match';
import { SubstitutionPanel } from '@/components/match/SubstitutionPanel';

import { computeMotm } from '@/lib/competition/statsAccumulator';
import { isRevealed } from '@/lib/sim/corruption';
import type { SavedTactic, Team } from '@/lib/types';
import { loadLocalSavedTactics, findCounterTactic, tacticToSidePatch } from '@/lib/localTactics';
import { toast } from '@/components/ui/Toast';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { useSession } from '@/stores/session';
import { PrApiTeamBackend } from '@/lib/prapi/teamBackend';
import { PrApiMatchBackend } from '@/lib/prapi/matchBackend';
import type { StoredMatch } from '@/lib/prapi/matchBackend';
import { extractGoalsAndCards } from '@/lib/github/matches';
import type { RecentMatchSummary } from '@/lib/github/matches';

export default function MatchLive() {
  const { prApiToken: effectivePat } = useBackendArgs();
  const session = useSession((s) => s.session);
  const isAdmin = useSession((s) => s.isAdmin());
  const setupPath = isAdmin ? '/match' : '/play';
  const homePath = isAdmin ? '/dashboard' : '/my-team';
  const state = useMatch((s) => s.state);
  const input = useMatch((s) => s.input);
  const paused = useMatch((s) => s.paused);
  const finished = useMatch((s) => s.finished);
  const setSpeed = useMatch((s) => s.setSpeed);
  const pause = useMatch((s) => s.pause);
  const resume = useMatch((s) => s.resume);
  const resetMatch = useMatch((s) => s.reset);
  const manualSub = useMatch((s) => s.manualSub);
  const updateSideTactic = useMatch((s) => s.updateSideTactic);
  const [showSubPanel, setShowSubPanel] = useState(false);
  const [homeSavedTactics, setHomeSavedTactics] = useState<SavedTactic[]>([]);
  const [awaySavedTactics, setAwaySavedTactics] = useState<SavedTactic[]>([]);
  const navigate = useNavigate();
  const savedRef = useRef(false);
  const [corruptionRevealed, setCorruptionRevealed] = useState(false);
  const [showPenalties, setShowPenalties] = useState(false);
  const [penaltiesDone, setPenaltiesDone] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const prevScoreRef = useRef({ home: 0, away: 0 });
  const [celebration, setCelebration] = useState<{ team: Team; score: { home: number; away: number }; scorerName?: string; scorerMinute?: number } | null>(null);
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
      const goalEv = [...state.events].reverse().find((e) => e.type === 'goal' && e.side === 'home');
      const scorer = goalEv?.playerId ? [...input.home.players, ...input.away.players].find((p) => p.id === goalEv.playerId) : undefined;
      triggerCelebration(input.home.team, curr, scorer ? `${scorer.firstName} ${scorer.lastName}` : undefined, goalEv?.minute);
    } else if (curr.away > prev.away) {
      const goalEv = [...state.events].reverse().find((e) => e.type === 'goal' && e.side === 'away');
      const scorer = goalEv?.playerId ? [...input.home.players, ...input.away.players].find((p) => p.id === goalEv.playerId) : undefined;
      triggerCelebration(input.away.team, curr, scorer ? `${scorer.firstName} ${scorer.lastName}` : undefined, goalEv?.minute);
    }
    prevScoreRef.current = { ...curr };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.score.home, state?.score.away]);

  function triggerCelebration(team: Team, score: { home: number; away: number }, scorerName?: string, scorerMinute?: number) {
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    setCelebration({ team, score, scorerName, scorerMinute });
    celebTimerRef.current = setTimeout(() => setCelebration(null), 4000);
  }

  // Clear celebration when halftime/fulltime overlay arrives
  useEffect(() => {
    if (state?.status === 'halftime' || state?.status === 'extraTimeHalfTime' || state?.status === 'fulltime') {
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
      setCelebration(null);
    }
  }, [state?.status]);

  // On finish: save recentMatches to DB + trigger penalty replay or corruption reveal
  useEffect(() => {
    if (!finished || !state || !input || savedRef.current) return;
    savedRef.current = true;

    if (effectivePat && input.countForStats) {
      const playedAt = new Date().toISOString();

      // Save full match record
      const matchBk = new PrApiMatchBackend(effectivePat);
      const storedMatch: StoredMatch = {
        id: input.matchId,
        input,
        state,
        home: { team: input.home.team, players: input.home.players },
        away: { team: input.away.team, players: input.away.players },
        playedAt,
      };
      matchBk.saveMatch(storedMatch).catch(() => {});

      const backend = new PrApiTeamBackend(effectivePat);
      const matchId = input.matchId;
      const homeTeam = input.home.team;
      const awayTeam = input.away.team;
      const score = state.score;

      const allPlayers = [...input.home.players, ...input.away.players];
      const homeGoals = extractGoalsAndCards(state.events, 'home', allPlayers).goals;
      const awayGoals = extractGoalsAndCards(state.events, 'away', allPlayers).goals;

      const slugs = [homeTeam.slug, awayTeam.slug].filter((s): s is string => !!s);
      if (slugs.length > 0) {
        backend.bulkTeams(slugs).then((bulkResults) => {
          const bySlug = new Map(bulkResults.map((r) => [r.team.slug, r]));
          const bulkItems: { slug: string; team: Team; players: typeof bulkResults[number]['players'] }[] = [];
          for (const isHome of [true, false]) {
            const myTeam = isHome ? homeTeam : awayTeam;
            const oppTeam = isHome ? awayTeam : homeTeam;
            const scoreFor = isHome ? score.home : score.away;
            const scoreAgainst = isHome ? score.away : score.home;
            const myGoals = isHome ? homeGoals : awayGoals;
            if (!myTeam.slug) continue;
            const res = bySlug.get(myTeam.slug);
            if (!res) continue;
            const summary: RecentMatchSummary = {
              matchId,
              playedAt,
              opponentSlug: oppTeam.slug ?? '',
              opponentName: oppTeam.name,
              homeAway: isHome ? 'home' : 'away',
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              scoreFor,
              scoreAgainst,
              opponentStrength: oppTeam.globalStrength ?? 50,
              compKind: 'amicale',
              scorers: myGoals.length ? myGoals : undefined,
            };
            const existing = (res.team.recentMatches ?? []).filter((r) => r.matchId !== matchId);
            const merged = [...existing, summary];
            bulkItems.push({ slug: myTeam.slug, team: { ...res.team, recentMatches: merged }, players: res.players });
          }
          return backend.bulkUpdateTeams(bulkItems);
        }).catch(() => {});
      }
    }

    if (state.penaltyScore) {
      setShowPenalties(true);
    } else {
      if (state.corruption?.accepted && isRevealed()) setCorruptionRevealed(true);
    }
  }, [finished, state, input]);

  function handlePenaltiesDone() {
    setShowPenalties(false);
    setPenaltiesDone(true);
    if (state?.corruption?.accepted && isRevealed()) setCorruptionRevealed(true);
  }

  // Load saved tactics for halftime tactic switcher
  useEffect(() => {
    if (!input) return;
    const hLocal = loadLocalSavedTactics(input.home.team.id);
    setHomeSavedTactics(hLocal.savedTactics.length > 0 ? hLocal.savedTactics : (input.home.team.savedTactics ?? []));
    const aLocal = loadLocalSavedTactics(input.away.team.id);
    setAwaySavedTactics(aLocal.savedTactics.length > 0 ? aLocal.savedTactics : (input.away.team.savedTactics ?? []));
  }, [input?.home.team.id, input?.away.team.id]);

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
        <Link to={setupPath} className="text-accent text-sm underline">Retour à la configuration</Link>
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
        scorerName={celebration?.scorerName}
        scorerMinute={celebration?.scorerMinute}
      />

      <div className="flex items-center justify-between">
        <Link to={homePath} className="text-sm text-muted hover:text-text">← {isAdmin ? 'Dashboard' : 'Mon équipe'}</Link>
        {finished ? (
          <Button size="sm" onClick={() => navigate(setupPath)}>Nouveau match</Button>
        ) : null}
      </div>

      <Scoreboard
        state={state}
        home={input.home.team}
        away={input.away.team}
        homeFormation={input.home.formationLabel ?? input.home.formation}
        awayFormation={input.away.formationLabel ?? input.away.formation}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {(() => {
            const kits = resolveKits(input.home.team, input.away.team);
            return (
              <>
                <Pitch
                  state={state}
                  homeFormation={input.home.formation}
                  awayFormation={input.away.formation}
                  homeColor={kits.home}
                  awayColor={kits.away}
                  homeTokenPositions={input.home.tokenPositions}
                  awayTokenPositions={input.away.tokenPositions}
                />
                <KitLegend
                  homeName={input.home.team.name}
                  awayName={input.away.team.name}
                  homeColor={kits.home}
                  awayColor={kits.away}
                  awayAlternate={kits.awayUsedAlternate}
                />
              </>
            );
          })()}
          <SpeedControls
            speed={state.speed}
            paused={paused}
            finished={finished}
            onSpeed={setSpeed}
            onPause={pause}
            onResume={resume}
          />
          {finished && (
            <Button variant="ghost" className="w-full" onClick={() => setShowReport(true)}>Compte-rendu tactique</Button>
          )}
          {paused && !showHalftime && !finished && (
            <PauseTacticPanel
              home={input.home.team}
              away={input.away.team}
              homeSavedTactics={homeSavedTactics}
              awaySavedTactics={awaySavedTactics}
              onTacticChange={(side, tactic) => {
                const team = side === 'home' ? input.home.team : input.away.team;
                updateSideTactic(side, tacticToSidePatch(tactic, team));
                // Riposte : contre-tactique adverse déclenchée en plein match
                const opp = side === 'home' ? 'away' as const : 'home' as const;
                const oppTeam = opp === 'home' ? input.home.team : input.away.team;
                const counter = findCounterTactic(oppTeam, team.id, tactic.id);
                if (counter) {
                  updateSideTactic(opp, tacticToSidePatch(counter, oppTeam));
                  toast('success', `⚔ ${oppTeam.name} riposte : « ${counter.name} »`);
                }
              }}
            />
          )}
          {!finished && (state.status === 'firstHalf' || state.status === 'secondHalf' || state.status === 'extraTimeFirst' || state.status === 'extraTimeSecond') && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowSubPanel(true)}>
                ↔ Remplacements
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-6">
          <StatsPanel state={state} />
          <EventFeed events={state.events} />
        </div>
      </div>

      {showSubPanel && (
        <SubstitutionPanel
          state={state}
          homePlayers={input.home.players}
          awayPlayers={input.away.players}
          onSub={(side, outId, inId) => { manualSub(side, outId, inId); setShowSubPanel(false); }}
          onClose={() => setShowSubPanel(false)}
          allowedSides={isAdmin ? undefined : (() => {
            const sides: ('home' | 'away')[] = [];
            if (input.home.team.managerDiscordId === session?.id) sides.push('home');
            if (input.away.team.managerDiscordId === session?.id) sides.push('away');
            return sides.length > 0 ? sides : ['home'];
          })()}
        />
      )}

      {showHalftime ? (
        <HalftimeOverlay
          state={state}
          home={input.home.team}
          away={input.away.team}
          homeSavedTactics={homeSavedTactics}
          awaySavedTactics={awaySavedTactics}
          homeReportSide={{ ...input.home, savedTactics: homeSavedTactics }}
          awayReportSide={{ ...input.away, savedTactics: awaySavedTactics }}
          onTacticChange={(side, tactic) => {
            const team = side === 'home' ? input.home.team : input.away.team;
            updateSideTactic(side, tacticToSidePatch(tactic, team));
            // Riposte : contre-tactique adverse déclenchée en plein match
            const opp = side === 'home' ? 'away' as const : 'home' as const;
            const oppTeam = opp === 'home' ? input.home.team : input.away.team;
            const counter = findCounterTactic(oppTeam, team.id, tactic.id);
            if (counter) {
              updateSideTactic(opp, tacticToSidePatch(counter, oppTeam));
              toast('success', `⚔ ${oppTeam.name} riposte : « ${counter.name} »`);
            }
          }}
          onResume={resume}
        />
      ) : null}

      {isET && !showHalftime && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-center text-sm text-warning">
          ⏱ Prolongations en cours
        </div>
      )}

      {showPenalties && state && (
        <PenaltyShootout
          state={state}
          home={input.home.team}
          away={input.away.team}
          onDone={handlePenaltiesDone}
        />
      )}

      {finished && (!state?.penaltyScore || penaltiesDone) ? (
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

      {showReport && state && (
        <TacticalReportModal
          state={state}
          home={{ ...input.home, savedTactics: homeSavedTactics }}
          away={{ ...input.away, savedTactics: awaySavedTactics }}
          onClose={() => setShowReport(false)}
        />
      )}

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
