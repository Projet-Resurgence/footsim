import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { useMultiplex } from '@/stores/multiplex';
import { useCompetition } from '@/stores/competition';
import { useTeams } from '@/stores/teams';

import { useBackendArgs } from '@/hooks/useBackendArgs';
import { advanceBracket, applyResultToStandings, applyCorruptionDisqualification, applyPointsPenalty } from '@/lib/competition/scheduler';
import { rulesForPhase } from '@/lib/competition/types';
import type { MatchSummary, CompMatch } from '@/lib/competition/types';
import { accumulateMatchStats, computeAwards, computeMotm } from '@/lib/competition/statsAccumulator';
import { extractGoalsAndCards } from '@/lib/github/matches';
import { CorruptionPanel } from '@/components/match/CorruptionPanel';
import { isRevealed } from '@/lib/sim/corruption';
import { resolveActiveTactic, loadLocalSavedTactics } from '@/lib/localTactics';
import { updateMorale, initMorale, MORALE_DEFAULT } from '@/lib/competition/morale';
import { generateMatchPressItem, generateMoralePressItem, generatePresidencyReboundItem, generateDrameItem, generateDrameHommageItem, generateCmfItems, generateCmfCommunique, generateCmfEnqueteItem, generateCmfJugementItem, generateFormePressItem, generateCoachScandalItem } from '@/lib/competition/press';
import { createMatchInjury, createSuspension, decrementInjuries, decrementSuspensions, unavailableIds } from '@/lib/competition/injuries';
import { PenaltyShootout } from '@/components/match/PenaltyShootout';
import type { MatchInput, MatchState, Speed, CorruptionDeal } from '@/lib/sim/types';
import type { SavedTactic, TacticStyle, Team } from '@/lib/types';
import { PrApiTeamBackend } from '@/lib/prapi/teamBackend';
import { PrApiMatchBackend } from '@/lib/prapi/matchBackend';
import type { StoredMatch } from '@/lib/prapi/matchBackend';
import type { RecentMatchSummary } from '@/lib/github/matches';
import { calcCmfMatchPoints } from '@/lib/github/matches';

export default function MultiplexLive() {
  const { competitionId, round } = useParams<{ competitionId: string; round: string }>();
  const roundNum = Number(round);

  const load = useCompetition((s) => s.load);
  const save = useCompetition((s) => s.save);
  const setCurrent = useCompetition((s) => s.setCurrent);
  const current = useCompetition((s) => s.current);
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; }, [current]);
  const teamsStore = useTeams((s) => s.teams);
  const refreshTeams = useTeams((s) => s.refresh);
  
  const navigate = useNavigate();
  const { ownerId, prApiToken: effectivePat } = useBackendArgs();

  const slots = useMultiplex((s) => s.slots);
  const slotsRef = useRef(slots);
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  const allFinished = useMultiplex((s) => s.allFinished);
  const globalSpeed = useMultiplex((s) => s.globalSpeed);
  const start = useMultiplex((s) => s.start);
  const setGlobalSpeed = useMultiplex((s) => s.setGlobalSpeed);
  const pauseAll = useMultiplex((s) => s.pauseAll);
  const resumeAll = useMultiplex((s) => s.resumeAll);
  const stopAll = useMultiplex((s) => s.stop);
  const updateSlotTactic = useMultiplex((s) => s.updateSlotTactic);

  // Read-and-consume: delete immediately after reading so it never bleeds into the next visit
  const autoSimulate = sessionStorage.getItem('footsim.autoSimulate') === '1';
  sessionStorage.removeItem('footsim.autoSimulate');

  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Parameters<typeof save>[0] | null>(null);
  const pendingUpdateRef = useRef(pendingUpdate);
  useEffect(() => { pendingUpdateRef.current = pendingUpdate; }, [pendingUpdate]);
  // Once we've computed results for this round, block any re-fire of the allFinished effect
  const resultsComputedRef = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [halftimeTacticOpen, setHalftimeTacticOpen] = useState(false);
  const [pauseTacticOpen, setPauseTacticOpen] = useState(false);

  // Pre-launch corruption state
  type PendingSlot = {
    compMatchId: string;
    input: MatchInput;
    corruption: CorruptionDeal | null;
    homeSavedTactics: import('@/lib/types').SavedTactic[];
    awaySavedTactics: import('@/lib/types').SavedTactic[];
    homeTacticId: string;
    awayTacticId: string;
  };
  const [pendingInputs, setPendingInputs] = useState<PendingSlot[] | null>(null);

  // TAB replay queue
  type TabSlot = { state: MatchState; home: Team; away: Team };
  const [tabQueue, setTabQueue] = useState<TabSlot[]>([]);
  const [tabIndex, setTabIndex] = useState(0);
  useEffect(() => {
    if (!effectivePat || !competitionId) return;

    async function setup() {
      try {
        const comp = await load(competitionId!, '', effectivePat);
        if (!comp) { toast('error', 'Compétition introuvable.'); return; }

        const roundMatches = comp.matches.filter(
          (m) => m.round === roundNum && m.status === 'pending' && m.homeTeamId && m.awayTeamId,
        );
        if (roundMatches.length === 0) { toast('error', 'Aucun match à simuler.'); return; }

        // Resolve slugs from teamSnapshot first (no listTeams needed), fall back to store
        function resolveSlug(teamId: string): string | undefined {
          const snap = comp!.teamSnapshot?.[teamId];
          if (snap?.slug) return snap.slug;
          if (teamsStore.length === 0) return undefined;
          return teamsStore.find((t) => t.id === teamId)?.slug;
        }

        // Check if all slugs resolvable without store; if not, load store once
        const needStore = roundMatches.some(
          (m) => !comp.teamSnapshot?.[m.homeTeamId!]?.slug || !comp.teamSnapshot?.[m.awayTeamId!]?.slug,
        );
        if (needStore && teamsStore.length === 0) await refreshTeams(ownerId, null, effectivePat);

        const inputs: Array<{ compMatchId: string; input: MatchInput; homeSavedTactics: import('@/lib/types').SavedTactic[]; awaySavedTactics: import('@/lib/types').SavedTactic[] }> = [];

        const moraleMap = comp.morale ?? initMorale(comp.teamIds);
        const compInjuries = comp.injuries ?? [];
        const compSuspensions = comp.suspensions ?? [];

        // Collect unique slugs and fetch all in parallel
        const slugMap = new Map<string, string>(); // teamId → slug
        for (const m of roundMatches) {
          const hs = resolveSlug(m.homeTeamId!);
          const as_ = resolveSlug(m.awayTeamId!);
          if (hs) slugMap.set(m.homeTeamId!, hs);
          if (as_) slugMap.set(m.awayTeamId!, as_);
        }
        const uniqueSlugs = Array.from(new Set(slugMap.values()));
        const bulkResults = await new PrApiTeamBackend(effectivePat!).bulkTeams(uniqueSlugs);
        const teamDataMap = new Map(bulkResults.map((r) => [r.team.slug, r]));

        for (const m of roundMatches) {
          const homeSlug = slugMap.get(m.homeTeamId!);
          const awaySlug = slugMap.get(m.awayTeamId!);
          if (!homeSlug || !awaySlug) continue;
          const homeData = teamDataMap.get(homeSlug);
          const awayData = teamDataMap.get(awaySlug);
          if (!homeData || !awayData) continue;

          const homeTactics = resolveActiveTactic(homeData.team);
          const awayTactics = resolveActiveTactic(awayData.team);
          const mid = `comp-${competitionId}-${m.id}`;
          const homeUnavail = unavailableIds(m.homeTeamId!, compInjuries, compSuspensions);
          const awayUnavail = unavailableIds(m.awayTeamId!, compInjuries, compSuspensions);
          let leg1Score: { home: number; away: number } | undefined;
          if (m.leg === 2) {
            const leg1 = comp.matches.find(
              (x) => x.leg === 1 && (
                (x.homeTeamId === m.homeTeamId && x.awayTeamId === m.awayTeamId) ||
                (x.homeTeamId === m.awayTeamId && x.awayTeamId === m.homeTeamId)
              ) && x.status === 'completed' && x.result,
            );
            if (leg1?.result) {
              if (leg1.homeTeamId === m.awayTeamId) {
                leg1Score = { home: leg1.result.away, away: leg1.result.home };
              } else {
                leg1Score = { home: leg1.result.home, away: leg1.result.away };
              }
            }
          }
          inputs.push({
            compMatchId: m.id,
            homeSavedTactics: homeData.team.savedTactics ?? [],
            awaySavedTactics: awayData.team.savedTactics ?? [],
            input: {
              matchId: mid,
              home: {
                team: homeData.team,
                players: homeData.players,
                formation: homeTactics?.formation ?? homeData.team.formation,
                lineup: homeTactics?.lineup,
                bench: homeTactics?.bench,
                plannedSubs: homeTactics?.plannedSubs,
                tacticStyle: homeTactics?.style,
                morale: moraleMap[m.homeTeamId!] ?? MORALE_DEFAULT,
                unavailablePlayerIds: [...homeUnavail].filter((id) => id !== 'coach'),
                hasTactic: !!homeTactics,
              },
              away: {
                team: awayData.team,
                players: awayData.players,
                formation: awayTactics?.formation ?? awayData.team.formation,
                lineup: awayTactics?.lineup,
                bench: awayTactics?.bench,
                plannedSubs: awayTactics?.plannedSubs,
                tacticStyle: awayTactics?.style,
                morale: moraleMap[m.awayTeamId!] ?? MORALE_DEFAULT,
                unavailablePlayerIds: [...awayUnavail].filter((id) => id !== 'coach'),
                hasTactic: !!awayTactics,
              },
              speed: globalSpeed,
              rules: m.phase === 'lpm_playoff'
                ? m.leg === 1
                  ? { ...rulesForPhase(comp.config, m.phase), extraTime: false, penalties: false }
                  : m.leg === 3
                  ? { ...rulesForPhase(comp.config, m.phase), extraTime: false, penalties: true }
                  : { ...rulesForPhase(comp.config, m.phase), extraTime: true, penalties: true }
                : rulesForPhase(comp.config, m.phase),
              leg1Score,
            },
          });
        }

        if (inputs.length === 0) { toast('error', 'Données équipes introuvables.'); return; }

        if (autoSimulate) {
          // Skip corruption page — force instant speed, launch immediately
          const launchInputs = inputs.map(({ compMatchId, input }) => ({
            compMatchId,
            input: { ...input, speed: 'instant' as const },
          }));
          start(launchInputs);
        } else {
          setPendingInputs(inputs.map((i) => ({ ...i, corruption: null, homeSavedTactics: i.homeSavedTactics ?? [], awaySavedTactics: i.awaySavedTactics ?? [], homeTacticId: i.input.home.team.activeTacticId ?? '', awayTacticId: i.input.away.team.activeTacticId ?? '' })));
        }
      } catch (err) {
        toast('error', String(err));
      } finally {
        setLoading(false);
      }
    }
    setup();

    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePat, competitionId, roundNum]);

  // Compute pending update when all finished — does NOT auto-save
  useEffect(() => {
    const current = currentRef.current;
    const slots = slotsRef.current;
    console.log('[MultiplexLive allFinished effect]', { allFinished, hasCurrent: !!current, slotsLen: slots.length, hasPendingUpdate: !!pendingUpdateRef.current, resultsComputed: resultsComputedRef.current, currentRound: current?.currentRound, slotsStatus: slots.map(s => s.state?.status) });
    if (!allFinished || !current || slots.length === 0 || pendingUpdateRef.current || resultsComputedRef.current) return;

    let updatedMatches = current.matches;
    let updatedStandings = current.standings;
    let updatedPlayerStats = current.playerStats ?? {};
    let updatedDisqualifiedTeamIds: string[] = current.disqualifiedTeamIds ?? [];

    for (const slot of slots) {
      if (!slot.state || slot.state.status !== 'fulltime') continue;
      const compMatch = current.matches.find((m) => m.id === slot.compMatchId);
      if (!compMatch) continue;

      const homeId2 = compMatch.homeTeamId;
      const awayId2 = compMatch.awayTeamId;

      const slotCorruption = slot.state.corruption;
      const slotCorruptionActive = (slotCorruption?.accepted ?? false) && slotCorruption?.side !== 'both' && !slotCorruption?.refusedByRef;
      const slotRevealed = slotCorruptionActive && isRevealed();
      // refusedByRef: walkover applies to THIS match (50%)
      const refRefusedActive = (slotCorruption?.refusedByRef ?? false) && slotCorruption?.side !== 'both';
      const refRefusedWalkover = refRefusedActive && Math.random() < 0.5;
      const isSlotWalkover = slotRevealed || refRefusedWalkover;

      const slotMotm = isSlotWalkover ? null : computeMotm(
        slot.state,
        { team: slot.home, players: slot.homePlayers },
        { team: slot.away, players: slot.awayPlayers },
      );
      const ss = slot.state;
      const zeroSide = { home: 0, away: 0 };
      const allSlotPlayers = [...slot.homePlayers, ...slot.awayPlayers];
      const slotHomeGoalCards = isSlotWalkover ? { goals: [], cards: [] } : extractGoalsAndCards(ss.events, 'home', allSlotPlayers);
      const slotAwayGoalCards = isSlotWalkover ? { goals: [], cards: [] } : extractGoalsAndCards(ss.events, 'away', allSlotPlayers);

      const slotSummary: MatchSummary = {
        motm: slotMotm ?? undefined,
        homeGoals: slotHomeGoalCards.goals.length ? slotHomeGoalCards.goals : undefined,
        awayGoals: slotAwayGoalCards.goals.length ? slotAwayGoalCards.goals : undefined,
        homeCards: slotHomeGoalCards.cards.length ? slotHomeGoalCards.cards : undefined,
        awayCards: slotAwayGoalCards.cards.length ? slotAwayGoalCards.cards : undefined,
        stats: isSlotWalkover ? {
          shots: zeroSide, shotsOnTarget: zeroSide, xg: zeroSide, saves: zeroSide, passes: zeroSide,
          fouls: zeroSide, corners: zeroSide, offsides: zeroSide, freekicks: zeroSide,
          dribbles: zeroSide, clearances: zeroSide, keyPasses: zeroSide,
          possession: zeroSide, yellowCards: zeroSide, redCards: zeroSide,
        } : {
          shots: ss.shots,
          shotsOnTarget: ss.shotsOnTarget,
          xg: ss.xg,
          saves: ss.saves ?? zeroSide,
          passes: ss.passes ?? zeroSide,
          fouls: ss.fouls,
          corners: ss.corners ?? zeroSide,
          offsides: ss.offsides ?? zeroSide,
          freekicks: ss.freekicks ?? zeroSide,
          dribbles: ss.dribbles ?? zeroSide,
          clearances: ss.clearances ?? zeroSide,
          keyPasses: ss.keyPasses ?? zeroSide,
          possession: ss.possession,
          yellowCards: { home: ss.cards.home.yellow.length, away: ss.cards.away.yellow.length },
          redCards: { home: ss.cards.home.red.length, away: ss.cards.away.red.length },
        },
      };

      // Determine walkover cheater (from revelation or ref refusal)
      const walkoversWinner = (() => {
        if (isSlotWalkover && slotCorruption && homeId2 && awayId2) {
          return slotCorruption.side === 'home' ? homeId2 : awayId2;
        }
        if (refRefusedWalkover && slotCorruption && homeId2 && awayId2) {
          return slotCorruption.side === 'home' ? homeId2 : awayId2;
        }
        return null;
      })();

      if (walkoversWinner) {
        updatedMatches = applyCorruptionDisqualification(updatedMatches, slot.compMatchId, walkoversWinner);
        updatedDisqualifiedTeamIds = [...new Set([...updatedDisqualifiedTeamIds, walkoversWinner])];
      } else {
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
                matchSummary: slotSummary,
                simulatedAt: new Date().toISOString(),
              }
            : m,
        );
      }

      if (!isSlotWalkover) {
        updatedPlayerStats = accumulateMatchStats(
          updatedPlayerStats,
          slot.state,
          { team: slot.home, players: slot.homePlayers },
          { team: slot.away, players: slot.awayPlayers },
        );
      }

      // refusedByRef: walkover already applied above (same match). No scheduling needed.

      if (!walkoversWinner) {
        if ((compMatch.phase === 'group' || compMatch.phase === 'league') && homeId2 && awayId2) {
          updatedStandings = applyResultToStandings(
            updatedStandings,
            homeId2,
            awayId2,
            slot.state.score.home,
            slot.state.score.away,
          );
        } else if (compMatch.phase !== 'group' && compMatch.phase !== 'league') {
          updatedMatches = advanceBracket(updatedMatches, slot.compMatchId);
        }
      } else if (compMatch.phase !== 'group' && compMatch.phase !== 'league') {
        updatedMatches = advanceBracket(updatedMatches, slot.compMatchId);
      }
    }

    const nextRound = updatedMatches.every(
      (m) => m.round <= roundNum
        ? (!m.homeTeamId || !m.awayTeamId || m.status === 'completed')
        : true,
    )
      ? roundNum + 1
      : roundNum;

    const allDone = updatedMatches.every(
      (m) => m.status === 'completed' || ((!m.homeTeamId || !m.awayTeamId) && m.phase !== 'lpm_playoff' && m.phase !== 'group' && m.phase !== 'league'),
    );
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
      } else if (current.format === 'league') {
        const sorted = Object.values(updatedStandings).sort((a, b) => b.points - a.points);
        winner = sorted[0]?.teamId;
      }
    }

    // Queue TAB animations for slots with penalty shootouts
    const tabSlots: TabSlot[] = slots
      .filter((s) => s.state?.penaltyScore)
      .map((s) => ({ state: s.state!, home: s.home, away: s.away }));
    if (tabSlots.length > 0) {
      setTabQueue(tabSlots);
      setTabIndex(0);
    }

    // Morale + press accumulation
    let updatedMorale = current.morale ?? initMorale(current.teamIds);
    let updatedPressItems = current.pressItems ?? [];
    let updatedDopingSuspensions: import('@/lib/competition/injuries').Suspension[] = [];
    // Shared across all slots — prevents double-ban within same round
    const dopingBannedTeamIds = [...(current.disqualifiedTeamIds ?? [])];
    let updatedPendingRebound: Record<string, number> = { ...(current.pendingPresidencyRebound ?? {}) };
    let updatedPendingCmfEnquete: Record<string, { round: number; matchId?: string; walkoverApplied: boolean }> = { ...(current.pendingCmfEnquete ?? {}) };
    const roundNum2 = current.currentRound;

    // Fire pending CMF judgment articles due this round
    for (const [enqueteTeamId, enqueteData] of Object.entries(updatedPendingCmfEnquete)) {
      if (enqueteData.round <= roundNum2) {
        const enqueteTeamName = current.teamSnapshot?.[enqueteTeamId]?.name ?? enqueteTeamId;
        updatedPressItems = [...updatedPressItems, generateCmfJugementItem({
          round: roundNum2,
          seed: `${current.id}-r${roundNum2}-cmfjugement-${enqueteTeamId}`,
          teamId: enqueteTeamId,
          teamName: enqueteTeamName,
          walkoverApplied: enqueteData.walkoverApplied,
          matchId: enqueteData.matchId,
        })];
        const { [enqueteTeamId]: _consumed, ...restEnquete } = updatedPendingCmfEnquete;
        updatedPendingCmfEnquete = restEnquete;
      }
    }

    // Fire pending rebound articles due this round (before processing new matches)
    for (const [reboundTeamId, reboundRound] of Object.entries(updatedPendingRebound)) {
      if (reboundRound <= roundNum2) {
        const reboundName = current.teamSnapshot?.[reboundTeamId]?.name ?? reboundTeamId;
        const reboundItem = generatePresidencyReboundItem({
          round: roundNum2,
          teamId: reboundTeamId,
          teamName: reboundName,
          seed: `${current.id}-r${roundNum2}-rebound-${reboundTeamId}`,
        });
        updatedPressItems = [...updatedPressItems, reboundItem];
        if (reboundItem.moraleBoost && reboundItem.moraleBoost > 0) {
          updatedMorale[reboundTeamId] = Math.min(100, (updatedMorale[reboundTeamId] ?? MORALE_DEFAULT) + reboundItem.moraleBoost);
        }
        const { [reboundTeamId]: _, ...rest } = updatedPendingRebound;
        updatedPendingRebound = rest;
      }
    }

    for (const slot of slots) {
      if (!slot.state || slot.state.status !== 'fulltime') continue;
      const compMatch = current.matches.find((m) => m.id === slot.compMatchId);
      if (!compMatch?.homeTeamId || !compMatch?.awayTeamId) continue;
      const homeId = compMatch.homeTeamId;
      const awayId = compMatch.awayTeamId;
      const moraleBefore = { ...updatedMorale };
      updatedMorale = updateMorale(updatedMorale, homeId, awayId, slot.state.score.home, slot.state.score.away);
      const nameFor = (tid: string) =>
        (tid === slot.home.id ? slot.home.name : null) ??
        (tid === slot.away.id ? slot.away.name : null) ??
        tid;
      const baseSeed = `${current.id}-r${roundNum}-${slot.compMatchId}`;
      let matchDopingOccurred = false;

      // Standings rank for press context
      const sortedStandings = Object.values(updatedStandings).sort(
        (a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst),
      );
      const rankOf = (tid: string) => sortedStandings.findIndex((s) => s.teamId === tid) + 1;
      const totalTeams = current.teamIds.length;
      // LPM: top 24 direct + 25-40 barrages → only rank 41+ truly eliminated
      const isLPMLeague = compMatch.phase === 'league' && totalTeams >= 40;
      const qualifyCount = isLPMLeague ? 40 : (current.config.qualifyPerGroup ?? Math.ceil(totalTeams / 4));
      const totalRoundsInPhase = current.matches.filter((m) => m.phase === compMatch.phase).reduce((mx, m) => Math.max(mx, m.round), 0);

      for (const [tid, goalsFor, goalsAgainst] of [
        [homeId, slot.state.score.home, slot.state.score.away],
        [awayId, slot.state.score.away, slot.state.score.home],
      ] as [string, number, number][]) {
        const isHome = tid === homeId;
        const allPlayers = isHome ? slot.homePlayers : slot.awayPlayers;
        const groupIds = new Set([
          ...(isHome ? slot.state.homeOnPitch : slot.state.awayOnPitch),
          ...(isHome ? slot.state.homeBench : slot.state.awayBench),
        ]);
        const teamPlayers = groupIds.size > 0 ? allPlayers.filter((p) => groupIds.has(p.id)) : allPlayers;
        const teamCoach = isHome ? slot.home.coach : slot.away.coach;
        const tidRank = rankOf(tid);
        const tidStanding = updatedStandings[tid];
        const remaining = Math.max(0, totalRoundsInPhase - current.currentRound);
        const maxRemainingPts = (tidStanding?.points ?? 0) + remaining * 3;
        const minPtsForSafeZone = sortedStandings[qualifyCount - 1]?.points ?? 0;
        const isEliminated = (compMatch.phase === 'group' || compMatch.phase === 'league')
          && !!tidStanding && tidStanding.played >= 3
          && maxRemainingPts < minPtsForSafeZone;
        const dangerThreshold = isLPMLeague ? 40 : Math.max(qualifyCount + 1, Math.ceil(totalTeams * 0.75));
        const isInDangerZone = (compMatch.phase === 'group' || compMatch.phase === 'league')
          && tidRank > dangerThreshold;

        const isWorldCup = !!(current.name && /coupe du monde|world cup/i.test(current.name));
        const slotCorruption2 = slot.state!.corruption;
        const slotCorruptionActive = (slotCorruption2?.accepted ?? false) && slotCorruption2?.side !== 'both' && !slotCorruption2?.refusedByRef;
        const slotCorruptionRevealed = slotCorruptionActive && isRevealed();
        const cheatingTeamId = slotCorruptionActive
          ? (slotCorruption2!.side === 'home' ? homeId : awayId)
          : null;
        const { item: matchPress, dopingSuspension, teamDisqualified, refereeCorruption } = generateMatchPressItem({
          seed: `${baseSeed}-${tid}`,
          round: current.currentRound,
          teamId: tid,
          teamName: nameFor(tid),
          goalsFor,
          goalsAgainst,
          moraleBefore: moraleBefore[tid] ?? MORALE_DEFAULT,
          moraleAfter: updatedMorale[tid] ?? MORALE_DEFAULT,
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
          corruptionEnabled: cheatingTeamId === tid,
          corruptionRevealed: slotCorruptionRevealed,
          matchId: slot.compMatchId,
          matchSnapshot: {
            homeTeamId: homeId,
            awayTeamId: awayId,
            homeTeamName: nameFor(homeId),
            awayTeamName: nameFor(awayId),
            homeScore: slot.state.score.home,
            awayScore: slot.state.score.away,
            stats: {
              shots: slot.state.shots,
              possession: slot.state.possession,
              shotsOnTarget: slot.state.shotsOnTarget,
              corners: slot.state.corners ?? { home: 0, away: 0 },
              fouls: slot.state.fouls,
              yellowCards: { home: slot.state.cards.home.yellow.length, away: slot.state.cards.away.yellow.length },
              redCards: { home: slot.state.cards.home.red.length, away: slot.state.cards.away.red.length },
            },
            motm: computeMotm(slot.state, { team: slot.home, players: slot.homePlayers }, { team: slot.away, players: slot.awayPlayers }) ?? undefined,
          },
        });
        updatedPressItems = [...updatedPressItems, matchPress];
        if (matchPress.moraleShock && matchPress.moraleShock < 0) {
          updatedMorale[tid] = Math.max(1, (updatedMorale[tid] ?? MORALE_DEFAULT) + matchPress.moraleShock);
        }
        if (matchPress.moraleBoost && matchPress.moraleBoost > 0) {
          updatedMorale[tid] = Math.min(100, (updatedMorale[tid] ?? MORALE_DEFAULT) + matchPress.moraleBoost);
        }
        const slotMatchSnap = {
          homeTeamId: homeId,
          awayTeamId: awayId,
          homeTeamName: nameFor(homeId),
          awayTeamName: nameFor(awayId),
          homeScore: slot.state.score.home,
          awayScore: slot.state.score.away,
          stats: {
            shots: slot.state.shots,
            possession: slot.state.possession,
            shotsOnTarget: slot.state.shotsOnTarget,
            corners: slot.state.corners ?? { home: 0, away: 0 },
            fouls: slot.state.fouls,
            yellowCards: { home: slot.state.cards.home.yellow.length, away: slot.state.cards.away.yellow.length },
            redCards: { home: slot.state.cards.home.red.length, away: slot.state.cards.away.red.length },
          },
          motm: computeMotm(slot.state, { team: slot.home, players: slot.homePlayers }, { team: slot.away, players: slot.awayPlayers }) ?? undefined,
        };
        if (dopingSuspension) {
          updatedDopingSuspensions = [...updatedDopingSuspensions, dopingSuspension];
          dopingBannedTeamIds.push(tid);
          matchDopingOccurred = true;
          const dopingPlayerObj = [...slot.homePlayers, ...slot.awayPlayers].find((p) => p.id === dopingSuspension.subjectId);
          updatedPressItems = [...updatedPressItems, generateCmfCommunique({
            round: current.currentRound,
            seed: `${baseSeed}-cmf-dop-${tid}`,
            type: 'doping_player',
            playerName: dopingSuspension.subjectName,
            dopingPlayer: dopingPlayerObj,
            matchId: slot.compMatchId,
            matchSnapshot: slotMatchSnap,
          })];
        }
        if (teamDisqualified) {
          updatedMatches = applyCorruptionDisqualification(updatedMatches, slot.compMatchId, tid);
          updatedDisqualifiedTeamIds = [...new Set([...updatedDisqualifiedTeamIds, tid])];
          dopingBannedTeamIds.push(tid);
          matchDopingOccurred = true;
          updatedPressItems = [...updatedPressItems, generateCmfCommunique({
            round: current.currentRound,
            seed: refereeCorruption ? `${baseSeed}-cmf-ref-${tid}` : `${baseSeed}-cmf-dopt-${tid}`,
            type: refereeCorruption ? 'corruption' : 'doping_team',
            matchId: slot.compMatchId,
            matchSnapshot: slotMatchSnap,
          })];
        } else if (refereeCorruption?.kind === 'revealed') {
          updatedPressItems = [...updatedPressItems, generateCmfCommunique({
            round: current.currentRound,
            seed: `${baseSeed}-cmf-ref-rev-${tid}`,
            type: 'corruption',
            matchId: slot.compMatchId,
            matchSnapshot: slotMatchSnap,
          })];
        } else if (refereeCorruption?.kind === 'refused_reported' && refereeCorruption.penalty === 'points') {
          updatedPressItems = [...updatedPressItems, generateCmfCommunique({
            round: current.currentRound,
            seed: `${baseSeed}-cmf-ref-pts-${tid}`,
            type: 'corruption_points',
            matchId: slot.compMatchId,
            matchSnapshot: slotMatchSnap,
          })];
          updatedStandings = applyPointsPenalty(updatedStandings, tid);
        }
        const moralePress = generateMoralePressItem({
          seed: `${baseSeed}-${tid}-m`,
          round: current.currentRound,
          teamId: tid,
          teamName: nameFor(tid),
          morale: updatedMorale[tid] ?? MORALE_DEFAULT,
        });
        if (moralePress) {
          updatedPressItems = [...updatedPressItems, moralePress];
          if (moralePress.presidentDestitue) {
            updatedPendingRebound = { ...updatedPendingRebound, [tid]: current.currentRound + 1 };
          }
        }

        // Win streak + forme press — basé sur pressItems AVANT ce round
        const isWin = goalsFor > goalsAgainst;
        if (isWin) {
          const prevItems = current.pressItems ?? [];
          const teamPrevMatchItems = prevItems
            .filter((p) => p.teamId === tid && ['victoire', 'exploit', 'defaite', 'crise', 'neutralite'].includes(p.category))
            .sort((a, b) => b.round - a.round || b.createdAt.localeCompare(a.createdAt));
          let streak = 1;
          for (const p of teamPrevMatchItems) {
            if (p.category === 'victoire' || p.category === 'exploit') streak++;
            else break;
          }
          const currentSnap: NonNullable<import('@/lib/competition/press').PressItem['matchSnapshot']> = {
            homeTeamId: homeId,
            awayTeamId: awayId,
            homeTeamName: nameFor(homeId),
            awayTeamName: nameFor(awayId),
            homeScore: slot.state.score.home,
            awayScore: slot.state.score.away,
          };
          const prevWinSnaps = prevItems
            .filter((p) => p.teamId === tid && p.matchSnapshot && (p.category === 'victoire' || p.category === 'exploit'))
            .sort((a, b) => b.round - a.round || b.createdAt.localeCompare(a.createdAt))
            .slice(0, 2)
            .map((p) => p.matchSnapshot!);
          const formeItem = generateFormePressItem({
            round: current.currentRound,
            teamId: tid,
            teamName: nameFor(tid),
            winStreak: streak,
            seed: `${baseSeed}-${tid}-forme`,
            matchSnapshots: [currentSnap, ...prevWinSnaps],
            players: teamPlayers,
            coach: teamCoach ?? undefined,
          });
          if (formeItem) updatedPressItems = [...updatedPressItems, formeItem];
        }

        // Scandale coach (alcoolique / drogué)
        if (teamCoach) {
          const coachScandal = generateCoachScandalItem({
            round: current.currentRound,
            teamId: tid,
            teamName: nameFor(tid),
            coach: teamCoach,
            seed: `${baseSeed}-${tid}-cscandal`,
          });
          if (coachScandal) updatedPressItems = [...updatedPressItems, coachScandal];
        }
      }

      // CMF enquête — ref dénonce avant le match (refusedByRef)
      // Generate enquête article now + schedule judgment for next round
      const slotCorruption3 = slot.state.corruption;
      if (slotCorruption3?.refusedByRef && slotCorruption3.side !== 'both' && compMatch?.homeTeamId && compMatch?.awayTeamId) {
        const briberTeamId3 = slotCorruption3.side === 'home' ? compMatch.homeTeamId : compMatch.awayTeamId;
        const briberName3 = current.teamSnapshot?.[briberTeamId3]?.name ?? briberTeamId3;
        // Only once per slot — check not already generated this round
        if (!updatedPendingCmfEnquete[briberTeamId3]) {
          // refRefusedWalkover was computed in the first loop (slot result loop)
          // We need the same value — use deterministic check by looking at disqualifiedTeamIds for this match
          const walkoApplied = updatedDisqualifiedTeamIds.includes(briberTeamId3);
          const matchSnap3 = {
            homeTeamId: compMatch.homeTeamId,
            awayTeamId: compMatch.awayTeamId,
            homeTeamName: current.teamSnapshot?.[compMatch.homeTeamId]?.name ?? compMatch.homeTeamId,
            awayTeamName: current.teamSnapshot?.[compMatch.awayTeamId]?.name ?? compMatch.awayTeamId,
            homeScore: slot.state.score.home,
            awayScore: slot.state.score.away,
          };
          updatedPressItems = [...updatedPressItems, generateCmfEnqueteItem({
            round: current.currentRound,
            seed: `${baseSeed}-cmf-enquete-${briberTeamId3}`,
            teamId: briberTeamId3,
            teamName: briberName3,
            matchId: slot.compMatchId,
            matchSnapshot: matchSnap3,
          })];
          // Schedule judgment for next round
          const nextJudgmentRound = current.currentRound + 1;
          updatedPendingCmfEnquete = { ...updatedPendingCmfEnquete, [briberTeamId3]: { round: nextJudgmentRound, matchId: slot.compMatchId, walkoverApplied: walkoApplied } };
        }
      }
    }

    // Injuries + suspensions accumulation
    let updatedInjuries = decrementInjuries(current.injuries ?? []);
    const playingTeamIds = slots.flatMap((s) => {
      const m = current.matches.find((cm) => cm.id === s.compMatchId);
      return [m?.homeTeamId, m?.awayTeamId].filter(Boolean) as string[];
    });
    let updatedSuspensions = [...decrementSuspensions(current.suspensions ?? [], playingTeamIds), ...updatedDopingSuspensions];

    for (const slot of slots) {
      if (!slot.state || slot.state.status !== 'fulltime') continue;
      const compMatch = current.matches.find((m) => m.id === slot.compMatchId);
      if (!compMatch?.homeTeamId || !compMatch?.awayTeamId) continue;
      const homePlayersMap = new Map(slot.homePlayers.map((p) => [p.id, p]));
      const awayPlayersMap = new Map(slot.awayPlayers.map((p) => [p.id, p]));
      for (const [side, tid, playersMap] of [
        ['home' as const, compMatch.homeTeamId, homePlayersMap],
        ['away' as const, compMatch.awayTeamId, awayPlayersMap],
      ] as ['home' | 'away', string, Map<string, import('@/lib/types').Player>][]) {
        for (const pid of (slot.state.matchInjuries?.[side] ?? [])) {
          const p = playersMap.get(pid);
          if (!p) continue;
          updatedInjuries = [...updatedInjuries, createMatchInjury(tid, p, compMatch.round)];
        }
        for (const pid of slot.state.cards[side].red) {
          const p = playersMap.get(pid);
          if (!p) continue;
          if (updatedSuspensions.some((s) => s.subjectId === pid && s.teamId === tid)) continue;
          updatedSuspensions = [...updatedSuspensions, createSuspension(
            tid, pid, `${p.firstName} ${p.lastName}`, 1, 'Carton rouge', compMatch.round,
          )];
        }
      }
      for (const [side, tid] of [['home' as const, compMatch.homeTeamId], ['away' as const, compMatch.awayTeamId]] as ['home' | 'away', string][]) {
        if (slot.state.coachEjected?.[side]) {
          const c = (side === 'home' ? slot.home : slot.away).coach;
          const coachName = c ? `${c.firstName} ${c.lastName}` : 'Entraîneur';
          if (!updatedSuspensions.some((s) => s.subjectId === 'coach' && s.teamId === tid)) {
            updatedSuspensions = [...updatedSuspensions, createSuspension(
              tid, 'coach', coachName, 1, 'Expulsion en match', compMatch.round,
            )];
          }
        }
      }
    }

    // ── Drame (0.5% par match) + CMF ─────────────────────────────────────────
    let updatedPendingDrameHommage: Record<string, number> = { ...(current.pendingDrameHommage ?? {}) };

    // Fire pending hommage articles
    for (const [drameMatchId, hommageRound] of Object.entries(updatedPendingDrameHommage)) {
      if (hommageRound <= roundNum) {
        const origSnapshot = updatedPressItems.find((p) => p.matchId === drameMatchId && p.category === 'drame')?.matchSnapshot
          ?? current.pressItems?.find((p) => p.matchId === drameMatchId && p.category === 'drame')?.matchSnapshot;
        if (origSnapshot) {
          updatedPressItems = [...updatedPressItems, generateDrameHommageItem({
            round: roundNum,
            seed: `${current.id}-r${roundNum}-hommage-${drameMatchId}`,
            originalMatchId: drameMatchId,
            originalMatchSnapshot: origSnapshot,
          })];
        }
        const { [drameMatchId]: _, ...rest } = updatedPendingDrameHommage;
        updatedPendingDrameHommage = rest;
      }
    }

    // Drame roll per slot
    for (const slot of slots) {
      if (!slot.state || slot.state.status !== 'fulltime') continue;
      const cm = current.matches.find((m) => m.id === slot.compMatchId);
      if (!cm?.homeTeamId || !cm?.awayTeamId) continue;
      const drameH = (() => { let h = 0; const s = `${current.id}-r${roundNum}-${slot.compMatchId}-drame`; for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; } return () => { h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; return (h >>> 0) / 0xffffffff; }; })();
      if (drameH() < 0.002) {
        const sn = {
          homeTeamId: cm.homeTeamId, awayTeamId: cm.awayTeamId,
          homeTeamName: current.teamSnapshot?.[cm.homeTeamId]?.name ?? cm.homeTeamId,
          awayTeamName: current.teamSnapshot?.[cm.awayTeamId]?.name ?? cm.awayTeamId,
          homeScore: slot.state.score.home, awayScore: slot.state.score.away,
          stats: { shots: slot.state.shots, possession: slot.state.possession, shotsOnTarget: slot.state.shotsOnTarget, corners: slot.state.corners ?? { home: 0, away: 0 }, fouls: slot.state.fouls, yellowCards: { home: slot.state.cards.home.yellow.length, away: slot.state.cards.away.yellow.length }, redCards: { home: slot.state.cards.home.red.length, away: slot.state.cards.away.red.length } },
          motm: computeMotm(slot.state, { team: slot.home, players: slot.homePlayers }, { team: slot.away, players: slot.awayPlayers }) ?? undefined,
        };
        updatedPressItems = [...updatedPressItems, generateDrameItem({ round: roundNum, seed: `${current.id}-r${roundNum}-${slot.compMatchId}-drame-evt`, matchId: slot.compMatchId, matchSnapshot: sn })];
        updatedPendingDrameHommage = { ...updatedPendingDrameHommage, [slot.compMatchId]: roundNum + 1 };
      }
    }

    // CMF — phases et palmarès
    const cmfBase = { round: roundNum, competitionName: current.name, format: current.format, teamSnapshot: current.teamSnapshot ?? {}, standings: updatedStandings, playerStats: updatedPlayerStats };
    const completedSlotPhases = [...new Set(slots.filter((s) => s.state?.status === 'fulltime').map((s) => current.matches.find((m) => m.id === s.compMatchId)?.phase).filter(Boolean) as string[])];
    // Fin de phase : toutes les matches de cette phase terminées
    for (const ph of completedSlotPhases) {
      const phaseMatches = updatedMatches.filter((m) => m.phase === ph);
      if (phaseMatches.length > 0 && phaseMatches.every((m) => m.status === 'completed') && !allDone) {
        // Début de la prochaine phase détectée
        const nextPhaseMatches = updatedMatches.filter((m) => m.phase !== ph && m.status === 'pending');
        const nextPh = nextPhaseMatches[0]?.phase;
        const qualifiedForNext = nextPh ? [...new Set(nextPhaseMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter((id): id is string => !!id))] : [];
        // Pour "fin", favoris = qualifiés pour la suite uniquement (jamais les éliminés)
        updatedPressItems = [...updatedPressItems, ...generateCmfItems({ ...cmfBase, seed: `${current.id}-r${roundNum}-cmf-fin-${ph}`, phase: ph, moment: 'fin', qualifiedTeamIds: qualifiedForNext.length > 0 ? qualifiedForNext : undefined })];
        if (nextPh) {
          const playoffPairsForNext = nextPh === 'lpm_playoff'
            ? updatedMatches.filter((m) => m.phase === 'lpm_playoff' && m.leg === 1 && m.homeTeamId && m.awayTeamId).map((m) => ({ homeTeamId: m.homeTeamId!, awayTeamId: m.awayTeamId! }))
            : undefined;
          updatedPressItems = [...updatedPressItems, ...generateCmfItems({ ...cmfBase, seed: `${current.id}-r${roundNum}-cmf-debut2-${nextPh}`, phase: nextPh, moment: 'debut', qualifiedTeamIds: qualifiedForNext.length > 0 ? qualifiedForNext : undefined, playoffPairs: playoffPairsForNext })];
        }
      }
    }

    // Palmarès
    if (allDone) {
      const finalPh = completedSlotPhases[completedSlotPhases.length - 1] ?? 'F';
      updatedPressItems = [...updatedPressItems, ...generateCmfItems({ ...cmfBase, seed: `${current.id}-r${roundNum}-cmf-palmares`, phase: finalPh, moment: 'palmares', winner })];
    }

    const nextState = {
      ...current,
      matches: updatedMatches,
      standings: updatedStandings,
      playerStats: updatedPlayerStats,
      awards: allDone ? computeAwards(updatedPlayerStats) : current.awards,
      currentRound: Math.min(nextRound, Math.max(...updatedMatches.map((m) => m.round))),
      status: allDone ? ('completed' as const) : ('ongoing' as const),
      winner,
      disqualifiedTeamIds: updatedDisqualifiedTeamIds.length > 0 ? updatedDisqualifiedTeamIds : undefined,
      morale: updatedMorale,
      pressItems: updatedPressItems,
      injuries: updatedInjuries,
      suspensions: updatedSuspensions,
      pendingPresidencyRebound: Object.keys(updatedPendingRebound).length > 0 ? updatedPendingRebound : undefined,
      pendingDrameHommage: Object.keys(updatedPendingDrameHommage).length > 0 ? updatedPendingDrameHommage : undefined,
      pendingCmfEnquete: Object.keys(updatedPendingCmfEnquete).length > 0 ? updatedPendingCmfEnquete : undefined,
    };
    console.log('[MultiplexLive] saving nextState', { currentRound: nextState.currentRound, matchStatuses: nextState.matches.map(m => ({ round: m.round, status: m.status })) });
    resultsComputedRef.current = true;
    setCurrent(nextState);
    setPendingUpdate(nextState);
    if (effectivePat) {
      setSaving(true);
      save(nextState, '', effectivePat).catch(() => {}).finally(() => setSaving(false));

      // Save StoredMatch + recentMatches for each slot
      const matchBk = new PrApiMatchBackend(effectivePat);
      const teamBk = new PrApiTeamBackend(effectivePat);
      const teamSnap = current.teamSnapshot ?? {};

      const storedMatches: StoredMatch[] = [];
      for (const slot of slots) {
        if (!slot.state || slot.state.status !== 'fulltime') continue;
        const compMatch = current.matches.find((m) => m.id === slot.compMatchId);
        if (!compMatch?.homeTeamId || !compMatch?.awayTeamId) continue;
        storedMatches.push({
          id: slot.compMatchId,
          input: {
            home: { team: slot.home, players: slot.homePlayers },
            away: { team: slot.away, players: slot.awayPlayers },
            rules: rulesForPhase(current.config, compMatch.phase),
          } as any,
          state: slot.state,
          home: { team: slot.home, players: slot.homePlayers },
          away: { team: slot.away, players: slot.awayPlayers },
          playedAt: compMatch.simulatedAt ?? new Date().toISOString(),
        });
      }
      matchBk.bulkSaveMatches(storedMatches).catch(() => {});

      // Bulk-fetch all team data to update recentMatches — one request instead of N×2
      const recentMatchUpdates: Array<{ slug: string; homeId: string; awayId: string; isHome: boolean; slot: typeof slots[number]; compMatch: CompMatch }> = [];
      for (const slot of slots) {
        if (!slot.state || slot.state.status !== 'fulltime') continue;
        const compMatch: CompMatch | undefined = current.matches.find((m) => m.id === slot.compMatchId);
        if (!compMatch?.homeTeamId || !compMatch?.awayTeamId) continue;
        const homeId = compMatch.homeTeamId;
        const awayId = compMatch.awayTeamId;
        const homeSlug = teamSnap[homeId]?.slug;
        const awaySlug = teamSnap[awayId]?.slug;
        if (homeSlug) recentMatchUpdates.push({ slug: homeSlug, homeId, awayId, isHome: true, slot, compMatch });
        if (awaySlug) recentMatchUpdates.push({ slug: awaySlug, homeId, awayId, isHome: false, slot, compMatch });
      }

      if (recentMatchUpdates.length > 0) {
        const uniqueSlugs2 = [...new Set(recentMatchUpdates.map((u) => u.slug))];
        teamBk.bulkTeams(uniqueSlugs2).then((bulkResults) => {
          const bySlug = new Map(bulkResults.map((r) => [r.team.slug, r]));
          const saves: Promise<void>[] = [];
          for (const update of recentMatchUpdates) {
            const res = bySlug.get(update.slug);
            if (!res) continue;
            const allSlotPlayers2 = [...update.slot.homePlayers, ...update.slot.awayPlayers];
            const slotHomeGoals = extractGoalsAndCards(update.slot.state!.events, 'home', allSlotPlayers2).goals;
            const slotAwayGoals = extractGoalsAndCards(update.slot.state!.events, 'away', allSlotPlayers2).goals;
            const playedAt2 = update.compMatch.simulatedAt ?? new Date().toISOString();
            const participantCount2 = current.teamIds.length;
            const oppId = update.isHome ? update.awayId : update.homeId;
            const oppSnap = teamSnap[oppId];
            const oppStrength = (oppSnap as any)?.globalStrength ?? 50;
            const scoreFor = update.isHome ? update.slot.state!.score.home : update.slot.state!.score.away;
            const scoreAgainst = update.isHome ? update.slot.state!.score.away : update.slot.state!.score.home;
            const myGoals = update.isHome ? slotHomeGoals : slotAwayGoals;
            const summary: RecentMatchSummary = {
              matchId: update.slot.compMatchId,
              playedAt: playedAt2,
              opponentSlug: oppSnap?.slug ?? '',
              opponentName: oppSnap?.name ?? '',
              homeAway: update.isHome ? 'home' : 'away',
              homeTeamId: update.homeId,
              awayTeamId: update.awayId,
              scoreFor,
              scoreAgainst,
              opponentStrength: oppStrength,
              compKind: current.kind,
              compScope: current.scope,
              compImportance: current.importance,
              participantCount: participantCount2,
              scorers: myGoals.length ? myGoals : undefined,
              cmfPoints: calcCmfMatchPoints({ scoreFor, scoreAgainst, opponentStrength: oppStrength, compKind: current.kind, compScope: current.scope, compImportance: current.importance, participantCount: participantCount2 }),
            };
            const existing = (res.team.recentMatches ?? []).filter((r) => r.matchId !== update.slot.compMatchId);
            const merged = [...existing, summary];
            saves.push(teamBk.saveTeam({ ...res.team, recentMatches: merged }, res.players).catch(() => {}));
          }
          return Promise.all(saves);
        }).catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFinished]);

  // Auto-simulate: jump to next round once save completes (save already triggered in allFinished effect)
  useEffect(() => {
    if (!autoSimulate || !pendingUpdate || saving) return;
    const nextRound = pendingUpdate.currentRound;
    const hasMore = pendingUpdate.matches.some(
      (m) => m.round === nextRound && m.status === 'pending' && m.homeTeamId && m.awayTeamId,
    );
    if (hasMore && pendingUpdate.status !== 'completed') {
      navigate(`/competition/${competitionId}/round/${nextRound}`, { replace: true });
    } else {
      navigate(`/dashboard/competitions/${competitionId}`, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpdate, saving]);

  function launchAll() {
    if (!pendingInputs) return;
    const inputs = pendingInputs.map(({ compMatchId, input, corruption }) => ({
      compMatchId,
      input: { ...input, corruption: corruption ?? undefined },
    }));
    start(inputs);
    setPendingInputs(null);
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

  if (pendingInputs) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        <div>
          <Link to={`/dashboard/competitions/${competitionId}`} className="text-sm text-muted hover:text-text">
            ← {current?.name ?? 'Compétition'}
          </Link>
          <h1 className="mt-1 font-display text-2xl">Multiplex — Journée {roundNum}</h1>
          <p className="text-sm text-muted mt-1">Configurez la corruption avant de lancer les matchs.</p>
        </div>

        <div className="space-y-3">
          {pendingInputs.map((slot, i) => {
            const home = slot.input.home.team;
            const away = slot.input.away.team;
            const deal = slot.corruption;
            return (
              <div key={slot.compMatchId} className="rounded-lg border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1">
                    {home.flag && <img src={home.flag} alt="" className="h-6 w-6 rounded-sm object-cover" />}
                    <span className="font-medium text-sm truncate">{home.name}</span>
                  </div>
                  <span className="text-muted text-xs">vs</span>
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <span className="font-medium text-sm truncate">{away.name}</span>
                    {away.flag && <img src={away.flag} alt="" className="h-6 w-6 rounded-sm object-cover" />}
                  </div>
                </div>

                {/* Tactic selectors */}
                <div className="grid grid-cols-2 gap-2">
                  {(['home', 'away'] as const).map((side) => {
                    const team = side === 'home' ? home : away;
                    const tactics = side === 'home' ? slot.homeSavedTactics : slot.awaySavedTactics;
                    const activeId = side === 'home' ? slot.input.home.team.activeTacticId : slot.input.away.team.activeTacticId;
                    const selectedId = side === 'home' ? slot.homeTacticId : slot.awayTacticId;
                    const tacticIdKey = side === 'home' ? 'homeTacticId' : 'awayTacticId';
                    return (
                      <div key={side} className="space-y-1">
                        <div className="text-[10px] uppercase tracking-widest text-muted">{team.name}</div>
                        <select
                          value={selectedId}
                          onChange={(e) => {
                            const tactic = tactics.find((t) => t.id === e.target.value);
                            setPendingInputs((prev) => prev ? prev.map((s, si) => si !== i ? s : {
                              ...s,
                              [tacticIdKey]: e.target.value,
                              input: {
                                ...s.input,
                                [side]: {
                                  ...s.input[side],
                                  formation: tactic?.formation ?? s.input[side].formation,
                                  lineup: tactic?.lineup ?? s.input[side].lineup,
                                  bench: tactic?.bench ?? s.input[side].bench,
                                  plannedSubs: tactic?.plannedSubs ?? s.input[side].plannedSubs,
                                  tacticStyle: tactic?.style ?? s.input[side].tacticStyle,
                                },
                              },
                            }) : prev);
                          }}
                          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
                        >
                          <option value="">Par défaut</option>
                          {tactics.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} · {t.formationLabel ?? t.formation}{t.id === activeId ? ' ✓' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                <CorruptionPanel
                  homeTeamName={home.name}
                  awayTeamName={away.name}
                  deal={deal}
                  onDeal={(d) => setPendingInputs((prev) => prev ? prev.map((s, si) => si === i ? { ...s, corruption: d } : s) : prev)}
                />
              </div>
            );
          })}
        </div>

        <Button onClick={launchAll}>▶ Lancer tous les matchs</Button>

      </main>
    );
  }

  // TAB replay overlay
  if (tabQueue.length > 0 && tabIndex < tabQueue.length) {
    const tab = tabQueue[tabIndex];
    return (
      <PenaltyShootout
        key={tabIndex}
        state={tab.state}
        home={tab.home}
        away={tab.away}
        onDone={() => {
          const next = tabIndex + 1;
          if (next >= tabQueue.length) {
            setTabQueue([]);
          } else {
            setTabIndex(next);
          }
        }}
      />
    );
  }

  const halftimeSlots = slots.filter((s) => s.state?.status === 'halftime' || s.state?.status === 'extraTimeHalfTime');
  const isHalftime = !allFinished && halftimeSlots.length > 0;
  const isExtraHalftime = halftimeSlots.some((s) => s.state?.status === 'extraTimeHalfTime');

  // Controls bar (shared)
  const controlsBar = (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="flex rounded-md border border-border overflow-hidden text-sm">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setGlobalSpeed(s)}
            className={`px-3 py-1.5 transition-colors ${globalSpeed === s ? 'bg-accent text-white' : 'hover:bg-border/40'}`}
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
      <button
        onClick={() => setFullscreen((v) => !v)}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-border/40 transition-colors"
        title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
      >
        {fullscreen ? '⊠' : '⛶'}
      </button>
    </div>
  );

  const activeSlots = slots.filter((s) => s.state && !['halftime', 'extraTimeHalfTime', 'fulltime', 'pregame'].includes(s.state.status));

  // Pause tactic bar — visible when manually paused (not halftime)
  const pauseBar = paused && !isHalftime && !allFinished && activeSlots.length > 0 && (
    <div className="border border-border/60 bg-surface rounded-lg flex-shrink-0">
      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium">⏸ Pause — {activeSlots.length} match(s)</span>
        <button
          onClick={() => setPauseTacticOpen((v) => !v)}
          className="text-xs text-muted hover:text-text border border-border rounded px-2 py-1 transition-colors"
        >
          {pauseTacticOpen ? '▼ Tactiques' : '▶ Tactiques'}
        </button>
      </div>
      {pauseTacticOpen && (
        <div className="border-t border-border/40 px-4 py-2 grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-h-52 overflow-y-auto">
          {activeSlots.map((slot) => (
            <HalftimeTacticRow
              key={slot.compMatchId}
              slot={slot}
              onTacticChange={(side, tactic) => updateSlotTactic(slot.compMatchId, side, {
                formation: tactic.formation,
                lineup: tactic.lineup,
                bench: tactic.bench,
                plannedSubs: tactic.plannedSubs,
                tacticStyle: tactic.style as TacticStyle,
                positionMap: tactic.positionMap,
                tokenPositions: tactic.tokenPositions,
              })}
            />
          ))}
        </div>
      )}
    </div>
  );

  // Halftime tactic bar (fixed bottom)
  const halftimeBar = isHalftime && (
    <div className="border border-warning/40 bg-warning/5 rounded-lg flex-shrink-0">
      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium">
          ⏸ {isExtraHalftime ? 'Mi-temps prol.' : 'Mi-temps'} — {halftimeSlots.length} match(s) en pause
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHalftimeTacticOpen((v) => !v)}
            className="text-xs text-muted hover:text-text border border-border rounded px-2 py-1 transition-colors"
          >
            {halftimeTacticOpen ? '▼ Tactiques' : '▶ Tactiques'}
          </button>
          <Button size="sm" onClick={() => { resumeAll(); setPaused(false); setHalftimeTacticOpen(false); }}>
            ▶ Reprendre la 2e {isExtraHalftime ? 'période' : 'mi-temps'}
          </Button>
        </div>
      </div>
      {halftimeTacticOpen && (
        <div className="border-t border-border/40 px-4 py-2 grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-h-52 overflow-y-auto">
          {halftimeSlots.map((slot) => (
            <HalftimeTacticRow
              key={slot.compMatchId}
              slot={slot}
              onTacticChange={(side, tactic) => updateSlotTactic(slot.compMatchId, side, {
                formation: tactic.formation,
                lineup: tactic.lineup,
                bench: tactic.bench,
                plannedSubs: tactic.plannedSubs,
                tacticStyle: tactic.style as TacticStyle,
                positionMap: tactic.positionMap,
                tokenPositions: tactic.tokenPositions,
              })}
            />
          ))}
        </div>
      )}
    </div>
  );

  // Fullscreen: fixed inset, no scroll, grid fills remaining height
  if (fullscreen) {
    // cols = ceil(sqrt(n)), rows = ceil(n/cols) — square-ish layout
    const n = slots.length;
    const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    // density: tiny=9+, small=5-8, normal=1-4
    const density: 'tiny' | 'small' | 'normal' = n >= 9 ? 'tiny' : n >= 5 ? 'small' : 'normal';

    return (
      <div className="fixed inset-0 z-40 bg-bg flex flex-col" style={{ overflow: 'hidden' }}>
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border flex-shrink-0 gap-3">
          <span className="font-display text-sm truncate">Multiplex — J{roundNum} {current?.name ? `· ${current.name}` : ''}</span>
          {controlsBar}
        </div>

        {allFinished && (
          <div className="px-3 py-1.5 border-b border-accent/30 bg-accent/5 flex items-center justify-between gap-2 flex-shrink-0 text-xs">
            <span className="font-medium">Tous les matchs sont terminés.</span>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setFullscreen(false); navigate(`/dashboard/competitions/${competitionId}`); }}>
              {saving ? <Spinner className="mr-1 h-3 w-3" /> : null}Terminé
            </Button>
          </div>
        )}

        {pauseBar && <div className="px-3 flex-shrink-0">{pauseBar}</div>}
        {halftimeBar && <div className="px-3 flex-shrink-0">{halftimeBar}</div>}

        {/* Grid fills all remaining space */}
        <div
          className="flex-1 min-h-0 grid gap-2 px-3 pb-2"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {slots.map((slot) => (
            <MatchCard key={slot.compMatchId} slot={slot} density={density} />
          ))}
        </div>
      </div>
    );
  }

  // Normal mode
  const normalCols = slots.length <= 2 ? 'md:grid-cols-2' : slots.length <= 4 ? 'md:grid-cols-2 lg:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3';

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to={`/dashboard/competitions/${competitionId}`} className="text-sm text-muted hover:text-text">
            ← {current?.name ?? 'Compétition'}
          </Link>
          <h1 className="mt-1 font-display text-2xl">Multiplex — Journée {roundNum}</h1>
        </div>
        {controlsBar}
      </div>

      {pauseBar}
      {halftimeBar}

      {allFinished && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="font-medium">Tous les matchs sont terminés.</span>
          <Button size="sm" disabled={saving} onClick={() => navigate(`/dashboard/competitions/${competitionId}`)}>
            {saving ? <Spinner className="mr-1 h-3 w-3" /> : null}Terminé
          </Button>
        </div>
      )}

      <div className={`grid gap-4 ${normalCols}`}>
        {slots.map((slot) => (
          <MatchCard key={slot.compMatchId} slot={slot} density="normal" />
        ))}
      </div>
    </main>
  );
}

function HalftimeTacticRow({ slot, onTacticChange }: {
  slot: import('@/stores/multiplex').MultiplexSlot;
  onTacticChange: (side: 'home' | 'away', tactic: SavedTactic) => void;
}) {
  const [homeTactics] = useState<SavedTactic[]>(() => {
    const local = loadLocalSavedTactics(slot.home.id);
    return local.savedTactics.length > 0 ? local.savedTactics : (slot.home.savedTactics ?? []);
  });
  const [awayTactics] = useState<SavedTactic[]>(() => {
    const local = loadLocalSavedTactics(slot.away.id);
    return local.savedTactics.length > 0 ? local.savedTactics : (slot.away.savedTactics ?? []);
  });
  const [homeTacticId, setHomeTacticId] = useState('');
  const [awayTacticId, setAwayTacticId] = useState('');

  function handleChange(side: 'home' | 'away', id: string) {
    const tactics = side === 'home' ? homeTactics : awayTactics;
    const tactic = tactics.find((t) => t.id === id);
    if (!tactic) return;
    if (side === 'home') setHomeTacticId(id);
    else setAwayTacticId(id);
    onTacticChange(side, tactic);
  }

  if (homeTactics.length === 0 && awayTactics.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-surface p-2 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        {slot.home.flag && <img src={slot.home.flag} alt="" className="h-4 w-4 rounded-sm object-cover" />}
        <span className="truncate">{slot.home.name}</span>
        <span className="text-muted/40">vs</span>
        <span className="truncate">{slot.away.name}</span>
        {slot.away.flag && <img src={slot.away.flag} alt="" className="h-4 w-4 rounded-sm object-cover" />}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['home', 'away'] as const).map((side) => {
          const tactics = side === 'home' ? homeTactics : awayTactics;
          const val = side === 'home' ? homeTacticId : awayTacticId;
          const teamName = side === 'home' ? slot.home.name : slot.away.name;
          if (tactics.length === 0) return <div key={side} />;
          return (
            <div key={side}>
              <div className="text-[9px] uppercase tracking-widest text-muted mb-0.5 truncate">{teamName}</div>
              <select
                value={val}
                onChange={(e) => handleChange(side, e.target.value)}
                className="w-full rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
              >
                <option value="">— Inchangée —</option>
                {tactics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · {t.formationLabel ?? t.formation}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({ slot, density = 'normal' }: { slot: import('@/stores/multiplex').MultiplexSlot; density?: 'normal' | 'small' | 'tiny' }) {
  const state = slot.state;
  const home = slot.home;
  const away = slot.away;

  const prevScoreRef = useRef({ home: 0, away: 0 });
  const [flash, setFlash] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreSize = density === 'normal' ? 'text-3xl' : density === 'small' ? 'text-2xl' : 'text-xl';
  const flagSize = density === 'normal' ? 'h-8 w-8' : density === 'small' ? 'h-6 w-6' : 'h-5 w-5';
  const padding = density === 'normal' ? 'p-4' : density === 'small' ? 'p-2' : 'p-1.5';
  const space = density === 'normal' ? 'space-y-3' : 'space-y-1';
  const textSm = density === 'tiny' ? 'text-[10px]' : 'text-xs';

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
    .filter((e) => ['goal', 'yellow', 'red', 'penalty', 'penalty_miss', 'penalty_saved'].includes(e.type))
    .slice(-3) ?? [];

  return (
    <motion.div
      className={`rounded-lg border bg-surface ${padding} ${space} transition-colors overflow-hidden flex flex-col min-h-0 ${
        flash ? 'border-accent shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)]' : 'border-border'
      } ${slot.finished ? 'opacity-80' : ''}`}
      animate={flash ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between ${textSm} text-muted flex-shrink-0`}>
        <span className="uppercase tracking-wide">
          {state?.status === 'fulltime' ? 'FT' : state?.status === 'halftime' ? 'MT' : 'EN COURS'}
        </span>
        <span className="font-medium">{minuteLabel()}</span>
      </div>

      {/* Score */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <TeamMini team={home} flagSize={flagSize} compact={density !== 'normal'} />
        <div className="flex-1 text-center">
          <div className={`font-display ${scoreSize} tabular-nums ${flash ? 'text-accent' : ''}`}>
            {state?.score.home ?? 0} – {state?.score.away ?? 0}
          </div>
          {state?.penaltyScore && (
            <div className={`${textSm} text-muted`}>tab {state.penaltyScore.home}–{state.penaltyScore.away}</div>
          )}
          {slot.leg1Score && density !== 'tiny' && (
            <div className="text-[10px] text-muted">
              cumul {slot.leg1Score.home + (state?.score.home ?? 0)}–{slot.leg1Score.away + (state?.score.away ?? 0)}
            </div>
          )}
        </div>
        <TeamMini team={away} right flagSize={flagSize} compact={density !== 'normal'} />
      </div>

      {/* Stats — hidden in tiny, collapsible in small, full in normal */}
      {density !== 'tiny' && state && (state.shots.home + state.shots.away) > 0 && (
        <div className="border-t border-border/50 pt-1 space-y-0.5 flex-shrink-0">
          <StatBar label="Poss." home={state.possession.home} away={state.possession.away} percent />
          <StatBar label="Tirs" home={state.shots.home} away={state.shots.away} />
          {(showStats || density === 'normal') && (
            <StatBar label="Cadrés" home={state.shotsOnTarget.home} away={state.shotsOnTarget.away} />
          )}
          {showStats && density === 'normal' && (
            <>
              <StatBar label="Arrêts" home={state.saves?.home ?? 0} away={state.saves?.away ?? 0} />
              <StatBar label="Fautes" home={state.fouls.home} away={state.fouls.away} />
              <StatBar label="Corners" home={state.corners?.home ?? 0} away={state.corners?.away ?? 0} />
              <div className="flex justify-between text-[10px] text-muted pt-0.5">
                <span>🟨{state.cards.home.yellow.length} 🟥{state.cards.home.red.length}</span>
                <span>Cartons</span>
                <span>🟨{state.cards.away.yellow.length} 🟥{state.cards.away.red.length}</span>
              </div>
            </>
          )}
          {density === 'normal' && (
            <button
              onClick={() => setShowStats((v) => !v)}
              className="w-full text-center text-[10px] text-muted/60 hover:text-muted pt-0.5 transition-colors"
            >
              {showStats ? '▲ Moins' : '▼ Toutes les stats'}
            </button>
          )}
        </div>
      )}

      {/* Recent events — last 2 in tiny, last 3 otherwise */}
      {notableEvents.length > 0 && (
        <div className="space-y-0.5 border-t border-border/50 pt-1 flex-1 min-h-0 overflow-hidden">
          {notableEvents.slice(density === 'tiny' ? -2 : -3).map((ev) => (
            <div key={ev.id} className={`${textSm} text-muted truncate`}>
              {ev.text}
            </div>
          ))}
        </div>
      )}

      {!state && (
        <div className="flex justify-center py-2 flex-shrink-0"><Spinner className="h-4 w-4" /></div>
      )}
    </motion.div>
  );
}

function TeamMini({ team, right, flagSize = 'h-8 w-8', compact }: { team: Team; right?: boolean; flagSize?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 flex-1 min-w-0 ${right ? 'items-end' : 'items-start'}`}>
      {team.flag ? (
        <img src={team.flag} alt="" className={`${flagSize} object-cover rounded-sm flex-shrink-0`} />
      ) : (
        <div className={`${flagSize} rounded-sm bg-border flex-shrink-0`} />
      )}
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted truncate w-full ${right ? 'text-right' : 'text-left'}`}>{team.name}</span>
    </div>
  );
}

function StatBar({ label, home, away, percent }: { label: string; home: number; away: number; percent?: boolean }) {
  const total = home + away || 1;
  const homePct = Math.round((home / total) * 100);
  const awayPct = 100 - homePct;
  const homeVal = percent ? `${homePct}%` : String(home);
  const awayVal = percent ? `${awayPct}%` : String(away);
  const barHome = percent ? homePct : homePct;

  return (
    <div className="text-xs">
      <div className="flex justify-between text-muted mb-0.5">
        <span>{homeVal}</span>
        <span className="text-[10px] text-muted/60">{label}</span>
        <span>{awayVal}</span>
      </div>
      <div className="flex h-1 rounded-full overflow-hidden bg-border/40">
        <div className="bg-accent/60 transition-all" style={{ width: `${barHome}%` }} />
        <div className="bg-danger/50 flex-1 transition-all" />
      </div>
    </div>
  );
}
