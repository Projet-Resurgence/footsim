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
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { saveMatch } from '@/lib/github/matches';
import { advanceBracket, applyResultToStandings, applyCorruptionDisqualification } from '@/lib/competition/scheduler';
import { rulesForPhase } from '@/lib/competition/types';
import type { MatchSummary } from '@/lib/competition/types';
import { resolveActiveTactic } from '@/lib/localTactics';
import { updateMorale, initMorale, MORALE_DEFAULT } from '@/lib/competition/morale';
import { generateMatchPressItem, generateMoralePressItem, generatePresidencyReboundItem, generateDrameItem, generateDrameHommageItem, generateCmfItems, generateCmfCommunique, generateFormePressItem, generateCoachScandalItem } from '@/lib/competition/press';
import { createMatchInjury, createSuspension, decrementInjuries, decrementSuspensions, unavailableIds } from '@/lib/competition/injuries';

import type { Team } from '@/lib/types';
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
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const refreshTeams = useTeams((s) => s.refresh);
  const pat = useCredentials((s) => s.githubPat);
  const navigate = useNavigate();
  const { ownerId, pat: effectivePat } = useBackendArgs();

  const matchState = useMatch((s) => s.state);
  const matchInput = useMatch((s) => s.input);
  const paused = useMatch((s) => s.paused);
  const finished = useMatch((s) => s.finished);
  const setSpeed = useMatch((s) => s.setSpeed);
  const pause = useMatch((s) => s.pause);
  const resume = useMatch((s) => s.resume);
  const resetMatch = useMatch((s) => s.reset);
  const startMatch = useMatch((s) => s.start);

  const dirty = useCompetition((s) => s.dirty);
  const currentRef = useRef<typeof current>(null);
  useEffect(() => { currentRef.current = current; }, [current]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [motm, setMotm] = useState<MotmResult | null>(null);
  const [corruptionRevealed, setCorruptionRevealed] = useState(false);
  const savedRef = useRef(false);
  const prevScoreRef = useRef({ home: 0, away: 0 });
  const [celebration, setCelebration] = useState<{ team: Team; score: { home: number; away: number } } | null>(null);
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

        // Resolve slug from teamSnapshot first (no listTeams needed), fall back to store
        const snapHome = comp.teamSnapshot?.[compMatch.homeTeamId]?.slug;
        const snapAway = comp.teamSnapshot?.[compMatch.awayTeamId]?.slug;
        if ((!snapHome || !snapAway) && teamsStore.length === 0) {
          await refreshTeams(ownerId, effectivePat);
        }

        const homeSlug = snapHome ?? teamsStore.find((t) => t.id === compMatch.homeTeamId)?.slug;
        const awaySlug = snapAway ?? teamsStore.find((t) => t.id === compMatch.awayTeamId)?.slug;

        if (!homeSlug || !awaySlug) { toast('error', 'Équipes introuvables.'); return; }

        const [homeData, awayData] = await Promise.all([
          fetchTeam(homeSlug, ownerId, effectivePat),
          fetchTeam(awaySlug, ownerId, effectivePat),
        ]);

        if (!homeData || !awayData) { toast('error', 'Données équipes introuvables.'); return; }

        const mid = `comp-${competitionId}-${matchId}`;
        const storedCorruption = sessionStorage.getItem(`footsim.corruption.${matchId}`);
        const corruption = storedCorruption ? JSON.parse(storedCorruption) : undefined;
        sessionStorage.removeItem(`footsim.corruption.${matchId}`);

        const storedTactics = sessionStorage.getItem(`footsim.tactics.${matchId}`);
        const tacticOverride: { home?: string; away?: string } = storedTactics ? JSON.parse(storedTactics) : {};
        sessionStorage.removeItem(`footsim.tactics.${matchId}`);

        const homeTactics = resolveActiveTactic(homeData.team);
        const awayTactics = resolveActiveTactic(awayData.team);

        const moraleMap = comp.morale ?? initMorale(comp.teamIds);
        const compInjuries = comp.injuries ?? [];
        const compSuspensions = comp.suspensions ?? [];
        const homeUnavail = unavailableIds(compMatch.homeTeamId!, compInjuries, compSuspensions);
        const awayUnavail = unavailableIds(compMatch.awayTeamId!, compInjuries, compSuspensions);

        const baseRules = rulesForPhase(comp.config, compMatch.phase);
        // Leg 1 of two-legged ties: no ET, no penalties — settled on aggregate via leg 2
        const matchRules = (compMatch.phase === 'lpm_playoff' && compMatch.leg === 1)
          ? { ...baseRules, extraTime: false, penalties: false }
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

        const input: MatchInput = {
          matchId: mid,
          home: {
            team: homeData.team,
            players: homeData.players,
            formation: homeTactics?.formation ?? homeData.team.formation,
            lineup: homeTactics?.lineup,
            bench: homeTactics?.bench,
            plannedSubs: homeTactics?.plannedSubs,
            tacticStyle: (tacticOverride.home as import('@/lib/types').TacticStyle | undefined) || homeTactics?.style,
            morale: moraleMap[compMatch.homeTeamId!] ?? MORALE_DEFAULT,
            unavailablePlayerIds: [...homeUnavail].filter((id) => id !== 'coach'),
          },
          away: {
            team: awayData.team,
            players: awayData.players,
            formation: awayTactics?.formation ?? awayData.team.formation,
            lineup: awayTactics?.lineup,
            bench: awayTactics?.bench,
            plannedSubs: awayTactics?.plannedSubs,
            tacticStyle: (tacticOverride.away as import('@/lib/types').TacticStyle | undefined) || awayTactics?.style,
            morale: moraleMap[compMatch.awayTeamId!] ?? MORALE_DEFAULT,
            unavailablePlayerIds: [...awayUnavail].filter((id) => id !== 'coach'),
          },
          speed: '1',
          rules: matchRules,
          corruption,
          leg1Score,
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
    const snap = currentRef.current ?? current;
    if (!finished || !matchState || !matchInput || !pat || !snap || !matchId || savedRef.current) return;
    savedRef.current = true;

    async function persist() {
      const compMatch = snap!.matches.find((m) => m.id === matchId);
      if (!compMatch) return;

      // Check corruption revelation before applying result
      const corruptionActive = matchState!.corruption?.accepted;
      const revealed = corruptionActive && isRevealed();

      const motmResult = computeMotm(
        matchState!,
        { team: matchInput!.home.team, players: matchInput!.home.players },
        { team: matchInput!.away.team, players: matchInput!.away.players },
      );
      const ms = matchState!;
      const matchSummary: MatchSummary = {
        motm: motmResult ?? undefined,
        stats: {
          shots: ms.shots,
          shotsOnTarget: ms.shotsOnTarget,
          saves: ms.saves ?? { home: 0, away: 0 },
          passes: ms.passes ?? { home: 0, away: 0 },
          fouls: ms.fouls,
          corners: ms.corners ?? { home: 0, away: 0 },
          offsides: ms.offsides ?? { home: 0, away: 0 },
          freekicks: ms.freekicks ?? { home: 0, away: 0 },
          dribbles: ms.dribbles ?? { home: 0, away: 0 },
          clearances: ms.clearances ?? { home: 0, away: 0 },
          keyPasses: ms.keyPasses ?? { home: 0, away: 0 },
          possession: ms.possession,
          yellowCards: { home: ms.cards.home.yellow.length, away: ms.cards.away.yellow.length },
          redCards: { home: ms.cards.home.red.length, away: ms.cards.away.red.length },
        },
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
              matchFileId: matchState!.matchId,
              simulatedAt: new Date().toISOString(),
            }
          : m,
      );

      let disqualifiedTeamIds = snap!.disqualifiedTeamIds ?? [];

      let corruptionRevealedThisMatch = false;
      if (revealed && compMatch.homeTeamId && compMatch.awayTeamId) {
        // Identify cheating team
        const cheatingTeamId = matchState!.corruption!.side === 'home'
          ? compMatch.homeTeamId
          : compMatch.awayTeamId;

        // Override result + walkover all pending matches
        updatedMatches = applyCorruptionDisqualification(updatedMatches, matchId!, cheatingTeamId);
        disqualifiedTeamIds = [...new Set([...disqualifiedTeamIds, cheatingTeamId])];
        setCorruptionRevealed(true);
        corruptionRevealedThisMatch = true;
      }

      if (compMatch.phase !== 'group' && compMatch.phase !== 'league') {
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
      let updatedSuspensions = decrementSuspensions(snap!.suspensions ?? []);

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
        // isEliminated: top N qualify — can't mathematically reach qualification
        const qualifyCount = snap!.config.qualifyPerGroup ?? Math.ceil(totalTeams / 4);
        const maxRemainingPts = (() => {
          const totalRounds = snap!.matches.filter((m) => m.phase === compMatch.phase).reduce((max, m) => Math.max(max, m.round), 0);
          const remaining = Math.max(0, totalRounds - round);
          return (tidStanding?.points ?? 0) + remaining * 3;
        })();
        const minPtsForSafeZone = sortedStandings[qualifyCount - 1]?.points ?? 0;
        const isEliminated = (compMatch.phase === 'group' || compMatch.phase === 'league')
          && !!tidStanding && tidStanding.played >= 3
          && maxRemainingPts < minPtsForSafeZone;
        // isInDangerZone: bottom 20% of table (or specific relegation zone)
        const dangerThreshold = Math.max(qualifyCount + 1, Math.ceil(totalTeams * 0.75));
        const isInDangerZone = (compMatch.phase === 'group' || compMatch.phase === 'league')
          && tidRank > dangerThreshold;

        const isWorldCup = !!(snap?.name && /coupe du monde|world cup/i.test(snap.name));
        const { item, dopingSuspension, teamDisqualified } = generateMatchPressItem({
          round,
          teamId: tid,
          teamName: tname,
          goalsFor,
          goalsAgainst,
          moraleBefore: prevMorale[tid] ?? MORALE_DEFAULT,
          moraleAfter: updatedMorale[tid] ?? MORALE_DEFAULT,
          seed: seed + tid,
          phase: compMatch.phase,
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
          matchId: compMatch.id,
          matchSnapshot: {
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
          },
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
          newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-dopt-${tid}`, type: 'doping_team', matchId: compMatch.id, matchSnapshot: { homeTeamId: compMatch.homeTeamId!, awayTeamId: compMatch.awayTeamId!, homeTeamName: nameFor(compMatch.homeTeamId!), awayTeamName: nameFor(compMatch.awayTeamId!), homeScore: matchState!.score.home, awayScore: matchState!.score.away } }));
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

        // Win streak — basé sur pressItems AVANT ce round (snap!.pressItems uniquement)
        const isWin = goalsFor > goalsAgainst;
        if (isWin) {
          const prevItems = snap!.pressItems ?? [];
          const teamPrevMatchItems = prevItems
            .filter((p) => p.teamId === tid && ['victoire', 'exploit', 'defaite', 'crise', 'neutralite'].includes(p.category))
            .sort((a, b) => b.round - a.round || b.createdAt.localeCompare(a.createdAt));
          // streak = 1 (ce match) + victoires consécutives passées
          let streak = 1;
          for (const p of teamPrevMatchItems) {
            if (p.category === 'victoire' || p.category === 'exploit') streak++;
            else break;
          }
          // Cards : match courant en tête + jusqu'à 2 victoires précédentes
          const currentSnap: NonNullable<import('@/lib/competition/press').PressItem['matchSnapshot']> = {
            homeTeamId: compMatch.homeTeamId!,
            awayTeamId: compMatch.awayTeamId!,
            homeTeamName: nameFor(compMatch.homeTeamId!),
            awayTeamName: nameFor(compMatch.awayTeamId!),
            homeScore: matchState!.score.home,
            awayScore: matchState!.score.away,
          };
          const prevWinSnaps = prevItems
            .filter((p) => p.teamId === tid && p.matchSnapshot && (p.category === 'victoire' || p.category === 'exploit'))
            .sort((a, b) => b.round - a.round || b.createdAt.localeCompare(a.createdAt))
            .slice(0, 2)
            .map((p) => p.matchSnapshot!);
          const formeItem = generateFormePressItem({
            round,
            teamId: tid,
            teamName: tname,
            winStreak: streak,
            seed: seed + tid + round + 'forme',
            matchSnapshots: [currentSnap, ...prevWinSnaps],
            players: teamPlayers,
            coach: teamCoach ?? undefined,
          });
          if (formeItem) newPressItems.push(formeItem);
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
      const matchSnap = {
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
      };
      if (drameRng() < 0.002) {
        const drameItem = generateDrameItem({ round, seed: `${seed}-drame-evt`, matchId: compMatch.id, matchSnapshot: matchSnap });
        newPressItems.push(drameItem);
        newPressItems.push(generateCmfCommunique({ round, seed: `${seed}-cmf-drame`, type: 'drame', matchId: compMatch.id, matchSnapshot: matchSnap }));
        updatedPendingDrameHommage = { ...updatedPendingDrameHommage, [compMatch.id]: round + 1 };
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

      // Fin de phase (groupe ou knockout complet) → articles bilan + nouveau début de phase
      if (prevPhaseDone && newPhase !== prevPhase) {
        newPressItems.push(...generateCmfItems({ ...cmfBase, seed: cmfSeed + '-fin', phase: prevPhase, moment: 'fin' }));
        newPressItems.push(...generateCmfItems({ ...cmfBase, seed: cmfSeed + '-debut2', phase: newPhase, moment: 'debut' }));
      } else if (phaseMatchesDone && newPhase === prevPhase && !allDone) {
        newPressItems.push(...generateCmfItems({ ...cmfBase, seed: cmfSeed + '-fin2', phase: newPhase, moment: 'fin' }));
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
      };

      // Résultat appliqué en mémoire + localStorage — sauvegarde GitHub manuelle
      setCurrent(updated);
      toast('success', revealed ? 'Scandale ! Résultats mis à jour.' : 'Résultat enregistré localement.');
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
        key={matchId}
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

      <Scoreboard state={matchState} home={matchInput.home.team} away={matchInput.away.team} leg1Score={matchInput.leg1Score} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Pitch
            state={matchState}
            homeFormation={matchInput.home.formation}
            awayFormation={matchInput.away.formation}
            homeColor={matchInput.home.team.jerseyColor}
            awayColor={matchInput.away.team.jerseyColor}
          />
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
          {motm && (
            <div className="inline-flex flex-col items-center gap-1 rounded-md border border-warning/30 bg-warning/5 px-5 py-3">
              <div className="text-xs uppercase tracking-widest text-muted">🏅 Homme du match</div>
              <div className="font-display text-lg">{motm.playerName}</div>
              <div className="text-xs text-muted">{motm.teamName}</div>
              <div className="text-sm font-medium text-warning">{motm.rating.toFixed(1)} / 10</div>
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
