import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
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
import { useCompetition } from '@/stores/competition';
import { useTeams } from '@/stores/teams';

import { useBackendArgs } from '@/hooks/useBackendArgs';
import { extractGoalsAndCards, calcCmfMatchPoints } from '@/lib/github/matches';
import type { RecentMatchSummary } from '@/lib/github/matches';
import type { CompHistoryEntry } from '@/lib/competition/types';
import { deriveTeamResult, deriveTeamPhase } from '@/lib/competition/teamResult';
import { PrApiTeamBackend } from '@/lib/prapi/teamBackend';
import { PrApiMatchBackend } from '@/lib/prapi/matchBackend';
import type { StoredMatch } from '@/lib/prapi/matchBackend';
import { advanceBracket, applyResultToStandings, applyCorruptionDisqualification, applyPointsPenalty } from '@/lib/competition/scheduler';
import { rulesForPhase } from '@/lib/competition/types';
import type { MatchSummary } from '@/lib/competition/types';
import { resolveMatchTactics, resolveActiveCustomStyle, loadLocalSavedTactics, findCounterTactic, tacticToSidePatch } from '@/lib/localTactics';
import { rollWeather, hashSeed } from '@/lib/sim/weather';
import { pickReferee } from '@/lib/sim/referees';
import { updateMorale, initMorale, MORALE_DEFAULT } from '@/lib/competition/morale';
import { generateMatchPressItem, generateMoralePressItem, generatePresidencyReboundItem, generateDrameItem, generateDrameHommageItem, generateCmfItems, generateCmfCommunique, generateCmfEnqueteItem, generateCmfJugementItem, generateFormePressItem, generateCoachScandalItem, buildMatchFacts, computeMatchCotes, generateRefereePressItem, generateCmfDisciplineItem, generateFixingScandalItem, generateLockerRoomBrawlItem, generateDiscriminationItem } from '@/lib/competition/press';
import { createMatchInjury, createSuspension, decrementInjuries, decrementSuspensions, unavailableIds } from '@/lib/competition/injuries';

/** RNG déterministe seedé (même famille que les rng internes de press.ts). */
function rngFromSeed(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(31, h) + seed.charCodeAt(i) | 0; }
  return () => { h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; return (h >>> 0) / 0xffffffff; };
}

import type { SavedTactic, Team } from '@/lib/types';
import type { MatchInput } from '@/lib/sim/types';
import { accumulateMatchStats, computeAwards, computeMotm, type MotmResult } from '@/lib/competition/statsAccumulator';
import { isRevealed } from '@/lib/sim/corruption';

export default function CompetitionMatchLive() {
  const { competitionId, matchId } = useParams<{ competitionId: string; matchId: string }>();
  const load = useCompetition((s) => s.load);
  const save = useCompetition((s) => s.save);
  const setCurrent = useCompetition((s) => s.setCurrent);
  const current = useCompetition((s) => s.current);
  const teamsStore = useTeams((s) => s.teams);
  const refreshTeams = useTeams((s) => s.refresh);
  
  const navigate = useNavigate();
  const { ownerId, prApiToken: effectivePat } = useBackendArgs();

  const matchState = useMatch((s) => s.state);
  const matchInput = useMatch((s) => s.input);
  const paused = useMatch((s) => s.paused);
  const finished = useMatch((s) => s.finished);
  const setSpeed = useMatch((s) => s.setSpeed);
  const pause = useMatch((s) => s.pause);
  const resume = useMatch((s) => s.resume);
  const resetMatch = useMatch((s) => s.reset);
  const startMatch = useMatch((s) => s.start);
  const updateSideTactic = useMatch((s) => s.updateSideTactic);

  const currentRef = useRef<typeof current>(null);
  useEffect(() => { currentRef.current = current; }, [current]);
  const [loading, setLoading] = useState(true);
  const [saving] = useState(false);
  const [motm, setMotm] = useState<MotmResult | null>(null);
  const [corruptionRevealed, setCorruptionRevealed] = useState(false);
  const [winnerTeamId, setWinnerTeamId] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [_compMatchPhase, setCompMatchPhase] = useState<string | null>(null);
  const [showPenalties, setShowPenalties] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [penaltiesDone, setPenaltiesDone] = useState(false);
  const [homeSavedTactics, setHomeSavedTactics] = useState<SavedTactic[]>([]);
  const [awaySavedTactics, setAwaySavedTactics] = useState<SavedTactic[]>([]);
  const savedRef = useRef(false);
  const prevScoreRef = useRef({ home: 0, away: 0 });
  const [celebration, setCelebration] = useState<{ team: Team; score: { home: number; away: number }; scorerName?: string; scorerMinute?: number } | null>(null);
  const celebTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset all per-match state when params change (même composant réutilisé)
  useEffect(() => {
    savedRef.current = false;
    prevScoreRef.current = { home: 0, away: 0 };
    setCelebration(null);
    setMotm(null);
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    setLoading(true);
  }, [competitionId, matchId]);

  useEffect(() => {
    if (!effectivePat || !competitionId || !matchId) return;
    async function setup() {
      try {
        const comp = await load(competitionId!, '', effectivePat);
        if (!comp) { toast('error', 'Compétition introuvable.'); return; }

        const compMatch = comp.matches.find((m) => m.id === matchId);
        if (!compMatch) { toast('error', 'Match introuvable.'); return; }
        if (!compMatch.homeTeamId || !compMatch.awayTeamId) {
          toast('error', 'Équipes non définies pour ce match.');
          return;
        }

        // Resolve slug from teamSnapshot first (no listTeams needed), fall back to store
        const snapHome = comp.teamSnapshot?.[compMatch.homeTeamId]?.slug;
        const snapAway = comp.teamSnapshot?.[compMatch.awayTeamId]?.slug;
        if ((!snapHome || !snapAway) && teamsStore.length === 0) {
          await refreshTeams(ownerId, null, effectivePat);
        }

        const homeSlug = snapHome ?? teamsStore.find((t) => t.id === compMatch.homeTeamId)?.slug;
        const awaySlug = snapAway ?? teamsStore.find((t) => t.id === compMatch.awayTeamId)?.slug;

        if (!homeSlug || !awaySlug) { toast('error', 'Équipes introuvables.'); return; }

        const bulkData = await new PrApiTeamBackend(effectivePat!).bulkTeams([homeSlug, awaySlug]);
        const homeData = bulkData.find((r) => r.team.slug === homeSlug) ?? null;
        const awayData = bulkData.find((r) => r.team.slug === awaySlug) ?? null;

        if (!homeData || !awayData) { toast('error', 'Données équipes introuvables.'); return; }

        const mid = `comp-${competitionId}-${matchId}`;
        const storedCorruption = sessionStorage.getItem(`footsim.corruption.${matchId}`);
        const corruption = storedCorruption ? JSON.parse(storedCorruption) : undefined;
        sessionStorage.removeItem(`footsim.corruption.${matchId}`);

        const storedTactics = sessionStorage.getItem(`footsim.tactics.${matchId}`);
        const tacticOverride: { homeId?: string; awayId?: string } = storedTactics ? JSON.parse(storedTactics) : {};
        sessionStorage.removeItem(`footsim.tactics.${matchId}`);

        // Resolve pre-match tactic override (selected in PreMatchModal)
        const homeLocalTactics = loadLocalSavedTactics(homeData.team.id);
        const awayLocalTactics = loadLocalSavedTactics(awayData.team.id);
        const allHomeTactics = homeLocalTactics.savedTactics.length > 0 ? homeLocalTactics.savedTactics : (homeData.team.savedTactics ?? []);
        const allAwayTactics = awayLocalTactics.savedTactics.length > 0 ? awayLocalTactics.savedTactics : (awayData.team.savedTactics ?? []);
        const selectedHomeTactic = tacticOverride.homeId ? allHomeTactics.find((t) => t.id === tacticOverride.homeId) : undefined;
        const selectedAwayTactic = tacticOverride.awayId ? allAwayTactics.find((t) => t.id === tacticOverride.awayId) : undefined;

        const resolved = resolveMatchTactics(homeData.team, awayData.team, {
          home: selectedHomeTactic ?? undefined,
          away: selectedAwayTactic ?? undefined,
        });
        const homeTactics = resolved.home;
        const awayTactics = resolved.away;

        const moraleMap = comp.morale ?? initMorale(comp.teamIds);
        const compInjuries = comp.injuries ?? [];
        const compSuspensions = comp.suspensions ?? [];
        const homeUnavail = unavailableIds(compMatch.homeTeamId!, compInjuries, compSuspensions);
        const awayUnavail = unavailableIds(compMatch.awayTeamId!, compInjuries, compSuspensions);

        const baseRules = rulesForPhase(comp.config, compMatch.phase);
        // LPM barrage: leg 1 settles nothing on its own (aggregate decides); leg 2 always
        // goes to extra time + penalties on an aggregate draw, regardless of base config.
        const matchRules = compMatch.phase === 'lpm_playoff'
          ? compMatch.leg === 1
            ? { ...baseRules, extraTime: false, penalties: false }
            : { ...baseRules, extraTime: true, penalties: true }
          : baseRules;

        // For two-legged ties (leg 2): find leg 1 score for aggregate-aware ET
        let leg1Score: { home: number; away: number } | undefined;
        if (compMatch.leg === 2 && compMatch.phase === 'lpm_playoff') {
          const leg1 = comp.matches.find(
            (m) => m.phase === 'lpm_playoff' && m.leg === 1
              && ((m.homeTeamId === compMatch.awayTeamId && m.awayTeamId === compMatch.homeTeamId)
                || (m.homeTeamId === compMatch.homeTeamId && m.awayTeamId === compMatch.awayTeamId))
              && m.status === 'completed' && m.result,
          );
          if (leg1?.result) {
            // Express leg1 score from leg2's perspective (leg2 home team was leg1 away team)
            if (leg1.homeTeamId === compMatch.awayTeamId) {
              leg1Score = { home: leg1.result.away, away: leg1.result.home };
            } else {
              leg1Score = { home: leg1.result.home, away: leg1.result.away };
            }
          }
        }

        const countForStatsRaw = sessionStorage.getItem(`footsim.countForStats.${mid}`);
        const countForStats = countForStatsRaw !== null ? JSON.parse(countForStatsRaw) as boolean : true;
        sessionStorage.removeItem(`footsim.countForStats.${mid}`);
        const homeAdvRaw = sessionStorage.getItem(`footsim.homeAdvantage.${mid}`);
        const homeAdvantage = homeAdvRaw !== null ? JSON.parse(homeAdvRaw) as boolean : false;
        sessionStorage.removeItem(`footsim.homeAdvantage.${mid}`);

        // Météo tirée dans la zone climatique de la compétition (déterministe par match)
        const weather = comp.config.climateZone
          ? rollWeather(comp.config.climateZone, hashSeed(mid))
          : undefined;
        const referee = pickReferee(hashSeed(mid));

        const input: MatchInput = {
          matchId: mid,
          home: {
            team: homeData.team,
            players: homeData.players,
            formation: homeTactics?.formation ?? homeData.team.formation,
            lineup: homeTactics?.lineup,
            bench: homeTactics?.bench,
            plannedSubs: homeTactics?.plannedSubs,
            planB: homeTactics?.planB,
            setPieceTakers: homeTactics?.setPieceTakers,
            captainId: homeTactics?.captainId,
            tacticStyle: homeTactics?.style,
            customTacticStyle: resolveActiveCustomStyle(homeTactics, homeData.team),
            morale: moraleMap[compMatch.homeTeamId!] ?? MORALE_DEFAULT,
            unavailablePlayerIds: [...homeUnavail].filter((id) => id !== 'coach'),
            positionMap: homeTactics?.positionMap,
            tokenPositions: homeTactics?.tokenPositions,
            formationLabel: homeTactics?.formationLabel,
            hasTactic: !!homeTactics,
          },
          away: {
            team: awayData.team,
            players: awayData.players,
            formation: awayTactics?.formation ?? awayData.team.formation,
            formationLabel: awayTactics?.formationLabel,
            lineup: awayTactics?.lineup,
            bench: awayTactics?.bench,
            plannedSubs: awayTactics?.plannedSubs,
            planB: awayTactics?.planB,
            setPieceTakers: awayTactics?.setPieceTakers,
            captainId: awayTactics?.captainId,
            tacticStyle: awayTactics?.style,
            customTacticStyle: resolveActiveCustomStyle(awayTactics, awayData.team),
            morale: moraleMap[compMatch.awayTeamId!] ?? MORALE_DEFAULT,
            unavailablePlayerIds: [...awayUnavail].filter((id) => id !== 'coach'),
            hasTactic: !!awayTactics,
            positionMap: awayTactics?.positionMap,
            tokenPositions: awayTactics?.tokenPositions,
          },
          speed: '1',
          rules: { ...matchRules, homeAdvantage },
          weather,
          referee,
          corruption,
          leg1Score,
          countForStats,
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
  }, [effectivePat, competitionId, matchId]);

  // Detect goals for celebration
  useEffect(() => {
    if (!matchState || !matchInput) return;
    if (matchState.matchId !== matchInput.matchId) return;
    const prev = prevScoreRef.current;
    const curr = matchState.score;
    const allPlayers = [...matchInput.home.players, ...matchInput.away.players];
    if (curr.home > prev.home) {
      const goalEv = [...matchState.events].reverse().find((e) => e.type === 'goal' && e.side === 'home');
      const scorer = goalEv?.playerId ? allPlayers.find((p) => p.id === goalEv.playerId) : undefined;
      triggerCelebration(matchInput.home.team, curr, scorer ? `${scorer.firstName} ${scorer.lastName}` : undefined, goalEv?.minute);
    } else if (curr.away > prev.away) {
      const goalEv = [...matchState.events].reverse().find((e) => e.type === 'goal' && e.side === 'away');
      const scorer = goalEv?.playerId ? allPlayers.find((p) => p.id === goalEv.playerId) : undefined;
      triggerCelebration(matchInput.away.team, curr, scorer ? `${scorer.firstName} ${scorer.lastName}` : undefined, goalEv?.minute);
    }
    prevScoreRef.current = { ...curr };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchState?.score.home, matchState?.score.away]);

  function triggerCelebration(team: Team, score: { home: number; away: number }, scorerName?: string, scorerMinute?: number) {
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
    setCelebration({ team, score, scorerName, scorerMinute });
    celebTimerRef.current = setTimeout(() => setCelebration(null), 4000);
  }

  // Clear celebration when halftime/fulltime overlay arrives
  useEffect(() => {
    if (matchState?.status === 'halftime' || matchState?.status === 'extraTimeHalfTime' || matchState?.status === 'fulltime') {
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
      setCelebration(null);
    }
  }, [matchState?.status]);

  // Load saved tactics for halftime tactic switcher
  useEffect(() => {
    if (!matchInput) return;
    const hLocal = loadLocalSavedTactics(matchInput.home.team.id);
    setHomeSavedTactics(hLocal.savedTactics.length > 0 ? hLocal.savedTactics : (matchInput.home.team.savedTactics ?? []));
    const aLocal = loadLocalSavedTactics(matchInput.away.team.id);
    setAwaySavedTactics(aLocal.savedTactics.length > 0 ? aLocal.savedTactics : (matchInput.away.team.savedTactics ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchInput?.home.team.id, matchInput?.away.team.id]);

  // Trigger penalty animation on finish
  useEffect(() => {
    if (!finished || !matchState) return;
    if (matchState.penaltyScore) setShowPenalties(true);
  }, [finished, matchState]);

  // Save result to competition on finish
  useEffect(() => {
    const snap = currentRef.current ?? current;
    if (!finished || !matchState || !matchInput || !effectivePat || !snap || !matchId || savedRef.current) return;
    savedRef.current = true;

    async function persist() {
      const compMatch = snap!.matches.find((m) => m.id === matchId);
      if (!compMatch) return;

      // Capture phase for render
      setCompMatchPhase(compMatch.phase ?? null);
      const isFinalMatch = compMatch.phase === 'F';
      setIsFinal(isFinalMatch);

      // Check corruption revelation before applying result
      const corruptionActive = (matchState!.corruption?.accepted ?? false) && matchState!.corruption?.side !== 'both' && !matchState!.corruption?.refusedByRef;
      const revealed = corruptionActive && isRevealed();
      // refusedByRef: walkover applies to THIS match (50%)
      const refRefusedActive = (matchState!.corruption?.refusedByRef ?? false) && matchState!.corruption?.side !== 'both';
      const refusalWalkoverApplied = refRefusedActive && Math.random() < 0.5;

      const motmResult = computeMotm(
        matchState!,
        { team: matchInput!.home.team, players: matchInput!.home.players },
        { team: matchInput!.away.team, players: matchInput!.away.players },
      );
      const ms = matchState!;
      const allPlayers = [...matchInput!.home.players, ...matchInput!.away.players];
      const homeGoalCards = extractGoalsAndCards(ms.events, 'home', allPlayers);
      const awayGoalCards = extractGoalsAndCards(ms.events, 'away', allPlayers);
      const isWalkover = revealed || refusalWalkoverApplied;
      const zeroSide = { home: 0, away: 0 };
      const matchSummary: MatchSummary = {
        motm: isWalkover ? undefined : (motmResult ?? undefined),
        stats: isWalkover ? {
          shots: zeroSide, shotsOnTarget: zeroSide, saves: zeroSide, passes: zeroSide,
          fouls: zeroSide, corners: zeroSide, offsides: zeroSide, freekicks: zeroSide,
          dribbles: zeroSide, clearances: zeroSide, keyPasses: zeroSide,
          possession: zeroSide,
          yellowCards: zeroSide, redCards: zeroSide,
        } : {
          shots: ms.shots,
          shotsOnTarget: ms.shotsOnTarget,
          saves: ms.saves ?? zeroSide,
          passes: ms.passes ?? zeroSide,
          fouls: ms.fouls,
          corners: ms.corners ?? zeroSide,
          offsides: ms.offsides ?? zeroSide,
          freekicks: ms.freekicks ?? zeroSide,
          dribbles: ms.dribbles ?? zeroSide,
          clearances: ms.clearances ?? zeroSide,
          keyPasses: ms.keyPasses ?? zeroSide,
          possession: ms.possession,
          yellowCards: { home: ms.cards.home.yellow.length, away: ms.cards.away.yellow.length },
          redCards: { home: ms.cards.home.red.length, away: ms.cards.away.red.length },
        },
        homeGoals: isWalkover ? undefined : (homeGoalCards.goals.length ? homeGoalCards.goals : undefined),
        awayGoals: isWalkover ? undefined : (awayGoalCards.goals.length ? awayGoalCards.goals : undefined),
        homeCards: isWalkover ? undefined : (homeGoalCards.cards.length ? homeGoalCards.cards : undefined),
        awayCards: isWalkover ? undefined : (awayGoalCards.cards.length ? awayGoalCards.cards : undefined),
      };

      let updatedMatches = snap!.matches.map((m) =>
        m.id === matchId
          ? {
              ...m,
              status: 'completed' as const,
              result: {
                home: matchState!.score.home,
                away: matchState!.score.away,
                penalties: matchState!.penaltyScore,
              },
              matchSummary,
              // id sous lequel le StoredMatch est réellement sauvegardé (id brut du match
              // de compétition) — pas matchState.matchId qui porte le préfixe comp-…
              matchFileId: matchId,
              simulatedAt: new Date().toISOString(),
            }
          : m,
      );

      // Determine winner of this specific match
      {
        const hs = matchState!.score.home;
        const as_ = matchState!.score.away;
        let matchWinner: string | null = null;
        if (hs > as_) matchWinner = compMatch.homeTeamId ?? null;
        else if (as_ > hs) matchWinner = compMatch.awayTeamId ?? null;
        else if (matchState!.penaltyScore) {
          matchWinner = matchState!.penaltyScore.home > matchState!.penaltyScore.away
            ? compMatch.homeTeamId ?? null
            : compMatch.awayTeamId ?? null;
        }
        setWinnerTeamId(matchWinner);
      }

      let disqualifiedTeamIds = snap!.disqualifiedTeamIds ?? [];
      let updatedPendingCmfEnquete: Record<string, { round: number; matchId?: string; walkoverApplied: boolean }> = { ...(snap!.pendingCmfEnquete ?? {}) };

      let corruptionRevealedThisMatch = false;
      // Walkover from ref refusal (applies to THIS match, 50%)
      if (refusalWalkoverApplied && compMatch.homeTeamId && compMatch.awayTeamId) {
        const cheatingTeamId = matchState!.corruption!.side === 'home' ? compMatch.homeTeamId : compMatch.awayTeamId;
        updatedMatches = applyCorruptionDisqualification(updatedMatches, matchId!, cheatingTeamId);
        disqualifiedTeamIds = [...new Set([...disqualifiedTeamIds, cheatingTeamId])];
        setCorruptionRevealed(true);
        corruptionRevealedThisMatch = true;
      } else if (revealed && compMatch.homeTeamId && compMatch.awayTeamId) {
        const cheatingTeamId = matchState!.corruption!.side === 'home'
          ? compMatch.homeTeamId
          : compMatch.awayTeamId;
        updatedMatches = applyCorruptionDisqualification(updatedMatches, matchId!, cheatingTeamId);
        disqualifiedTeamIds = [...new Set([...disqualifiedTeamIds, cheatingTeamId])];
        setCorruptionRevealed(true);
        corruptionRevealedThisMatch = true;
      }

      if (compMatch.phase !== 'group' && compMatch.phase !== 'league' && compMatch.phase !== 'lpm_playoff') {
        updatedMatches = advanceBracket(updatedMatches, matchId!);
      }

      let updatedStandings = snap!.standings;

      if (!revealed && (compMatch.phase === 'group' || compMatch.phase === 'league') && compMatch.homeTeamId && compMatch.awayTeamId) {
        updatedStandings = applyResultToStandings(
          updatedStandings,
          compMatch.homeTeamId,
          compMatch.awayTeamId,
          matchState!.score.home,
          matchState!.score.away,
        );
      } else if (revealed) {
        const affectedTeamIds = new Set(
          updatedMatches
            .filter((m) => (m.phase === 'group' || m.phase === 'league') && m.homeTeamId && m.awayTeamId)
            .flatMap((m) => [m.homeTeamId!, m.awayTeamId!]),
        );
        updatedStandings = { ...snap!.standings };
        for (const tid of affectedTeamIds) {
          updatedStandings[tid] = { teamId: tid, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
        }
        for (const m of updatedMatches) {
          if ((m.phase !== 'group' && m.phase !== 'league') || !m.homeTeamId || !m.awayTeamId || !m.result) continue;
          updatedStandings = applyResultToStandings(
            updatedStandings,
            m.homeTeamId,
            m.awayTeamId,
            m.result.home,
            m.result.away,
          );
        }
        // Retrait de 3 points à l'équipe fautive (deal accepté = contact avec l'arbitre)
        const cheatingId = matchState!.corruption!.side === 'home'
          ? compMatch.homeTeamId!
          : compMatch.awayTeamId!;
        if (updatedStandings[cheatingId]) {
          updatedStandings = {
            ...updatedStandings,
            [cheatingId]: {
              ...updatedStandings[cheatingId],
              points: Math.max(0, updatedStandings[cheatingId].points - 3),
            },
          };
        }
      }

      // Only count matches that have both teams assigned (TBD slots don't block round advance)
      const nextRound = updatedMatches.every(
        (m) => m.round <= snap!.currentRound
          ? (!m.homeTeamId || !m.awayTeamId || m.status === 'completed')
          : true,
      )
        ? snap!.currentRound + 1
        : snap!.currentRound;

      const allDone = updatedMatches.every((m) => m.status === 'completed');
      let winner: string | undefined;
      if (allDone) {
        const finalMatch = updatedMatches.find((m) => m.phase === 'F');
        if (finalMatch?.result) {
          const fr = finalMatch.result;
          if (fr.home !== fr.away) {
            winner = fr.home > fr.away ? finalMatch.homeTeamId ?? undefined : finalMatch.awayTeamId ?? undefined;
          } else if (fr.penalties) {
            winner = fr.penalties.home > fr.penalties.away ? finalMatch.homeTeamId ?? undefined : finalMatch.awayTeamId ?? undefined;
          }
        } else if (snap!.format === 'league') {
          const sorted = Object.values(updatedStandings).sort((a, b) => b.points - a.points);
          winner = sorted[0]?.teamId;
        }
      }

      const updatedPlayerStats = accumulateMatchStats(
        snap!.playerStats ?? {},
        matchState!,
        { team: matchInput!.home.team, players: matchInput!.home.players },
        { team: matchInput!.away.team, players: matchInput!.away.players },
      );

      setMotm(computeMotm(
        matchState!,
        { team: matchInput!.home.team, players: matchInput!.home.players },
        { team: matchInput!.away.team, players: matchInput!.away.players },
      ));

      // Morale update — use compMatch already found above
      const homeTeamId = compMatch.homeTeamId ?? '';
      const awayTeamId = compMatch.awayTeamId ?? '';
      const prevMorale = snap!.morale ?? initMorale(snap!.teamIds);
      const updatedMorale = updateMorale(
        prevMorale,
        homeTeamId,
        awayTeamId,
        matchState!.score.home,
        matchState!.score.away,
      );

      // Press generation — prefer matchInput team names, fall back to snapshot
      const teamSnap = snap!.teamSnapshot ?? {};
      const round = compMatch.round;
      const seed = `${snap!.id}-${matchId}`;
      const newPressItems = [...(snap!.pressItems ?? [])];

      const nameFor = (tid: string) =>
        (tid === matchInput!.home.team.id ? matchInput!.home.team.name : null) ??
        (tid === matchInput!.away.team.id ? matchInput!.away.team.name : null) ??
        teamSnap[tid]?.name ?? tid;

      // Faits réels du match (buteurs, rouges, arbitre, météo…) + cotes pré-match
      const matchFacts = buildMatchFacts(
        matchState!,
        { teamId: compMatch.homeTeamId ?? '', players: matchInput!.home.players },
        { teamId: compMatch.awayTeamId ?? '', players: matchInput!.away.players },
        seed,
      );
      const gsOf = (tid: string) => teamSnap[tid]?.globalStrength ?? 50;
      const matchCotes = computeMatchCotes(gsOf(compMatch.homeTeamId ?? ''), gsOf(compMatch.awayTeamId ?? ''));
      // Snapshot complet partagé par tous les articles de ce match
      const pressSnap = {
        homeTeamId: compMatch.homeTeamId!,
        awayTeamId: compMatch.awayTeamId!,
        homeTeamName: nameFor(compMatch.homeTeamId!),
        awayTeamName: nameFor(compMatch.awayTeamId!),
        homeScore: matchState!.score.home,
        awayScore: matchState!.score.away,
        stats: {
          shots: matchState!.shots,
          possession: matchState!.possession,
          shotsOnTarget: matchState!.shotsOnTarget,
          corners: matchState!.corners ?? { home: 0, away: 0 },
          fouls: matchState!.fouls,
          yellowCards: { home: matchState!.cards.home.yellow.length, away: matchState!.cards.away.yellow.length },
          redCards: { home: matchState!.cards.home.red.length, away: matchState!.cards.away.red.length },
        },
        motm: motmResult ?? undefined,
        referee: matchFacts.referee,
        weather: matchFacts.weatherLabel,
        attendance: matchFacts.attendance,
        scorers: matchFacts.scorers.map(({ name, teamId, minute, penalty }) => ({ name, teamId, minute, penalty })),
        penalties: matchFacts.penaltyScore,
      };

      // CMF communiqué corruption (if revealed this match)
      if (corruptionRevealedThisMatch && compMatch.homeTeamId && compMatch.awayTeamId) {
        newPressItems.push(generateCmfCommunique({
          round,
          seed: `${seed}-cmf-corruption`,
          type: 'corruption',
          matchId: compMatch.id,
          matchSnapshot: { homeTeamId: compMatch.homeTeamId, awayTeamId: compMatch.awayTeamId, homeTeamName: nameFor(compMatch.homeTeamId), awayTeamName: nameFor(compMatch.awayTeamId), homeScore: matchState!.score.home, awayScore: matchState!.score.away },
        }));
      }

      let updatedPendingRebound: Record<string, number> = { ...(snap!.pendingPresidencyRebound ?? {}) };

      // Fire pending CMF judgment articles for this round
      for (const [enqueteTeamId, enqueteData] of Object.entries(updatedPendingCmfEnquete)) {
        if (enqueteData.round <= round) {
          const enqueteTeamName = nameFor(enqueteTeamId);
          newPressItems.push(generateCmfJugementItem({
            round,
            seed: `${seed}-cmfjugement-${enqueteTeamId}`,
            teamId: enqueteTeamId,
            teamName: enqueteTeamName,
            walkoverApplied: enqueteData.walkoverApplied,
            matchId: enqueteData.matchId,
          }));
          const { [enqueteTeamId]: _consumed, ...restEnquete } = updatedPendingCmfEnquete;
          updatedPendingCmfEnquete = restEnquete;
        }
      }

      // Fire pending rebound articles for this round
      for (const [reboundTeamId, reboundRound] of Object.entries(updatedPendingRebound)) {
        if (reboundRound <= round) {
          const reboundItem = generatePresidencyReboundItem({
            round,
            teamId: reboundTeamId,
            teamName: nameFor(reboundTeamId),
            seed: `${seed}-rebound-${reboundTeamId}`,
          });
          newPressItems.push(reboundItem);
          if (reboundItem.moraleBoost && reboundItem.moraleBoost > 0) {
            updatedMorale[reboundTeamId] = Math.min(100, (updatedMorale[reboundTeamId] ?? MORALE_DEFAULT) + reboundItem.moraleBoost);
          }
          const { [reboundTeamId]: _, ...rest } = updatedPendingRebound;
          updatedPendingRebound = rest;
        }
      }

      // Injuries from match events (init early — doping suspension appended below)
      let updatedInjuries = decrementInjuries(snap!.injuries ?? []);
      let updatedSuspensions = decrementSuspensions(snap!.suspensions ?? [], [homeTeamId, awayTeamId].filter(Boolean) as string[]);

      const dopingBannedTeamIds = [...(snap!.disqualifiedTeamIds ?? [])];
      let matchDopingOccurred = false;

      // Compute standings rank for press context (after standings update)
      const sortedStandings = Object.values(updatedStandings).sort(
        (a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst),
      );
      const rankOf = (tid: string) => sortedStandings.findIndex((s) => s.teamId === tid) + 1;
      const totalTeams = snap!.teamIds.length;

      for (const [tid, goalsFor, goalsAgainst] of [
        [homeTeamId, matchState!.score.home, matchState!.score.away],
        [awayTeamId, matchState!.score.away, matchState!.score.home],
      ] as [string, number, number][]) {
        if (!tid) continue;
        const tname = nameFor(tid);
        const isHome = tid === homeTeamId;
        const allPlayers = isHome ? matchInput!.home.players : matchInput!.away.players;
        const groupIds = new Set([
          ...(isHome ? matchState!.homeOnPitch : matchState!.awayOnPitch),
          ...(isHome ? matchState!.homeBench : matchState!.awayBench),
        ]);
        const teamPlayers = groupIds.size > 0 ? allPlayers.filter((p) => groupIds.has(p.id)) : allPlayers;
        const teamCoach = isHome ? matchInput!.home.team.coach : matchInput!.away.team.coach;
        const tidRank = rankOf(tid);
        const tidStanding = updatedStandings[tid];
        // isEliminated: can't mathematically reach any qualifying position
        // LPM: top 24 direct + 25-40 barrages → 40 teams still alive, only 41+ truly eliminated
        const isLPMLeague = compMatch.phase === 'league' && snap!.format === 'lpm';
        const qualifyCount = isLPMLeague ? 40 : (snap!.config.qualifyPerGroup ?? Math.ceil(totalTeams / 4));
        const justWon = goalsFor > goalsAgainst;
        const maxRemainingPts = (() => {
          const totalRounds = snap!.matches.filter((m) => m.phase === compMatch.phase).reduce((max, m) => Math.max(max, m.round), 0);
          const remaining = Math.max(0, totalRounds - round);
          return (tidStanding?.points ?? 0) + remaining * 3;
        })();
        const minPtsForSafeZone = sortedStandings[qualifyCount - 1]?.points ?? 0;
        const isEliminated = (compMatch.phase === 'group' || compMatch.phase === 'league')
          && !!tidStanding && tidStanding.played >= 3
          && maxRemainingPts < minPtsForSafeZone
          && !justWon;
        // isInDangerZone: LPM = Zone Rouge (25-40), standard = bottom 25%
        const dangerThreshold = isLPMLeague ? 40 : Math.max(qualifyCount + 1, Math.ceil(totalTeams * 0.75));
        const isInDangerZone = (compMatch.phase === 'group' || compMatch.phase === 'league')
          && tidRank > dangerThreshold;

        const isWorldCup = !!(snap?.name && /coupe du monde|world cup/i.test(snap.name));
        const cheatingTeamForPress = corruptionActive
          ? (matchState!.corruption!.side === 'home' ? compMatch.homeTeamId : compMatch.awayTeamId)
          : null;
        const { item, dopingSuspension, teamDisqualified, refereeCorruption } = generateMatchPressItem({
          round,
          teamId: tid,
          teamName: tname,
          goalsFor,
          goalsAgainst,
          moraleBefore: prevMorale[tid] ?? MORALE_DEFAULT,
          moraleAfter: updatedMorale[tid] ?? MORALE_DEFAULT,
          seed: seed + tid,
          phase: compMatch.phase,
          format: snap!.format,
          standing: tidStanding,
          totalTeams,
          rank: tidRank,
          isEliminated,
          isInDangerZone,
          dopingBannedTeamIds,
          dopingAlreadyThisMatch: matchDopingOccurred,
          players: teamPlayers,
          coach: teamCoach,
          isWorldCup,
          corruptionEnabled: cheatingTeamForPress === tid,
          corruptionRevealed: revealed,
          matchId: compMatch.id,
          matchSnapshot: pressSnap,
          facts: matchFacts,
          cote: tid === compMatch.homeTeamId ? matchCotes.home : matchCotes.away,
        });
        newPressItems.push(item);
        if (item.moraleShock && item.moraleShock < 0) {
          updatedMorale[tid] = Math.max(1, (updatedMorale[tid] ?? MORALE_DEFAULT) + item.moraleShock);
        }
        if (item.moraleBoost && item.moraleBoost > 0) {
          updatedMorale[tid] = Math.min(100, (updatedMorale[tid] ?? MORALE_DEFAULT) + item.moraleBoost);
        }
        if (dopingSuspension) {
          updatedSuspensions = [...updatedSuspensions, dopingSuspension];
          matchDopingOccurred = true;
          newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-dop-${tid}`, type: 'doping_player', playerName: dopingSuspension.subjectName, matchId: compMatch.id, matchSnapshot: { homeTeamId: compMatch.homeTeamId!, awayTeamId: compMatch.awayTeamId!, homeTeamName: nameFor(compMatch.homeTeamId!), awayTeamName: nameFor(compMatch.awayTeamId!), homeScore: matchState!.score.home, awayScore: matchState!.score.away } }));
        }
        if (teamDisqualified) {
          updatedMatches = applyCorruptionDisqualification(updatedMatches, matchId!, tid);
          disqualifiedTeamIds = [...new Set([...disqualifiedTeamIds, tid])];
          dopingBannedTeamIds.push(tid);
          matchDopingOccurred = true;
          if (refereeCorruption) {
            newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-ref-${tid}`, type: 'corruption', matchId: compMatch.id, matchSnapshot: { homeTeamId: compMatch.homeTeamId!, awayTeamId: compMatch.awayTeamId!, homeTeamName: nameFor(compMatch.homeTeamId!), awayTeamName: nameFor(compMatch.awayTeamId!), homeScore: matchState!.score.home, awayScore: matchState!.score.away } }));
          } else {
            newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-dopt-${tid}`, type: 'doping_team', matchId: compMatch.id, matchSnapshot: { homeTeamId: compMatch.homeTeamId!, awayTeamId: compMatch.awayTeamId!, homeTeamName: nameFor(compMatch.homeTeamId!), awayTeamName: nameFor(compMatch.awayTeamId!), homeScore: matchState!.score.home, awayScore: matchState!.score.away } }));
          }
        } else if (refereeCorruption?.kind === 'revealed') {
          // Arbitre révèle seul — communiqué CMF corruption sans disqualif
          newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-ref-rev-${tid}`, type: 'corruption', matchId: compMatch.id, matchSnapshot: { homeTeamId: compMatch.homeTeamId!, awayTeamId: compMatch.awayTeamId!, homeTeamName: nameFor(compMatch.homeTeamId!), awayTeamName: nameFor(compMatch.awayTeamId!), homeScore: matchState!.score.home, awayScore: matchState!.score.away } }));
        } else if (refereeCorruption?.kind === 'refused_reported' && refereeCorruption.penalty === 'points') {
          newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-ref-pts-${tid}`, type: 'corruption_points', matchId: compMatch.id, matchSnapshot: { homeTeamId: compMatch.homeTeamId!, awayTeamId: compMatch.awayTeamId!, homeTeamName: nameFor(compMatch.homeTeamId!), awayTeamName: nameFor(compMatch.awayTeamId!), homeScore: matchState!.score.home, awayScore: matchState!.score.away } }));
          updatedStandings = applyPointsPenalty(updatedStandings, tid);
        }
        const moraleItem = generateMoralePressItem({
          round,
          teamId: tid,
          teamName: tname,
          morale: updatedMorale[tid] ?? MORALE_DEFAULT,
          seed: seed + tid + round,
        });
        if (moraleItem) {
          newPressItems.push(moraleItem);
          if (moraleItem.presidentDestitue) {
            updatedPendingRebound[tid] = round + 1;
          }
        }

        // Séries — victoires (forme) et défaites (méforme), basées sur pressItems AVANT ce round
        const isWin = goalsFor > goalsAgainst;
        const isLoss = goalsFor < goalsAgainst;
        if (isWin || isLoss) {
          const prevItems = snap!.pressItems ?? [];
          const teamPrevMatchItems = prevItems
            .filter((p) => p.teamId === tid && p.matchId && ['victoire', 'exploit', 'defaite', 'crise', 'neutralite', 'critique'].includes(p.category))
            .sort((a, b) => b.round - a.round || b.createdAt.localeCompare(a.createdAt));
          // streak = 1 (ce match) + résultats identiques consécutifs passés
          let streak = 1;
          for (const p of teamPrevMatchItems) {
            const wasWin = p.category === 'victoire' || p.category === 'exploit';
            const wasLoss = p.category === 'defaite' || p.category === 'crise' || p.category === 'critique';
            if ((isWin && wasWin) || (isLoss && wasLoss)) streak++;
            else break;
          }
          const prevWinSnaps = isWin
            ? prevItems
                .filter((p) => p.teamId === tid && p.matchSnapshot && (p.category === 'victoire' || p.category === 'exploit'))
                .sort((a, b) => b.round - a.round || b.createdAt.localeCompare(a.createdAt))
                .slice(0, 2)
                .map((p) => p.matchSnapshot!)
            : [];
          // Phase à élimination directe : une défaite = fin de parcours pour le perdant.
          // (group/league/lpm_playoff continuent ; les deux legs de lpm_playoff ne sont
          // pas des sorties sèches sur un seul match.)
          const isKnockoutPhase = compMatch.phase !== 'group'
            && compMatch.phase !== 'league'
            && compMatch.phase !== 'lpm_playoff';
          const competitionOver = isLoss && isKnockoutPhase;
          const formeItem = generateFormePressItem({
            round,
            teamId: tid,
            teamName: tname,
            winStreak: isWin ? streak : 0,
            lossStreak: isLoss ? streak : undefined,
            competitionOver,
            seed: seed + tid + round + 'forme',
            matchSnapshots: [pressSnap, ...prevWinSnaps],
            players: teamPlayers,
            coach: teamCoach ?? undefined,
          });
          if (formeItem) newPressItems.push(formeItem);
        }

        // Communiqué palmarès CMF — record (manita) ou sacre (finale gagnée)
        {
          const scoreStr = `${goalsFor}-${goalsAgainst}`;
          const isSacre = compMatch.phase === 'F' && goalsFor > goalsAgainst;
          const isManita = goalsFor - goalsAgainst >= 5;
          const palmRng = rngFromSeed(`${seed}-palm-${tid}-${round}`);
          if (isSacre || (isManita && palmRng() < 0.6)) {
            newPressItems.push(generateCmfCommunique({
              round, seed: `${seed}-cmf-palm-${tid}`, type: 'palmares',
              teamName: tname, score: scoreStr, matchId: compMatch.id, matchSnapshot: pressSnap,
            }));
          }
        }

        // Scandale coach (alcoolique / drogué)
        if (teamCoach) {
          const coachScandal = generateCoachScandalItem({
            round,
            teamId: tid,
            teamName: tname,
            coach: teamCoach,
            seed: seed + tid + round + 'cscandal',
          });
          if (coachScandal) newPressItems.push(coachScandal);
        }
      }

      // Polémique arbitrale + communiqué discipline CMF — une fois par match
      const refereeItem = generateRefereePressItem({ round, seed: `${seed}-arb`, facts: matchFacts, matchId: compMatch.id, matchSnapshot: pressSnap });
      if (refereeItem) newPressItems.push(refereeItem);
      const disciplineItem = generateCmfDisciplineItem({ round, seed: `${seed}-disc`, facts: matchFacts, matchId: compMatch.id, matchSnapshot: pressSnap });
      if (disciplineItem) newPressItems.push(disciplineItem);

      // CMF enquête — ref dénonce avant le match (refusedByRef)
      if (matchState!.corruption?.refusedByRef && matchState!.corruption.side !== 'both' && compMatch.homeTeamId && compMatch.awayTeamId) {
        const briberTeamId = matchState!.corruption.side === 'home' ? compMatch.homeTeamId : compMatch.awayTeamId;
        const briberName = nameFor(briberTeamId);
        const matchSnap3 = {
          homeTeamId: compMatch.homeTeamId,
          awayTeamId: compMatch.awayTeamId,
          homeTeamName: nameFor(compMatch.homeTeamId),
          awayTeamName: nameFor(compMatch.awayTeamId),
          homeScore: matchState!.score.home,
          awayScore: matchState!.score.away,
        };
        newPressItems.push(generateCmfEnqueteItem({
          round,
          seed: `${seed}-cmf-enquete-${briberTeamId}`,
          teamId: briberTeamId,
          teamName: briberName,
          matchId: compMatch.id,
          matchSnapshot: matchSnap3,
        }));
        updatedPendingCmfEnquete = {
          ...updatedPendingCmfEnquete,
          [briberTeamId]: { round: round + 1, matchId: compMatch.id, walkoverApplied: refusalWalkoverApplied },
        };
      }

      const homePlayersMap = new Map(matchInput!.home.players.map((p) => [p.id, p]));
      const awayPlayersMap = new Map(matchInput!.away.players.map((p) => [p.id, p]));

      for (const [side, tid, playersMap] of [
        ['home' as const, homeTeamId, homePlayersMap],
        ['away' as const, awayTeamId, awayPlayersMap],
      ] as ['home' | 'away', string, Map<string, import('@/lib/types').Player>][]) {
        for (const pid of (matchState!.matchInjuries?.[side] ?? [])) {
          const p = playersMap.get(pid);
          if (!p) continue;
          updatedInjuries = [...updatedInjuries, createMatchInjury(tid, p, compMatch.round)];
        }
        // Red cards → 1 match suspension
        for (const pid of matchState!.cards[side].red) {
          const p = playersMap.get(pid);
          if (!p) continue;
          // Avoid duplicate suspensions
          if (updatedSuspensions.some((s) => s.subjectId === pid && s.teamId === tid)) continue;
          updatedSuspensions = [...updatedSuspensions, createSuspension(
            tid, pid, `${p.firstName} ${p.lastName}`, 1, 'Carton rouge', compMatch.round,
          )];
        }
      }
      // Coach ejections → 1 match suspension
      for (const [side, tid] of [['home' as const, homeTeamId], ['away' as const, awayTeamId]] as ['home' | 'away', string][]) {
        if (matchState!.coachEjected?.[side]) {
          const c = (side === 'home' ? matchInput!.home.team : matchInput!.away.team).coach;
          const coachName = c ? `${c.firstName} ${c.lastName}` : 'Entraîneur';
          if (!updatedSuspensions.some((s) => s.subjectId === 'coach' && s.teamId === tid)) {
            updatedSuspensions = [...updatedSuspensions, createSuspension(
              tid, 'coach', coachName, 1, 'Expulsion en match', compMatch.round,
            )];
          }
        }
      }

      // ── Drame (0.5% par match) ────────────────────────────────────────────
      let updatedPendingDrameHommage: Record<string, number> = { ...(snap!.pendingDrameHommage ?? {}) };

      // Fire pending hommage articles due this round
      for (const [drameMatchId, hommageRound] of Object.entries(updatedPendingDrameHommage)) {
        if (hommageRound <= round) {
          const origSnapshot = (snap!.pressItems ?? []).find((p) => p.matchId === drameMatchId && p.category === 'drame')?.matchSnapshot;
          if (origSnapshot) {
            newPressItems.push(generateDrameHommageItem({
              round,
              seed: `${seed}-hommage-${drameMatchId}`,
              originalMatchId: drameMatchId,
              originalMatchSnapshot: origSnapshot,
            }));
          }
          const { [drameMatchId]: _, ...rest } = updatedPendingDrameHommage;
          updatedPendingDrameHommage = rest;
        }
      }

      const drameRng = (() => { let h = 0; const s = `${seed}-drame`; for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; } return () => { h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; return (h >>> 0) / 0xffffffff; }; })();
      const matchSnap = pressSnap;
      if (drameRng() < 0.002) {
        const drameItem = generateDrameItem({ round, seed: `${seed}-drame-evt`, matchId: compMatch.id, matchSnapshot: matchSnap });
        newPressItems.push(drameItem);
        newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-drame`, type: 'drame', matchId: compMatch.id, matchSnapshot: matchSnap }));
        updatedPendingDrameHommage = { ...updatedPendingDrameHommage, [compMatch.id]: round + 1 };
      } else {
        // ── Événements rares (déterministes, drame prioritaire) ──────────────
        const rareRng = rngFromSeed(`${seed}-rare-${compMatch.id}`);
        type RarePlayers = NonNullable<typeof matchInput>['home']['players'];
        const pickTeamForRare = (): { tid: string; players: RarePlayers } | null => {
          const roll = rareRng();
          if (homeTeamId && awayTeamId) return roll < 0.5 ? { tid: homeTeamId, players: matchInput!.home.players } : { tid: awayTeamId, players: matchInput!.away.players };
          if (homeTeamId) return { tid: homeTeamId, players: matchInput!.home.players };
          if (awayTeamId) return { tid: awayTeamId, players: matchInput!.away.players };
          return null;
        };
        const rarePlayer = (players: RarePlayers) => players.filter((p) => p.position !== 'GK')[Math.floor(rareRng() * Math.max(1, players.filter((p) => p.position !== 'GK').length))] ?? players[0];
        // C1 — paris truqués (~0.3 %)
        if (rareRng() < 0.003) {
          const t = pickTeamForRare();
          if (t && t.players.length > 0) {
            const p = rarePlayer(t.players);
            newPressItems.push(generateFixingScandalItem({ round, seed: `${seed}-fixing-${compMatch.id}`, teamId: t.tid, teamName: nameFor(t.tid), player: p, matchId: compMatch.id, matchSnapshot: matchSnap }));
            newPressItems.push(generateCmfEnqueteItem({ round, seed: `${seed}-fixing-enq-${compMatch.id}`, teamId: t.tid, teamName: nameFor(t.tid), matchId: compMatch.id, matchSnapshot: matchSnap }));
          }
        }
        // C2 — bagarre vestiaire (~0.5 %)
        else if (rareRng() < 0.005) {
          const t = pickTeamForRare();
          if (t && t.players.length > 0) {
            const p = rarePlayer(t.players);
            newPressItems.push(generateLockerRoomBrawlItem({ round, seed: `${seed}-brawl-${compMatch.id}`, teamId: t.tid, teamName: nameFor(t.tid), player: p, matchId: compMatch.id, matchSnapshot: matchSnap }));
          }
        }
        // C3 — incident discriminatoire (~0.3 %) → communiqué CMF huis clos
        else if (rareRng() < 0.003 && homeTeamId && awayTeamId) {
          newPressItems.push(generateDiscriminationItem({ round, seed: `${seed}-discrim-${compMatch.id}`, matchId: compMatch.id, matchSnapshot: matchSnap }));
          newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-huis-${compMatch.id}`, type: 'huis_clos', matchId: compMatch.id, matchSnapshot: matchSnap }));
        }
      }

      // ── CMF — détection changement de phase et fin de compétition ─────────
      const prevPhase = (snap!.matches.find((m) => m.id === matchId))?.phase ?? compMatch.phase;
      const newPhase = compMatch.phase;
      const phaseMatchesDone = updatedMatches.filter((m) => m.phase === newPhase).every((m) => m.status === 'completed');
      const prevPhaseDone = updatedMatches.filter((m) => m.phase === prevPhase).every((m) => m.status === 'completed');
      const cmfSeed = `${seed}-cmf-${round}`;
      const cmfBase = {
        round,
        competitionName: snap!.name,
        format: snap!.format,
        teamSnapshot: snap!.teamSnapshot ?? {},
        standings: updatedStandings,
        playerStats: updatedPlayerStats,
      };

      // Teams qualified for the new phase (used for favoris)
      const qualifiedForNewPhase = [...new Set(
        updatedMatches
          .filter((m) => m.phase === newPhase && m.status !== 'completed')
          .flatMap((m) => [m.homeTeamId, m.awayTeamId])
          .filter((id): id is string => !!id),
      )];
      // Teams still in prev phase (for fin favoris — exclude already-eliminated)
      const stillInPrevPhase = [...new Set(
        updatedMatches
          .filter((m) => m.phase === prevPhase)
          .flatMap((m) => [m.homeTeamId, m.awayTeamId])
          .filter((id): id is string => !!id),
      )];
      // Playoff pairs for lpm_playoff debut article
      const playoffPairsForDebut = newPhase === 'lpm_playoff'
        ? updatedMatches
            .filter((m) => m.phase === 'lpm_playoff' && m.leg === 1 && m.homeTeamId && m.awayTeamId)
            .map((m) => ({ homeTeamId: m.homeTeamId!, awayTeamId: m.awayTeamId! }))
        : undefined;

      // Fin de phase (groupe ou knockout complet) → articles bilan + nouveau début de phase
      if (prevPhaseDone && newPhase !== prevPhase) {
        // Pour l'article "fin", les favoris = équipes qualifiées pour la suite (pas les éliminés)
        const finQualified = qualifiedForNewPhase.length > 0 ? qualifiedForNewPhase : (stillInPrevPhase.length > 0 ? stillInPrevPhase : undefined);
        newPressItems.push(...generateCmfItems({ ...cmfBase, seed: cmfSeed + '-fin', phase: prevPhase, moment: 'fin', qualifiedTeamIds: finQualified }));
        newPressItems.push(...generateCmfItems({ ...cmfBase, seed: cmfSeed + '-debut2', phase: newPhase, moment: 'debut', qualifiedTeamIds: qualifiedForNewPhase.length > 0 ? qualifiedForNewPhase : undefined, playoffPairs: playoffPairsForDebut }));
      } else if (phaseMatchesDone && newPhase === prevPhase && !allDone) {
        newPressItems.push(...generateCmfItems({ ...cmfBase, seed: cmfSeed + '-fin2', phase: newPhase, moment: 'fin', qualifiedTeamIds: qualifiedForNewPhase.length > 0 ? qualifiedForNewPhase : undefined }));
      }

      // Fin de compétition — palmarès
      if (allDone) {
        newPressItems.push(...generateCmfItems({ ...cmfBase, seed: cmfSeed + '-palmares', phase: newPhase, moment: 'palmares', winner }));
      }

      const updated = {
        ...snap!,
        matches: updatedMatches,
        standings: updatedStandings,
        playerStats: updatedPlayerStats,
        awards: allDone ? computeAwards(updatedPlayerStats) : snap!.awards,
        currentRound: Math.min(nextRound, Math.max(...updatedMatches.map((m) => m.round))),
        status: allDone ? ('completed' as const) : ('ongoing' as const),
        winner,
        disqualifiedTeamIds: disqualifiedTeamIds.length > 0 ? disqualifiedTeamIds : undefined,
        morale: updatedMorale,
        pressItems: newPressItems,
        injuries: updatedInjuries,
        suspensions: updatedSuspensions,
        pendingPresidencyRebound: Object.keys(updatedPendingRebound).length > 0 ? updatedPendingRebound : undefined,
        pendingDrameHommage: Object.keys(updatedPendingDrameHommage).length > 0 ? updatedPendingDrameHommage : undefined,
        pendingCmfEnquete: Object.keys(updatedPendingCmfEnquete).length > 0 ? updatedPendingCmfEnquete : undefined,
      };

      // Applique en mémoire + localStorage
      setCurrent(updated);

      // Auto-save en DB après chaque match (séquentiel pour éviter burst rate-limit)
      if (effectivePat) {
        const matchBk = new PrApiMatchBackend(effectivePat);
        const storedMatch: StoredMatch = {
          id: matchId!,
          input: matchInput!,
          state: matchState!,
          home: { team: matchInput!.home.team, players: matchInput!.home.players },
          away: { team: matchInput!.away.team, players: matchInput!.away.players },
          playedAt: new Date().toISOString(),
        };
        save(updated, '', effectivePat)
          .then(() => matchBk.saveMatch(storedMatch))
          .catch(() => {
            toast('error', 'Sauvegarde DB échouée — données en local seulement.');
          });

        const teamSnap = snap!.teamSnapshot ?? {};
        const backend = new PrApiTeamBackend(effectivePat);

        // Sync recentMatches sur les 2 équipes du match (seulement si coché)
        const thisMatch = matchInput?.countForStats ? updated.matches.find((m) => m.id === matchId) : undefined;
        if (thisMatch?.result && thisMatch.homeTeamId && thisMatch.awayTeamId) {
          const homeId = thisMatch.homeTeamId;
          const awayId = thisMatch.awayTeamId;
          const homeSnap = teamSnap[homeId];
          const awaySnap = teamSnap[awayId];
          const playedAt = thisMatch.simulatedAt ?? new Date().toISOString();
          const participantCount = snap!.teamIds.length;

          const makeSummary = (isHome: boolean): RecentMatchSummary => {
            const oppSnap = isHome ? awaySnap : homeSnap;
            const oppStrength = (oppSnap as any)?.globalStrength ?? 50;
            const scoreFor = isHome ? thisMatch.result!.home : thisMatch.result!.away;
            const scoreAgainst = isHome ? thisMatch.result!.away : thisMatch.result!.home;
            const myGoals = isHome ? homeGoalCards.goals : awayGoalCards.goals;
            return {
              matchId: thisMatch.id ?? '',
              playedAt,
              opponentSlug: oppSnap?.slug ?? '',
              opponentName: oppSnap?.name ?? '',
              homeAway: isHome ? 'home' : 'away',
              homeTeamId: homeId,
              awayTeamId: awayId,
              scoreFor,
              scoreAgainst,
              opponentStrength: oppStrength,
              compKind: snap!.kind,
              competitionId: snap!.id,
              competitionName: snap!.name,
              compScope: snap!.scope,
              compImportance: snap!.importance,
              participantCount,
              scorers: myGoals.length ? myGoals : undefined,
              cmfPoints: calcCmfMatchPoints({ scoreFor, scoreAgainst, opponentStrength: oppStrength, compKind: snap!.kind, compScope: snap!.scope, compImportance: snap!.importance, participantCount }),
            };
          };

          // Bulk-fetch both teams to update recentMatches — 1 request instead of 2
          const recentSlugPairs = [[homeId, true], [awayId, false]] as [string, boolean][];
          const recentEntries = recentSlugPairs
            .map(([tid, isHome]) => ({ tid, slug: teamSnap[tid]?.slug, isHome }))
            .filter((x): x is { tid: string; slug: string; isHome: boolean } => !!x.slug);
          if (recentEntries.length > 0) {
            backend.bulkTeams(recentEntries.map((e) => e.slug)).then((bulkRes) => {
              const bySlug = new Map(bulkRes.map((r) => [r.team.slug, r]));
              const items = recentEntries.flatMap(({ slug, isHome }) => {
                const res = bySlug.get(slug);
                if (!res) return [];
                const summary = makeSummary(isHome);
                const existing = (res.team.recentMatches ?? []).filter((r) => r.matchId !== matchId);
                return [{ slug, team: { ...res.team, recentMatches: [...existing, summary] }, players: res.players }];
              });
              return backend.bulkUpdateTeams(items);
            }).catch(() => {});
          }
        }

        // Si compétition terminée : sync compHistory + médical sur toutes les équipes
        if (allDone) {
          const entries = snap!.teamIds
            .map((tid) => ({ tid, slug: teamSnap[tid]?.slug }))
            .filter((x): x is { tid: string; slug: string } => !!x.slug);

          if (entries.length > 0) {
            backend.bulkTeams(entries.map((e) => e.slug)).then((bulkRes) => {
              const bySlug = new Map(bulkRes.map((r) => [r.team.slug, r]));
              const items = entries.flatMap(({ tid, slug }) => {
                const res = bySlug.get(slug);
                if (!res) return [];
                const prev = res.team.compHistory ?? [];
                const idx = prev.findIndex((e) => e.compId === updated.id);
                const entry: CompHistoryEntry = {
                  compId: updated.id,
                  compName: updated.name,
                  year: updated.year,
                  format: updated.format,
                  kind: updated.kind,
                  scope: updated.scope,
                  importance: updated.importance,
                  result: deriveTeamResult(tid, updated),
                  phase: deriveTeamPhase(tid, updated),
                  participantCount: updated.teamIds.length,
                };
                const nextHistory = idx >= 0
                  ? prev.map((e, i) => i === idx ? entry : e)
                  : [...prev, entry];
                const teamInjuries = updatedInjuries.filter((i) => i.teamId === tid);
                const teamSuspensions = updatedSuspensions.filter((s) => s.teamId === tid);
                return [{ slug, team: { ...res.team, compHistory: nextHistory, injuries: teamInjuries, suspensions: teamSuspensions }, players: res.players }];
              });
              return backend.bulkUpdateTeams(items);
            }).catch(() => {});
          }
        } else {
          // Sync médical à chaque match (blessures/suspensions en cours)
          const teamSnap2 = snap!.teamSnapshot ?? {};
          const medEntries = snap!.teamIds
            .map((tid) => ({ tid, slug: teamSnap2[tid]?.slug }))
            .filter((x): x is { tid: string; slug: string } => !!x.slug);

          if (medEntries.length > 0) {
            backend.bulkTeams(medEntries.map((e) => e.slug)).then((bulkRes) => {
              const bySlug = new Map(bulkRes.map((r) => [r.team.slug, r]));
              const items = medEntries.flatMap(({ tid, slug }) => {
                const res = bySlug.get(slug);
                if (!res) return [];
                const teamInjuries = updatedInjuries.filter((i) => i.teamId === tid);
                const teamSuspensions = updatedSuspensions.filter((s) => s.teamId === tid);
                return [{ slug, team: { ...res.team, injuries: teamInjuries, suspensions: teamSuspensions }, players: res.players }];
              });
              return backend.bulkUpdateTeams(items);
            }).catch(() => {});
          }
        }
      }

      toast('success', revealed ? 'Scandale ! Résultats mis à jour et sauvegardés.' : 'Match sauvegardé en DB.');
    }
    persist();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  useEffect(() => {
    return () => {
      resetMatch();
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
        scorerName={celebration?.scorerName}
        scorerMinute={celebration?.scorerMinute}
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

      <Scoreboard
        state={matchState}
        home={matchInput.home.team}
        away={matchInput.away.team}
        homeFormation={matchInput.home.formationLabel ?? matchInput.home.formation}
        awayFormation={matchInput.away.formationLabel ?? matchInput.away.formation}
        leg1Score={matchInput.leg1Score}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {(() => {
            const kits = resolveKits(matchInput.home.team, matchInput.away.team);
            return (
              <>
                <Pitch
                  state={matchState}
                  homeFormation={matchInput.home.formation}
                  awayFormation={matchInput.away.formation}
                  homeColor={kits.home}
                  awayColor={kits.away}
                  homeTokenPositions={matchInput.home.tokenPositions}
                  awayTokenPositions={matchInput.away.tokenPositions}
                />
                <KitLegend
                  homeName={matchInput.home.team.name}
                  awayName={matchInput.away.team.name}
                  homeColor={kits.home}
                  awayColor={kits.away}
                  awayAlternate={kits.awayUsedAlternate}
                />
              </>
            );
          })()}
          <SpeedControls
            speed={matchState.speed}
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
              home={matchInput.home.team}
              away={matchInput.away.team}
              homeSavedTactics={homeSavedTactics}
              awaySavedTactics={awaySavedTactics}
              onTacticChange={(side, tactic) => {
                const team = side === 'home' ? matchInput.home.team : matchInput.away.team;
                updateSideTactic(side, tacticToSidePatch(tactic, team));
                // Riposte : contre-tactique adverse déclenchée en plein match
                const opp = side === 'home' ? 'away' as const : 'home' as const;
                const oppTeam = opp === 'home' ? matchInput.home.team : matchInput.away.team;
                const counter = findCounterTactic(oppTeam, team.id, tactic.id);
                if (counter) {
                  updateSideTactic(opp, tacticToSidePatch(counter, oppTeam));
                  toast('success', `⚔ ${oppTeam.name} riposte : « ${counter.name} »`);
                }
              }}
            />
          )}
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
          homeSavedTactics={homeSavedTactics}
          awaySavedTactics={awaySavedTactics}
          homeReportSide={{ ...matchInput.home, savedTactics: homeSavedTactics }}
          awayReportSide={{ ...matchInput.away, savedTactics: awaySavedTactics }}
          onTacticChange={(side, tactic) => {
            const team = side === 'home' ? matchInput.home.team : matchInput.away.team;
            updateSideTactic(side, tacticToSidePatch(tactic, team));
            // Riposte : contre-tactique adverse déclenchée en plein match
            const opp = side === 'home' ? 'away' as const : 'home' as const;
            const oppTeam = opp === 'home' ? matchInput.home.team : matchInput.away.team;
            const counter = findCounterTactic(oppTeam, team.id, tactic.id);
            if (counter) {
              updateSideTactic(opp, tacticToSidePatch(counter, oppTeam));
              toast('success', `⚔ ${oppTeam.name} riposte : « ${counter.name} »`);
            }
          }}
          onResume={resume}
        />
      )}

      {isET && !showHalftime && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-center text-sm text-warning">
          ⏱ Prolongations en cours
        </div>
      )}

      {showPenalties && matchState && (
        <PenaltyShootout
          state={matchState}
          home={matchInput.home.team}
          away={matchInput.away.team}
          onDone={() => { setShowPenalties(false); setPenaltiesDone(true); }}
        />
      )}

      <AnimatePresence>
        {finished && (!matchState.penaltyScore || penaltiesDone) && isFinal && winnerTeamId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setWinnerTeamId(null)}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.4, duration: 0.8 }}
              className="text-center space-y-4 px-8"
            >
              <motion.div
                animate={{ rotate: [0, -8, 8, -5, 5, 0] }}
                transition={{ delay: 0.6, duration: 1.2 }}
                className="text-8xl"
              >
                🏆
              </motion.div>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-xs uppercase tracking-widest text-muted"
              >
                {current?.name ?? 'Finale'}
              </motion.div>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="font-display text-4xl text-white"
              >
                {winnerTeamId === matchInput.home.team.id ? matchInput.home.team.name : matchInput.away.team.name}
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-sm text-muted"
              >
                Champion{current?.name ? ` · ${current.name}` : ''}
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6 }}
                className="text-xs text-muted/60 mt-4"
              >
                Cliquer pour continuer
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
          {motm && (
            <div className="inline-flex flex-col items-center gap-1 rounded-md border border-warning/30 bg-warning/5 px-5 py-3">
              <div className="text-xs uppercase tracking-widest text-muted">🏅 Homme du match</div>
              <div className="font-display text-lg">{motm.playerName}</div>
              <div className="text-xs text-muted">{motm.teamName}</div>
              <div className="text-sm font-medium text-warning">{motm.rating.toFixed(1)} / 10</div>
            </div>
          )}
          {saving && (
            <div className="flex justify-center pt-1">
              <Spinner className="h-4 w-4" />
            </div>
          )}
        </div>
      )}

      {showReport && matchState && matchInput && (
        <TacticalReportModal
          state={matchState}
          home={{ ...matchInput.home, savedTactics: homeSavedTactics }}
          away={{ ...matchInput.away, savedTactics: awaySavedTactics }}
          onClose={() => setShowReport(false)}
        />
      )}

      {corruptionRevealed && matchState?.corruption && (
        <div className="rounded-lg border border-danger bg-danger/10 p-5 text-center space-y-2">
          <div className="font-display text-2xl text-danger">🚨 Scandale révélé !</div>
          <div className="text-sm">
            La corruption de{' '}
            <span className="font-medium">
              {matchState.corruption.side === 'home' ? matchInput?.home.team.name : matchInput?.away.team.name}
            </span>{' '}
            ({matchState.corruption.bribe}M€) a été découverte. Match annulé — équipe disqualifiée.
          </div>
        </div>
      )}
    </main>
  );
}
