import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { useMultiplex } from '@/stores/multiplex';
import { useCompetition } from '@/stores/competition';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { advanceBracket, applyResultToStandings, applyCorruptionDisqualification } from '@/lib/competition/scheduler';
import { rulesForPhase } from '@/lib/competition/types';
import type { MatchSummary } from '@/lib/competition/types';
import { accumulateMatchStats, computeAwards, computeMotm } from '@/lib/competition/statsAccumulator';
import { generateRefOffer, acceptOffer } from '@/lib/sim/corruption';
import { resolveActiveTactic } from '@/lib/localTactics';
import { updateMorale, initMorale, MORALE_DEFAULT } from '@/lib/competition/morale';
import { generateMatchPressItem, generateMoralePressItem, generatePresidencyReboundItem } from '@/lib/competition/press';
import { createMatchInjury, createSuspension, decrementInjuries, decrementSuspensions, unavailableIds } from '@/lib/competition/injuries';
import { PenaltyShootout } from '@/components/match/PenaltyShootout';
import type { MatchInput, MatchState, Speed, CorruptionDeal } from '@/lib/sim/types';
import type { CorruptionOffer } from '@/lib/sim/corruption';
import type { Team, TacticStyle } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';

export default function MultiplexLive() {
  const { competitionId, round } = useParams<{ competitionId: string; round: string }>();
  const roundNum = Number(round);

  const load = useCompetition((s) => s.load);
  const save = useCompetition((s) => s.save);
  const saveLocal = useCompetition((s) => s.saveLocal);
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

  const autoSimulate = sessionStorage.getItem('footsim.autoSimulate') === '1';

  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [savingGh, setSavingGh] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Parameters<typeof save>[0] | null>(null);

  // Pre-launch corruption state
  type PendingSlot = {
    compMatchId: string;
    input: MatchInput;
    corruption: CorruptionDeal | null;
    refContacted: boolean;   // true once any contact attempt made for this match
    refOffer: CorruptionOffer | null; // null = refused
  };
  const [pendingInputs, setPendingInputs] = useState<PendingSlot[] | null>(null);

  // TAB replay queue
  type TabSlot = { state: MatchState; home: Team; away: Team };
  const [tabQueue, setTabQueue] = useState<TabSlot[]>([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [corruptionModal, setCorruptionModal] = useState<{
    slotIdx: number;
    side: 'home' | 'away';
    offer: CorruptionOffer | null;
  } | null>(null);

  useEffect(() => {
    if (!pat || !competitionId) return;

    async function setup() {
      try {
        const comp = await load(competitionId!, pat!);
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
        if (needStore && teamsStore.length === 0) await refreshTeams(ownerId, effectivePat);

        const inputs: Array<{ compMatchId: string; input: MatchInput }> = [];

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
        const teamDataArr = await Promise.all(
          uniqueSlugs.map((slug) => fetchTeam(slug, ownerId, effectivePat)),
        );
        const teamDataMap = new Map<string, NonNullable<typeof teamDataArr[number]>>();
        for (let i = 0; i < uniqueSlugs.length; i++) {
          const d = teamDataArr[i];
          if (d) teamDataMap.set(uniqueSlugs[i], d);
        }

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
              },
              speed: globalSpeed,
              rules: (m.phase === 'lpm_playoff' && m.leg === 1)
                ? { ...rulesForPhase(comp.config, m.phase), extraTime: false, penalties: false }
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
          setPendingInputs(inputs.map((i) => ({ ...i, corruption: null, refContacted: false, refOffer: null })));
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

      const slotMotm = computeMotm(
        slot.state,
        { team: slot.home, players: slot.homePlayers },
        { team: slot.away, players: slot.awayPlayers },
      );
      const ss = slot.state;
      const slotSummary: MatchSummary = {
        motm: slotMotm ?? undefined,
        stats: {
          shots: ss.shots,
          shotsOnTarget: ss.shotsOnTarget,
          saves: ss.saves ?? { home: 0, away: 0 },
          passes: ss.passes ?? { home: 0, away: 0 },
          fouls: ss.fouls,
          corners: ss.corners ?? { home: 0, away: 0 },
          offsides: ss.offsides ?? { home: 0, away: 0 },
          freekicks: ss.freekicks ?? { home: 0, away: 0 },
          dribbles: ss.dribbles ?? { home: 0, away: 0 },
          clearances: ss.clearances ?? { home: 0, away: 0 },
          keyPasses: ss.keyPasses ?? { home: 0, away: 0 },
          possession: ss.possession,
          yellowCards: { home: ss.cards.home.yellow.length, away: ss.cards.away.yellow.length },
          redCards: { home: ss.cards.home.red.length, away: ss.cards.away.red.length },
        },
      };

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
      (m) => m.round <= roundNum
        ? (!m.homeTeamId || !m.awayTeamId || m.status === 'completed')
        : true,
    )
      ? roundNum + 1
      : roundNum;

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
    let updatedDisqualifiedTeamIds = current.disqualifiedTeamIds ?? [];
    let updatedPendingRebound: Record<string, number> = { ...(current.pendingPresidencyRebound ?? {}) };
    const roundNum2 = current.currentRound;

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
      const qualifyCount = current.config.qualifyPerGroup ?? Math.ceil(totalTeams / 4);
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
        const dangerThreshold = Math.max(qualifyCount + 1, Math.ceil(totalTeams * 0.75));
        const isInDangerZone = (compMatch.phase === 'group' || compMatch.phase === 'league')
          && tidRank > dangerThreshold;

        const isWorldCup = !!(current.name && /coupe du monde|world cup/i.test(current.name));
        const { item: matchPress, dopingSuspension, teamDisqualified } = generateMatchPressItem({
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
        });
        updatedPressItems = [...updatedPressItems, matchPress];
        if (matchPress.moraleShock && matchPress.moraleShock < 0) {
          updatedMorale[tid] = Math.max(1, (updatedMorale[tid] ?? MORALE_DEFAULT) + matchPress.moraleShock);
        }
        if (matchPress.moraleBoost && matchPress.moraleBoost > 0) {
          updatedMorale[tid] = Math.min(100, (updatedMorale[tid] ?? MORALE_DEFAULT) + matchPress.moraleBoost);
        }
        if (dopingSuspension) {
          updatedDopingSuspensions = [...updatedDopingSuspensions, dopingSuspension];
          dopingBannedTeamIds.push(tid);
          matchDopingOccurred = true;
        }
        if (teamDisqualified) {
          updatedMatches = applyCorruptionDisqualification(updatedMatches, slot.compMatchId, tid);
          updatedDisqualifiedTeamIds = [...new Set([...updatedDisqualifiedTeamIds, tid])];
          dopingBannedTeamIds.push(tid);
          matchDopingOccurred = true;
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
      }
    }

    // Injuries + suspensions accumulation
    let updatedInjuries = decrementInjuries(current.injuries ?? []);
    let updatedSuspensions = [...decrementSuspensions(current.suspensions ?? []), ...updatedDopingSuspensions];

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

    setPendingUpdate({
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
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFinished]);

  function handleSaveLocal() {
    if (!pendingUpdate) return;
    saveLocal(pendingUpdate);
    toast('success', 'Résultats enregistrés localement.');
    setPendingUpdate(null);
  }

  async function handleSaveGitHub() {
    if (!pendingUpdate || !pat) return;
    setSavingGh(true);
    try {
      await save(pendingUpdate, pat);
      toast('success', 'Résultats sauvegardés sur GitHub.');
      setPendingUpdate(null);
    } catch (err) {
      toast('error', `Erreur : ${err}`);
    } finally {
      setSavingGh(false);
    }
  }

  // Auto-simulate: save and jump to next round (or back to competition if done)
  useEffect(() => {
    if (!autoSimulate || !pendingUpdate || !pat) return;
    let cancelled = false;
    async function autoSave() {
      setSavingGh(true);
      try {
        await save(pendingUpdate!, pat!);
        if (cancelled) return;
        setPendingUpdate(null);
        const nextRound = pendingUpdate!.currentRound;
        const hasMore = pendingUpdate!.matches.some(
          (m) => m.round === nextRound && m.status === 'pending' && m.homeTeamId && m.awayTeamId,
        );
        if (hasMore && pendingUpdate!.status !== 'completed') {
          navigate(`/competition/${competitionId}/round/${nextRound}`, { replace: true });
        } else {
          sessionStorage.removeItem('footsim.autoSimulate');
          navigate(`/dashboard/competitions/${competitionId}`, { replace: true });
        }
      } catch (err) {
        toast('error', `Auto-simulation : erreur sauvegarde — ${err}`);
        sessionStorage.removeItem('footsim.autoSimulate');
      } finally {
        if (!cancelled) setSavingGh(false);
      }
    }
    autoSave();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpdate]);

  function launchAll() {
    if (!pendingInputs) return;
    const inputs = pendingInputs.map(({ compMatchId, input, corruption }) => ({
      compMatchId,
      input: { ...input, corruption: corruption ?? undefined },
    }));
    start(inputs);
    setPendingInputs(null);
  }

  function contactRef(slotIdx: number, side: 'home' | 'away') {
    const offer = generateRefOffer();
    // Mark this match as contacted regardless of outcome
    setPendingInputs((prev) =>
      prev ? prev.map((s, i) => i === slotIdx ? { ...s, refContacted: true, refOffer: offer } : s) : prev,
    );
    setCorruptionModal({ slotIdx, side, offer });
  }

  function acceptCorruption() {
    if (!corruptionModal || !corruptionModal.offer) return;
    const deal = acceptOffer(corruptionModal.side, corruptionModal.offer);
    setPendingInputs((prev) =>
      prev
        ? prev.map((s, i) => (i === corruptionModal.slotIdx ? { ...s, corruption: deal } : s))
        : prev,
    );
    setCorruptionModal(null);
  }

  function declineCorruption() {
    setCorruptionModal(null);
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

                {/* Tactic style selectors */}
                <div className="grid grid-cols-2 gap-2">
                  {(['home', 'away'] as const).map((side) => {
                    const team = side === 'home' ? home : away;
                    const current = side === 'home' ? slot.input.home.tacticStyle : slot.input.away.tacticStyle;
                    return (
                      <div key={side} className="space-y-1">
                        <div className="text-[10px] uppercase tracking-widest text-muted">{team.name}</div>
                        <select
                          value={current ?? ''}
                          onChange={(e) => {
                            const val = e.target.value as TacticStyle | '';
                            setPendingInputs((prev) => prev ? prev.map((s, si) => si !== i ? s : {
                              ...s,
                              input: {
                                ...s.input,
                                [side]: { ...s.input[side], tacticStyle: val || undefined },
                              },
                            }) : prev);
                          }}
                          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-text"
                        >
                          <option value="">Par défaut</option>
                          {(Object.keys(TACTIC_STYLE_LABEL) as TacticStyle[]).map((s) => (
                            <option key={s} value={s}>{TACTIC_STYLE_LABEL[s]}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                {deal ? (
                  <div className="text-xs rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-warning flex items-center justify-between">
                    <span>🤝 Corruption active — {deal.side === 'home' ? home.name : away.name} ({deal.bribe}M€)</span>
                    <button
                      className="underline opacity-70 hover:opacity-100"
                      onClick={() => setPendingInputs((prev) => prev ? prev.map((s, si) => si === i ? { ...s, corruption: null, refContacted: false, refOffer: null } : s) : prev)}
                    >
                      Annuler
                    </button>
                  </div>
                ) : slot.refContacted ? (
                  <div className="text-xs rounded-md bg-surface border border-border px-3 py-2 text-muted">
                    🚫 L'arbitre n'est pas intéressé pour ce match.
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => contactRef(i, 'home')}>
                      🤫 Corrompre via {home.name}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => contactRef(i, 'away')}>
                      🤫 Corrompre via {away.name}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button onClick={launchAll}>▶ Lancer tous les matchs</Button>

        <AnimatePresence>
          {corruptionModal && (() => {
            const slot = pendingInputs[corruptionModal.slotIdx];
            const teamName = corruptionModal.side === 'home'
              ? slot.input.home.team.name
              : slot.input.away.team.name;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-md rounded-xl border border-border bg-bg shadow-2xl p-6 space-y-4"
                >
                  <div className="text-xs uppercase tracking-widest text-muted">Corruption — {teamName}</div>

                  {corruptionModal.offer ? (
                    <>
                      <div className="rounded-md bg-warning/10 border border-warning/30 p-4 space-y-2">
                        <div className="text-sm italic text-warning">"{corruptionModal.offer.message}"</div>
                        <div className="text-sm font-medium">Montant demandé : <span className="text-warning">{corruptionModal.offer.amount}M€</span></div>
                      </div>
                      <div className="flex gap-3">
                        <Button size="sm" onClick={acceptCorruption}>Accepter le deal</Button>
                        <Button size="sm" variant="ghost" onClick={declineCorruption}>Refuser</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-md bg-surface border border-border p-4">
                        <div className="text-sm text-muted">L'arbitre n'est pas intéressé pour ce match.</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={declineCorruption}>Fermer</Button>
                    </>
                  )}
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>
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

      {!allFinished && slots.some((s) => s.state?.status === 'halftime') && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">⏸ Mi-temps — {slots.filter((s) => s.state?.status === 'halftime').length} match(s) en pause</span>
          <Button size="sm" onClick={() => { resumeAll(); setPaused(false); }}>
            ▶ Reprendre la 2e mi-temps
          </Button>
        </div>
      )}

      {allFinished && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="font-medium">Tous les matchs sont terminés.</span>
          <div className="flex gap-2 flex-wrap">
            {pendingUpdate && (
              <>
                <Button size="sm" onClick={handleSaveLocal}>
                  Enregistrer en local
                </Button>
                <Button size="sm" variant="ghost" onClick={handleSaveGitHub} disabled={savingGh}>
                  {savingGh ? <Spinner className="mr-1 h-3 w-3" /> : null}
                  ↑ GitHub
                </Button>
              </>
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
  const [showStats, setShowStats] = useState(false);
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
    .filter((e) => ['goal', 'yellow', 'red', 'penalty', 'penalty_miss', 'penalty_saved'].includes(e.type))
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
          {slot.leg1Score && (
            <div className="text-[10px] text-muted">
              aller {slot.leg1Score.home}–{slot.leg1Score.away}
              {state && (
                <span className="ml-1 text-accent font-medium">
                  · cumul {slot.leg1Score.home + state.score.home}–{slot.leg1Score.away + state.score.away}
                </span>
              )}
            </div>
          )}
          {state?.penaltyScore && (
            <div className="text-xs text-muted">tab {state.penaltyScore.home}–{state.penaltyScore.away}</div>
          )}
        </div>
        <TeamMini team={away} right />
      </div>

      {/* Mini stats bar */}
      {state && (state.shots.home + state.shots.away) > 0 && (
        <div className="border-t border-border/50 pt-2 space-y-1">
          {!showStats ? (
            <>
              <StatBar label="Possession" home={state.possession.home} away={state.possession.away} percent />
              <StatBar label="Tirs" home={state.shots.home} away={state.shots.away} />
              <StatBar label="Cadrés" home={state.shotsOnTarget.home} away={state.shotsOnTarget.away} />
            </>
          ) : (
            <>
              <StatBar label="Possession" home={state.possession.home} away={state.possession.away} percent />
              <StatBar label="Tirs" home={state.shots.home} away={state.shots.away} />
              <StatBar label="Cadrés" home={state.shotsOnTarget.home} away={state.shotsOnTarget.away} />
              <StatBar label="Arrêts" home={state.saves?.home ?? 0} away={state.saves?.away ?? 0} />
              <StatBar label="Passes" home={state.passes?.home ?? 0} away={state.passes?.away ?? 0} />
              <StatBar label="Fautes" home={state.fouls.home} away={state.fouls.away} />
              <StatBar label="Corners" home={state.corners?.home ?? 0} away={state.corners?.away ?? 0} />
              <StatBar label="Hors-jeu" home={state.offsides?.home ?? 0} away={state.offsides?.away ?? 0} />
              <StatBar label="Passes clés" home={state.keyPasses?.home ?? 0} away={state.keyPasses?.away ?? 0} />
              <StatBar label="Dribbles" home={state.dribbles?.home ?? 0} away={state.dribbles?.away ?? 0} />
              <StatBar label="Dégagements" home={state.clearances?.home ?? 0} away={state.clearances?.away ?? 0} />
              <div className="flex justify-between text-[10px] text-muted pt-0.5">
                <span>🟨 {state.cards.home.yellow.length} / 🟥 {state.cards.home.red.length}</span>
                <span>Cartons</span>
                <span>🟨 {state.cards.away.yellow.length} / 🟥 {state.cards.away.red.length}</span>
              </div>
            </>
          )}
          <button
            onClick={() => setShowStats((v) => !v)}
            className="w-full text-center text-[10px] text-muted/60 hover:text-muted pt-0.5 transition-colors"
          >
            {showStats ? '▲ Moins' : '▼ Toutes les stats'}
          </button>
        </div>
      )}

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
