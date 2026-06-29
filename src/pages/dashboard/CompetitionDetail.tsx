import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { StandingsTable } from '@/components/competition/StandingsTable';
import { BracketView, LPMBracketView } from '@/components/competition/BracketView';
import { CompetitionStats } from '@/components/competition/CompetitionStats';
import { DrawCeremony } from '@/components/competition/DrawCeremony';
import { PreMatchModal } from '@/components/competition/PreMatchModal';
import { useCompetition } from '@/stores/competition';
import { useTeams } from '@/stores/teams';

import { useBackendArgs } from '@/hooks/useBackendArgs';
import { useSession } from '@/stores/session';
import { needsKnockoutDraw, getQualifiersByRank, seedKnockoutWithOrder, sortStandings, seedLPMPlayoffs } from '@/lib/competition/scheduler';
import { LPMDrawCeremony, type LPMPair } from '@/components/competition/LPMDrawCeremony';
import { buildKnockoutPots, conductKnockoutDraw } from '@/lib/competition/draw';
import type { DrawResult } from '@/lib/competition/draw';
import type { Competition, CompMatch, PlayerCompStats, CompetitionKind, CompetitionScope, CompetitionImportance } from '@/lib/competition/types';
import { COMPETITION_KIND_LABEL, COMPETITION_SCOPE_LABEL, COMPETITION_IMPORTANCE_LABEL } from '@/lib/competition/types';
import type { CorruptionDeal } from '@/lib/sim/types';
import type { Team } from '@/lib/types';
import { moraleLabel, MORALE_DEFAULT } from '@/lib/competition/morale';
import type { PressItem, PressMention, PressMentionPlayer, PressMentionCoach } from '@/lib/competition/press';
import { PRESS_CATEGORY_COLOR, PRESS_CATEGORY_LABEL, generateCmfItems } from '@/lib/competition/press';
import { COACH_TRAIT_LABEL, COACH_TRAIT_DESCRIPTION } from '@/lib/gen/coach';
import { PrApiTeamBackend } from '@/lib/prapi/teamBackend';
import { PrApiMatchBackend } from '@/lib/prapi/matchBackend';
import type { Injury, Suspension } from '@/lib/competition/injuries';
import { SEVERITY_COLOR, CAUSE_LABEL } from '@/lib/competition/injuries';
import type { CompHistoryEntry } from '@/lib/competition/types';
import { deriveTeamResult, deriveTeamPhase } from '@/lib/competition/teamResult';
import type { RecentMatchSummary } from '@/lib/github/matches';
import { calcCmfMatchPoints } from '@/lib/github/matches';

export default function CompetitionDetail() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const isPublicView = pathname.startsWith('/competition-view') || pathname.startsWith('/competitions/');
  const backTo = isPublicView ? '/competitions' : '/dashboard/competitions';
  const backLabel = '← Compétitions';
  const load = useCompetition((s) => s.load);
  const save = useCompetition((s) => s.save);
  const remove = useCompetition((s) => s.remove);
  const setCurrent = useCompetition((s) => s.setCurrent);
  const current = useCompetition((s) => s.current);
  const teams = useTeams((s) => s.teams);
  const refreshTeams = useTeams((s) => s.refresh);
  
  const navigate = useNavigate();
  const { ownerId, prApiToken: effectivePat } = useBackendArgs();
  const isAdmin = useSession((s) => s.isAdmin());

  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingMedical, setSyncingMedical] = useState(false);
  const [distributingLpm, setDistributingLpm] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bracket' | 'rounds' | 'stats' | 'presse' | 'morale' | 'medical' | 'suspensions'>('overview');
  const [knockoutDraw, setKnockoutDraw] = useState<DrawResult | null>(null);
  const [lpmDraw, setLpmDraw] = useState<LPMPair[] | null>(null);
  const [roundDraw, setRoundDraw] = useState<{ round: number; pairs: LPMPair[]; isScheduleDraw?: boolean } | null>(null);
  const [preMatchModal, setPreMatchModal] = useState<{ matchId: string; home: Team; away: Team; phase?: string } | null>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }

    async function init() {
      const comp = current?.id === id ? current : await load(id!, '', effectivePat);
      const snapshotIds = new Set(Object.keys(comp?.teamSnapshot ?? {}));
      const allCovered = comp != null && comp.teamIds.every((tid) => snapshotIds.has(tid));
      if (!allCovered && teams.length === 0) {
        await refreshTeams(ownerId, null, effectivePat);
      }
    }

    init().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, effectivePat]);

  // Generate CMF debut articles before round 1 (once per competition, when it becomes ongoing)
  useEffect(() => {
    if (!current || current.cmfDebutGenerated || current.status !== 'ongoing') return;
    // For LPM, wait until draw is revealed
    if (current.format === 'lpm' && !current.drawRevealed) return;
    const firstPhase = current.matches[0]?.phase ?? 'league';
    const cmfDebut = generateCmfItems({
      round: 0,
      seed: `${current.id}-cmf-debut-init`,
      competitionName: current.name,
      format: current.format,
      phase: firstPhase,
      moment: 'debut',
      teamSnapshot: current.teamSnapshot ?? {},
      standings: current.standings,
      playerStats: current.playerStats,
      isFirstDraw: true,
    });
    if (cmfDebut.length === 0) return;
    const updated = {
      ...current,
      cmfDebutGenerated: true,
      pressItems: [...(current.pressItems ?? []), ...cmfDebut],
    };
    setCurrent(updated);
    if (effectivePat) save(updated, '', effectivePat).catch(() => {/* non-blocking */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.status, current?.cmfDebutGenerated, current?.drawRevealed]);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;
  }

  if (!current) {
    return (
      <div className="space-y-4">
        <Link to={backTo} className="text-sm text-muted hover:text-text">{backLabel}</Link>
        <p className="text-muted">Compétition introuvable.</p>
        {isAdmin && effectivePat && id && (
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              try {
                await remove(id, '', effectivePat);
                navigate(backTo);
              } catch (err) {
                toast('error', String(err));
              }
            }}
          >
            Retirer de l'index
          </Button>
        )}
      </div>
    );
  }

  const teamMap: Record<string, Team> = {};
  for (const t of teams) teamMap[t.id] = t;
  // Fallback for non-admin viewers who have no PAT: use snapshot stored in competition
  if (current.teamSnapshot) {
    for (const [id, snap] of Object.entries(current.teamSnapshot)) {
      if (!teamMap[id]) {
        teamMap[id] = { id, name: snap.name, flag: snap.flag } as Team;
      }
    }
  }

  const isGroupsKO = current.format === 'groups_knockout';
  const isLeague = current.format === 'league';
  const isLPM = current.format === 'lpm';

  const allStandings = Object.values(current.standings);

  async function ensureTeams() {
    if (teams.length === 0) await refreshTeams(ownerId, null, effectivePat);
  }

  function teamBackend() {
    return new PrApiTeamBackend(effectivePat ?? '');
  }



  async function handlePatchSnapshot() {
    if (!effectivePat || !current) return;
    await ensureTeams();
    const snapshot: Record<string, { name: string; flag: string; slug?: string }> = {};
    for (const id of current.teamIds) {
      const t = teams.find((x) => x.id === id);
      if (t) snapshot[id] = { name: t.name, flag: t.flag, slug: t.slug };
    }
    if (Object.keys(snapshot).length === 0) {
      toast('error', 'Aucune équipe chargée — impossible de réparer.');
      return;
    }
    const updated = { ...current, teamSnapshot: snapshot };
    setCurrent(updated);
    setSyncing(true);
    try {
      await save(updated, '', effectivePat);
      toast('success', 'Noms et drapeaux mis à jour en DB.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncMedical() {
    if (!effectivePat || !current) return;
    setSyncingMedical(true);
    try {
      const teamSnap = current.teamSnapshot ?? {};
      const backend = teamBackend();
      const injuries = current.injuries ?? [];
      const suspensions = current.suspensions ?? [];

      const slugToTid: Record<string, string> = {};
      const slugs: string[] = [];
      for (const tid of current.teamIds) {
        const slug = teamSnap[tid]?.slug;
        if (slug) { slugs.push(slug); slugToTid[slug] = tid; }
      }
      const bulk = await backend.bulkTeams(slugs);
      const bySlug = new Map(bulk.map((r) => [r.team.slug, r]));

      const medicalTasks = slugs.map((slug) => async () => {
        const res = bySlug.get(slug);
        if (!res) return;
        const tid = slugToTid[slug];
        const teamInjuries = injuries.filter((i) => i.teamId === tid);
        const teamSuspensions = suspensions.filter((s) => s.teamId === tid);
        await backend.saveTeam(
          { ...res.team, injuries: teamInjuries, suspensions: teamSuspensions },
          res.players,
        );
      });
      for (let i = 0; i < medicalTasks.length; i += 5) {
        await Promise.all(medicalTasks.slice(i, i + 5).map((fn) => fn()));
      }
      toast('success', 'État médical synchronisé en DB.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSyncingMedical(false);
    }
  }

  async function handleDistributeLpmZone() {
    if (!effectivePat || !current || current.format !== 'lpm') return;
    setDistributingLpm(true);
    try {
      const { sortStandings } = await import('@/lib/competition/scheduler');
      const snapshot = current.teamSnapshot ?? {};
      const backend = teamBackend();

      const sorted = sortStandings(Object.values(current.standings));
      const ranks: Record<string, number> = {};
      sorted.forEach((s, i) => { ranks[s.teamId] = i + 1; });

      const playoffQualifiedIds = new Set<string>();
      for (const m of current.matches) {
        if (m.phase !== 'lpm_playoff' || m.status !== 'completed' || !m.result) continue;
        const homeWon = m.result.home > m.result.away || (m.result.penalties && m.result.penalties.home > m.result.penalties.away);
        if (homeWon && m.homeTeamId) playoffQualifiedIds.add(m.homeTeamId);
        else if (!homeWon && m.awayTeamId) playoffQualifiedIds.add(m.awayTeamId);
      }

      // LPM zone points: 3 zones (Rouge top5, Orange mid, Verte bottom)
      const LPM_ZONE_POINTS: Record<string, number> = {};
      sorted.forEach((s, i) => {
        const rank = i + 1;
        LPM_ZONE_POINTS[s.teamId] = rank <= 5 ? 3 : rank <= 10 ? 1 : 0;
        if (playoffQualifiedIds.has(s.teamId)) LPM_ZONE_POINTS[s.teamId] += 2;
      });

      let distributed = 0;
      let skipped = 0;
      const slugToTidLpm: Record<string, string> = {};
      const slugsLpm: string[] = [];
      for (const tid of current.teamIds) {
        const slug = snapshot[tid]?.slug;
        if (slug) { slugsLpm.push(slug); slugToTidLpm[slug] = tid; }
        else skipped++;
      }
      const bulkLpm = await backend.bulkTeams(slugsLpm);
      const bySlugLpm = new Map(bulkLpm.map((r) => [r.team.slug, r]));

      const lpmTasks = slugsLpm.map((slug) => async () => {
        const res = bySlugLpm.get(slug);
        if (!res) { skipped++; return; }
        const tid = slugToTidLpm[slug];
        const pts = LPM_ZONE_POINTS[tid] ?? 0;
        if (pts === 0) { skipped++; return; }
        const bonusEntry: import('@/lib/github/matches').RecentMatchSummary = {
          matchId: `lpm-zone-${current.id}-${tid}`,
          playedAt: new Date().toISOString(),
          opponentSlug: '',
          opponentName: `LPM — Bonus zone (${current.name})`,
          homeAway: 'home',
          scoreFor: 0,
          scoreAgainst: 0,
          cmfPoints: pts,
          compKind: current.kind,
        };
        const recentMatches = [...(res.team.recentMatches ?? []), bonusEntry].slice(-20);
        await backend.saveTeam({ ...res.team, recentMatches }, res.players);
        distributed++;
      });
      for (let i = 0; i < lpmTasks.length; i += 5) {
        await Promise.all(lpmTasks.slice(i, i + 5).map((fn) => fn()));
      }
      toast('success', `Points CMF LPM distribués : ${distributed} équipes mises à jour, ${skipped} ignorées.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setDistributingLpm(false);
    }
  }

  async function handleSave() {
    if (!effectivePat || !current) return;
    setSaving(true);
    try {
      await save(current, '', effectivePat);

      if (current.status === 'completed') {
        const teamSnap = current.teamSnapshot ?? {};
        const backend = new PrApiTeamBackend(effectivePat);

        const slugToTidSave: Record<string, string> = {};
        const slugsSave: string[] = [];
        for (const tid of current.teamIds) {
          const slug = teamSnap[tid]?.slug;
          if (slug) { slugsSave.push(slug); slugToTidSave[slug] = tid; }
        }
        const bulkSave = await backend.bulkTeams(slugsSave);
        const bySlugSave = new Map(bulkSave.map((r) => [r.team.slug, r]));

        // Update compHistory + recentMatches on every team
        const saveTasks = slugsSave.map((slug) => async () => {
          const tid = slugToTidSave[slug];
          const res = bySlugSave.get(slug);
          if (!res) return;

          // compHistory
          const prev = res.team.compHistory ?? [];
          const idx = prev.findIndex((e) => e.compId === current.id);
          const entry: CompHistoryEntry = {
            compId: current.id,
            compName: current.name,
            year: current.year,
            format: current.format,
            kind: current.kind,
            scope: current.scope,
            importance: current.importance,
            result: deriveTeamResult(tid, current),
            phase: deriveTeamPhase(tid, current),
            participantCount: current.teamIds.length,
          };
          const nextHistory = idx >= 0
            ? prev.map((e, i) => i === idx ? entry : e)
            : [...prev, entry];

          // recentMatches — rebuild from all completed matches in competition
          const existingOther = (res.team.recentMatches ?? []).filter(
            (r) => !current.matches.some((m) => m.id === r.matchId),
          );
          const newEntries: RecentMatchSummary[] = [];
          for (const m of current.matches) {
            if (m.status !== 'completed' || !m.result) continue;
            if (m.homeTeamId !== tid && m.awayTeamId !== tid) continue;
            const isHome = m.homeTeamId === tid;
            const oppId = isHome ? m.awayTeamId! : m.homeTeamId!;
            const oppSnap = teamSnap[oppId];
            const oppStrength = (oppSnap as any)?.globalStrength ?? 50;
            const scoreFor = isHome ? m.result.home : m.result.away;
            const scoreAgainst = isHome ? m.result.away : m.result.home;
            const myGoals = isHome ? (m.matchSummary?.homeGoals ?? []) : (m.matchSummary?.awayGoals ?? []);
            newEntries.push({
              matchId: m.id,
              playedAt: m.simulatedAt ?? new Date().toISOString(),
              opponentSlug: oppSnap?.slug ?? '',
              opponentName: oppSnap?.name ?? '',
              homeAway: isHome ? 'home' : 'away',
              homeTeamId: m.homeTeamId!,
              awayTeamId: m.awayTeamId!,
              scoreFor,
              scoreAgainst,
              opponentStrength: oppStrength,
              compKind: current.kind,
              compScope: current.scope,
              compImportance: current.importance,
              participantCount: current.teamIds.length,
              scorers: myGoals.length ? myGoals : undefined,
              cmfPoints: calcCmfMatchPoints({ scoreFor, scoreAgainst, opponentStrength: oppStrength, compKind: current.kind, compScope: current.scope, compImportance: current.importance, participantCount: current.teamIds.length }),
            });
          }
          const mergedRecent = [...existingOther, ...newEntries].slice(-20);

          // injuries/suspensions from competition state
          const teamInjuries = (current.injuries ?? []).filter((i) => i.teamId === tid);
          const teamSuspensions = (current.suspensions ?? []).filter((s) => s.teamId === tid);

          await backend.saveTeam(
            { ...res.team, compHistory: nextHistory, recentMatches: mergedRecent, injuries: teamInjuries, suspensions: teamSuspensions },
            res.players,
          );
        });
        for (let i = 0; i < saveTasks.length; i += 5) {
          await Promise.all(saveTasks.slice(i, i + 5).map((fn) => fn()));
        }
      }

      toast('success', 'Compétition sauvegardée.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!effectivePat || !current) return;
    if (!confirm(`Supprimer « ${current.name} » ? Cette action est irréversible.`)) return;
    setDeleting(true);
    try {
      const matchIds = new Set(current.matches.map((m) => m.id).filter(Boolean) as string[]);
      const matchBk = new PrApiMatchBackend(effectivePat);
      const teamBk = new PrApiTeamBackend(effectivePat);
      const teamSnap = current.teamSnapshot ?? {};

      // Remove competition match entries from recentMatches of all participant teams
      await Promise.all(
        current.teamIds.map(async (tid) => {
          const slug = teamSnap[tid]?.slug;
          if (!slug) return;
          const res = await teamBk.loadTeam(slug, '');
          if (!res) return;
          const filtered = (res.team.recentMatches ?? []).filter((r) => !matchIds.has(r.matchId));
          if (filtered.length !== (res.team.recentMatches ?? []).length) {
            await teamBk.saveTeam({ ...res.team, recentMatches: filtered }, res.players);
          }
        }),
      );

      await Promise.all([
        matchBk.deleteMatchesBulk([...matchIds]),
        remove(current.id, '', effectivePat),
      ]);
      navigate(backTo);
    } catch (err) {
      toast('error', String(err));
      setDeleting(false);
    }
  }

  const currentRound = current.currentRound;

  const showKnockoutDraw = isAdmin
    && isGroupsKO
    && current.groups
    && needsKnockoutDraw(current.matches)
    && !knockoutDraw;

  // LPM: barrages à seeder quand les 11 journées sont terminées et les slots sont encore TBD
  const lpmLeagueMatches = isLPM ? current.matches.filter((m) => m.phase === 'league') : [];
  const lpmPlayoffMatches = isLPM ? current.matches.filter((m) => m.phase === 'lpm_playoff') : [];
  const showLPMPlayoffSeed = isAdmin && isLPM
    && lpmLeagueMatches.length > 0
    && lpmLeagueMatches.every((m) => m.status === 'completed')
    && lpmPlayoffMatches.some((m) => m.homeTeamId === null && !m.homeFromMatch);

  function seedLPMBarrages() {
    if (!current) return;
    const standings = sortStandings(Object.values(current.standings));
    // Compute pairs for the draw ceremony (same logic as seedLPMPlayoffs)
    const hostRank = current.hostTeamId
      ? standings.findIndex((s) => s.teamId === current.hostTeamId)
      : -1;
    let playoffZone = standings.slice(24, 40).map((s) => s.teamId);
    if (current.hostTeamId && hostRank >= 24 && hostRank <= 39) {
      const hostPosInZone = hostRank - 24;
      playoffZone = [
        ...playoffZone.slice(0, hostPosInZone),
        standings[40]?.teamId ?? '',
        ...playoffZone.slice(hostPosInZone + 1),
      ].filter(Boolean);
    }
    const pairs: LPMPair[] = Array.from({ length: 8 }, (_, i) => ({
      home: playoffZone[15 - i], // lower seed (40e→33e) reçoit à l'aller
      away: playoffZone[i],      // higher seed (25e→32e) reçoit au retour
    }));
    setLpmDraw(pairs);
  }

  function confirmLPMDraw() {
    if (!current || !lpmDraw) return;
    const standings = sortStandings(Object.values(current.standings));
    const updatedMatches = seedLPMPlayoffs(current.matches, standings, current.hostTeamId);
    const updated: Competition = { ...current, matches: updatedMatches };
    setCurrent(updated);
    setLpmDraw(null);
    if (effectivePat) save(updated, '', effectivePat).catch(() => {});
    toast('success', 'Barrages LPM générés.');
  }

  function startKnockoutDraw() {
    if (!current || !current.groups || !current.config.qualifyPerGroup) return;
    const byRank = getQualifiersByRank(current.groups, current.standings, current.config.qualifyPerGroup);
    // Append best thirds as an extra pot if configured
    const bestThirds = current.config.bestThirds ?? 0;
    if (bestThirds > 0) {
      const thirds: import('@/lib/competition/types').Standing[] = [];
      for (const group of current.groups) {
        const sorted = sortStandings(group.teamIds.map((id) => current.standings[id]).filter(Boolean));
        if (sorted[current.config.qualifyPerGroup]) thirds.push(sorted[current.config.qualifyPerGroup]);
      }
      const bestThirdTeams = sortStandings(thirds).slice(0, bestThirds).map((s) => s.teamId);
      byRank.push(bestThirdTeams);
    }
    const pots = buildKnockoutPots(byRank);
    const result = conductKnockoutDraw(pots, byRank);
    setKnockoutDraw(result);
  }

  function confirmKnockoutDraw(groups: Record<string, string[]>) {
    if (!current) return;
    const orderedQualifiers = Object.values(groups).flat();
    const updatedMatches = seedKnockoutWithOrder(current.matches, orderedQualifiers);
    const updated: Competition = { ...current, matches: updatedMatches };
    setCurrent(updated);
    setKnockoutDraw(null);
    if (effectivePat) save(updated, '', effectivePat).catch(() => {});
    toast('success', 'Tirage phase finale effectué.');
  }

  function openMatchModal(matchId: string) {
    if (!current) return;
    const m = current.matches.find((x) => x.id === matchId);
    if (!m?.homeTeamId || !m?.awayTeamId) return;
    const home = teamMap[m.homeTeamId];
    const away = teamMap[m.awayTeamId];
    if (!home || !away) return;
    setPreMatchModal({ matchId, home, away, phase: m.phase });
  }

  function launchMatch(matchId: string, corruption: CorruptionDeal | null, tactics?: { homeId?: string; awayId?: string }, countForStats?: boolean) {
    if (!current) return;
    if (corruption) {
      sessionStorage.setItem(`footsim.corruption.${matchId}`, JSON.stringify(corruption));
    } else {
      sessionStorage.removeItem(`footsim.corruption.${matchId}`);
    }
    if (tactics?.homeId || tactics?.awayId) {
      sessionStorage.setItem(`footsim.tactics.${matchId}`, JSON.stringify({ homeId: tactics.homeId, awayId: tactics.awayId }));
    } else {
      sessionStorage.removeItem(`footsim.tactics.${matchId}`);
    }
    sessionStorage.setItem(`footsim.countForStats.${matchId}`, JSON.stringify(countForStats ?? true));
    setPreMatchModal(null);
    navigate(`/competition/${current.id}/match/${matchId}`);
  }

  async function simulateRound(round: number) {
    if (!effectivePat || !current) return;
    const roundMatches = current.matches.filter(
      (m) => m.round === round && m.status === 'pending' && m.homeTeamId && m.awayTeamId,
    );
    if (roundMatches.length === 0) return;

    if (roundMatches.length === 1) {
      openMatchModal(roundMatches[0].id);
    } else {
      navigate(`/competition/${current.id}/round/${round}`);
    }
  }

  if (roundDraw) {
    const allTeams = [...teams, ...Object.entries(current.teamSnapshot ?? {}).map(([id, s]) => ({ id, name: s.name, flag: s.flag } as Team))];
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          {roundDraw.isScheduleDraw
            ? <Link to={backTo} className="text-sm text-muted hover:text-text">{backLabel}</Link>
            : <button onClick={() => setRoundDraw(null)} className="text-sm text-muted hover:text-text">← Retour</button>
          }
          <h1 className="mt-2 font-display text-4xl">
            {roundDraw.isScheduleDraw ? 'Tirage du calendrier LPM' : `Tirage — Journée ${roundDraw.round}`}
          </h1>
          <p className="text-muted text-sm mt-1">
            {current.name} · {roundDraw.isScheduleDraw ? `${roundDraw.pairs.length} matchs au total` : `${roundDraw.pairs.length} matchs`}
          </p>
        </div>
        <LPMDrawCeremony
          pairs={roundDraw.pairs}
          teams={allTeams}
          title={roundDraw.isScheduleDraw ? 'Calendrier complet' : `Journée ${roundDraw.round}`}
          subtitle={roundDraw.isScheduleDraw ? 'Tous les matchs de la phase de ligue' : 'Confrontations de la journée'}
          pairLabels={roundDraw.isScheduleDraw
            ? (i) => {
                const m = current.matches.filter((x) => x.phase === 'league' && x.homeTeamId && x.awayTeamId)[i];
                return m ? `J${m.round} · M${i + 1}` : `M${i + 1}`;
              }
            : (i) => `Match ${i + 1}`}
          onConfirm={async () => {
            const round = roundDraw.round;
            const isScheduleDraw = roundDraw.isScheduleDraw;
            setRoundDraw(null);
            if (isScheduleDraw && effectivePat) {
              const updated = { ...current, drawRevealed: true };
              setCurrent(updated);
              try { await save(updated, '', effectivePat); } catch { /* non-blocking */ }
              // stay on page — no navigate
            } else {
              navigate(`/competition/${current.id}/round/${round}`);
            }
          }}
        />
      </div>
    );
  }

  if (lpmDraw) {
    const allTeams = [...teams, ...Object.entries(current.teamSnapshot ?? {}).map(([id, s]) => ({ id, name: s.name, flag: s.flag } as Team))];
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <Link to={backTo} className="text-sm text-muted hover:text-text">{backLabel}</Link>
          <h1 className="mt-2 font-display text-4xl">Tirage — Barrages A/R</h1>
          <p className="text-muted text-sm mt-1">{current.name}</p>
        </div>
        <LPMDrawCeremony
          pairs={lpmDraw}
          teams={allTeams}
          title="Barrages A/R — 8 confrontations"
          subtitle="Places 25–40 · Aller-Retour · Les vainqueurs décrochent les derniers tickets"
          pairLabels={(i) => `Match ${'ABCDEFGH'[i]}`}
          onConfirm={confirmLPMDraw}
        />
      </div>
    );
  }

  if (knockoutDraw) {
    const qualifiedIds = new Set(Object.values(knockoutDraw.groups).flat());
    const allQualifiedTeams = Object.values(teamMap).filter((t) => qualifiedIds.has(t.id));
    return (
      <div className="space-y-6">
        <div>
          <Link to={backTo} className="text-sm text-muted hover:text-text">{backLabel}</Link>
          <h1 className="mt-2 font-display text-4xl">Tirage — Phase finale</h1>
          <p className="text-muted text-sm mt-1">{current.name}</p>
        </div>
        <DrawCeremony
          result={knockoutDraw}
          teams={allQualifiedTeams}
          groupCount={Object.keys(knockoutDraw.groups).length}
          onConfirm={confirmKnockoutDraw}
          knockoutMode
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={backTo} className="text-sm text-muted hover:text-text">{backLabel}</Link>
          <h1 className="mt-2 font-display text-4xl">{current.name}</h1>
          <p className="text-muted text-sm mt-1 flex items-center gap-2 flex-wrap">
            <span>
              {current.format === 'league' ? 'Championnat'
                : current.format === 'cup' ? 'Coupe'
                : current.format === 'lpm' ? 'LPM'
                : 'Groupes + Phase finale'}
              {' · '}
              {current.teamIds.length} équipes
            </span>
            {current.kind && (
              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                current.kind === 'officielle'
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'bg-muted/10 text-muted border-border'
              }`}>
                {COMPETITION_KIND_LABEL[current.kind]}
              </span>
            )}
            {current.scope && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border bg-surface text-muted border-border">
                {COMPETITION_SCOPE_LABEL[current.scope]}
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap justify-end">
            {isLPM && !current.drawRevealed && (
              <Button
                size="sm"
                onClick={() => {
                  const allLeague = current.matches.filter(
                    (m) => m.phase === 'league' && m.homeTeamId && m.awayTeamId,
                  );
                  const pairs: LPMPair[] = allLeague.map((m) => ({ home: m.homeTeamId!, away: m.awayTeamId! }));
                  setRoundDraw({ round: 0, pairs, isScheduleDraw: true });
                }}
              >
                🎲 Tirage du calendrier
              </Button>
            )}
            {!current.teamSnapshot && (
              <Button size="sm" variant="ghost" onClick={handlePatchSnapshot} disabled={syncing}>
                🔧 Réparer noms
              </Button>
            )}
            {isLPM && current.status === 'completed' && (
              <Button size="sm" variant="ghost" onClick={handleDistributeLpmZone} disabled={distributingLpm}>
                {distributingLpm ? <Spinner className="h-4 w-4" /> : '★ Points CMF LPM'}
              </Button>
            )}
            {current.status !== 'completed' && (
              <Button
                size="sm"
                onClick={async () => simulateRound(currentRound)}
                disabled={!current.matches.some(
                  (m) => m.round === currentRound && m.status === 'pending' && m.homeTeamId && m.awayTeamId,
                )}
              >
                ▶ Journée {currentRound}
              </Button>
            )}
            {current.status !== 'completed' && (isLeague || isLPM) && current.matches.some((m) => m.status === 'pending' && m.phase === 'league') && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  sessionStorage.setItem('footsim.autoSimulate', '1');
                  navigate(`/competition/${current.id}/round/${currentRound}`);
                }}
              >
                ⚡ Simuler tout
              </Button>
            )}
            {(current.status === 'ongoing' || current.status === 'completed') && (
              <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner className="h-4 w-4" /> : 'Sauvegarde'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Spinner className="h-4 w-4" /> : 'Supprimer'}
            </Button>
          </div>
        )}
      </div>

      {current.status === 'completed' && isAdmin && (
        <CompletedMetaEditor current={current} setCurrent={setCurrent} />
      )}

      {current.status === 'ongoing' && isAdmin && (
        <OngoingSettingsPanel current={current} setCurrent={setCurrent} teamMap={teamMap} />
      )}

      {current.status === 'completed' && current.winner && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-5 space-y-4">
          <div className="text-center space-y-2">
            <div className="text-xs uppercase tracking-widest text-muted">Vainqueur</div>
            <div className="flex items-center justify-center gap-3">
              {teamMap[current.winner]?.flag && (
                <img src={teamMap[current.winner].flag} alt="" className="h-12 w-12 object-cover rounded" />
              )}
              <div className="font-display text-3xl">{teamMap[current.winner]?.name ?? current.winner}</div>
            </div>
          </div>
          {current.awards && (
            <div className="border-t border-warning/20 pt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AwardCard
                emoji="⚽"
                label="Meilleur buteur"
                stats={current.awards.topScorer ? current.playerStats?.[current.awards.topScorer] : null}
              />
              <AwardCard
                emoji="🎯"
                label="Meilleur passeur"
                stats={current.awards.topAssister ? current.playerStats?.[current.awards.topAssister] : null}
              />
              <AwardCard
                emoji="🧤"
                label="Meilleur gardien"
                stats={current.awards.bestGK ? current.playerStats?.[current.awards.bestGK] : null}
              />
              <AwardCard
                emoji="🏆"
                label="Meilleur joueur"
                stats={current.awards.bestPlayer ? current.playerStats?.[current.awards.bestPlayer] : null}
                showRating
              />
            </div>
          )}
        </div>
      )}

      {showKnockoutDraw && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Phase de groupes terminée !</div>
            <div className="text-sm text-muted">Lance le tirage au sort pour désigner les confrontations de la phase finale.</div>
          </div>
          <Button size="sm" onClick={startKnockoutDraw}>
            🎰 Tirage phase finale
          </Button>
        </div>
      )}

      {showLPMPlayoffSeed && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">11 journées terminées — Barrages A/R</div>
            <div className="text-sm text-muted">Places 25–40 : génère les 8 confrontations aller-retour pour les derniers tickets.</div>
          </div>
          <Button size="sm" onClick={seedLPMBarrages}>
            ⚔ Lancer les barrages
          </Button>
        </div>
      )}

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(['overview', 'bracket', 'rounds', 'stats', 'presse', 'morale', 'medical', 'suspensions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {tab === 'overview' ? 'Classement'
              : tab === 'bracket' ? 'Tableau'
              : tab === 'rounds' ? 'Journées'
              : tab === 'stats' ? 'Statistiques individuelles'
              : tab === 'presse' ? 'Presse'
              : tab === 'morale' ? 'Moral'
              : tab === 'medical' ? 'Médical'
              : 'Suspensions'}
            {tab === 'presse' && (current.pressItems?.length ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{current.pressItems!.length}</span>
            )}
            {tab === 'medical' && (current.injuries?.length ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-danger/20 px-1.5 text-[10px] text-danger">
                {current.injuries!.length}
              </span>
            )}
            {tab === 'suspensions' && (current.suspensions?.length ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-warning/20 px-1.5 text-[10px] text-warning">
                {current.suspensions!.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {isLeague && (
                <StandingsTable standings={allStandings} teams={teamMap} />
              )}
              {isLPM && (
                <LPMStandingsView standings={allStandings} teams={teamMap} hostTeamId={current.hostTeamId} playoffMatches={lpmPlayoffMatches} />
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
              {!isLeague && !isGroupsKO && !isLPM && (
                <p className="text-muted text-sm">Format coupe — pas de classement général.</p>
              )}
            </div>
          )}

          {activeTab === 'bracket' && (
            <div className="space-y-4">
              {isLeague ? (
                <p className="text-muted text-sm">Format ligue — utilise l'onglet Journées.</p>
              ) : isLPM ? (
                lpmPlayoffMatches.length > 0 && lpmPlayoffMatches.some((m) => m.homeTeamId) ? (
                  <LPMBracketView
                    matches={lpmPlayoffMatches}
                    teams={teamMap}
                    onSimulate={isAdmin ? openMatchModal : undefined}
                  />
                ) : (
                  <p className="text-muted text-sm">Les barrages seront disponibles après les 11 journées.</p>
                )
              ) : (
                <BracketView
                  matches={current.matches.filter((m) => m.phase !== 'group')}
                  teams={teamMap}
                  onSimulate={isAdmin ? openMatchModal : undefined}
                />
              )}
            </div>
          )}

          {activeTab === 'rounds' && (
            <RoundsView
              competition={current}
              teamMap={teamMap}
              canSimulate={isAdmin}
              onSimulateRound={simulateRound}
              onSimulateMatch={openMatchModal}
            />
          )}

          {activeTab === 'stats' && (
            <CompetitionStats
              playerStats={current.playerStats ?? {}}
              teams={teamMap}
              injuries={current.injuries ?? []}
              suspensions={current.suspensions ?? []}
            />
          )}

          {activeTab === 'presse' && (
            <PressTab
              pressItems={current.pressItems ?? []}
              teamMap={teamMap}
              teamIds={current.teamIds}
              playerStats={current.playerStats ?? {}}
              injuries={current.injuries ?? []}
              suspensions={current.suspensions ?? []}
            />
          )}

          {activeTab === 'morale' && (
            <MoraleTab
              morale={current.morale ?? {}}
              teamMap={teamMap}
              teamIds={current.teamIds}
            />
          )}

          {activeTab === 'medical' && (
            <div className="space-y-4">
              {(current.status === 'completed' || current.status === 'ongoing') && isAdmin && effectivePat && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                  <span className="text-xs text-muted">Synchroniser l'état médical sur les fiches équipes (blessés restants après cette compétition)</span>
                  <Button size="sm" variant="ghost" onClick={handleSyncMedical} disabled={syncingMedical}>
                    {syncingMedical ? <Spinner className="mr-2 h-3 w-3" /> : null}
                    Resync médical
                  </Button>
                </div>
              )}
              <MedicalTab
                injuries={current.injuries ?? []}
                teamMap={teamMap}
                playerStats={current.playerStats ?? {}}
              />
            </div>
          )}

          {activeTab === 'suspensions' && (
            <SuspensionsTab
              suspensions={current.suspensions ?? []}
              teamMap={teamMap}
              playerStats={current.playerStats ?? {}}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {preMatchModal && (
        <PreMatchModal
          home={preMatchModal.home}
          away={preMatchModal.away}
          defaultCountForStats={preMatchModal.phase !== '3rd'}
          onConfirm={(corruption, tactics, countForStats) => launchMatch(preMatchModal.matchId, corruption, tactics, countForStats)}
          onCancel={() => setPreMatchModal(null)}
        />
      )}
    </div>
  );
}


function RoundsView({
  competition,
  teamMap,
  canSimulate,
  onSimulateRound,
  onSimulateMatch,
}: {
  competition: Competition;
  teamMap: Record<string, Team>;
  canSimulate: boolean;
  onSimulateRound: (round: number) => void;
  onSimulateMatch: (matchId: string) => void;
}) {
  const rounds = Array.from(new Set(competition.matches.map((m) => m.round))).sort((a, b) => a - b);
  const currentRound = competition.currentRound;
  const [openRounds, setOpenRounds] = useState<Set<number>>(() => new Set([currentRound]));

  function toggleRound(r: number) {
    setOpenRounds((prev) => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {rounds.map((round) => {
        const roundMatches = competition.matches.filter((m) => m.round === round);
        const completed = roundMatches.filter((m) => m.status === 'completed').length;
        const total = roundMatches.length;
        const hasPending = roundMatches.some((m) => m.status === 'pending' && m.homeTeamId && m.awayTeamId);
        const canMultiplex = canSimulate && hasPending && roundMatches.filter((m) => m.homeTeamId && m.awayTeamId).length > 1;
        const isOpen = openRounds.has(round);
        const isCurrent = round === currentRound;

        const phase = roundMatches[0]?.phase;
        const label =
          competition.format === 'league' || (competition.format === 'lpm' && phase === 'league')
            ? `Journée ${round}`
            : competition.format === 'lpm' && phase === 'lpm_playoff'
            ? (roundMatches[0]?.leg === 1 ? 'Barrages · Aller' : 'Barrages · Retour')
            : phase === 'group'
            ? `Poules — J${round}`
            : (() => {
                const KO_LABEL: Record<string, string> = { R64: '32èmes', R32: '16èmes', R16: '8èmes', QF: 'Quarts', SF: 'Demies', '3rd': '3ème place', F: 'Finale' };
                const koMatch = phase?.match(/^KO(\d+)$/);
                if (koMatch) return `Tour final (${koMatch[1]} matchs)`;
                return KO_LABEL[phase ?? ''] ?? `Tour ${round}${phase ? ` · ${phase}` : ''}`;
              })();

        const allDone = completed === total;

        return (
          <div
            key={round}
            className={`rounded-lg border overflow-hidden transition-colors ${
              isCurrent && !allDone
                ? 'border-accent/40'
                : allDone
                ? 'border-border/50'
                : 'border-border'
            } bg-surface`}
          >
            {/* Round header */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left select-none hover:bg-border/10 transition-colors"
              onClick={() => toggleRound(round)}
            >
              {/* Status dot */}
              <span className={`h-2 w-2 rounded-full shrink-0 ${
                allDone ? 'bg-green-500' : isCurrent ? 'bg-accent animate-pulse' : 'bg-border'
              }`} />

              <span className={`text-sm font-semibold flex-1 ${isCurrent && !allDone ? 'text-accent' : allDone ? 'text-muted' : ''}`}>
                {label}
              </span>

              <span className="text-xs tabular-nums shrink-0">
                {allDone
                  ? <span className="text-green-500/80 font-medium">✓ {total} matchs</span>
                  : <span className="text-muted">{completed}<span className="text-muted/40">/{total}</span></span>
                }
              </span>

              {canMultiplex && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSimulateRound(round); }}
                  className="shrink-0 text-xs font-medium text-accent hover:text-accent/70 border border-accent/30 rounded px-2 py-0.5 transition-colors"
                >
                  ▶ Multiplex
                </button>
              )}

              <span className="text-xs text-muted/30 shrink-0">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Match list */}
            {isOpen && (
              <div className="border-t border-border/40">
                {roundMatches.map((m, idx) => (
                  <div key={m.id} className={idx > 0 ? 'border-t border-border/20' : ''}>
                    <RoundMatchRow
                      match={m}
                      teamMap={teamMap}
                      canSimulate={canSimulate}
                      onSimulate={() => onSimulateMatch(m.id)}
                      disqualifiedTeamIds={competition.disqualifiedTeamIds ?? []}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RoundMatchRow({
  match,
  teamMap,
  canSimulate,
  onSimulate,
  disqualifiedTeamIds = [],
}: {
  match: CompMatch;
  teamMap: Record<string, Team>;
  canSimulate: boolean;
  onSimulate: () => void;
  disqualifiedTeamIds?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const home = match.homeTeamId ? teamMap[match.homeTeamId] : null;
  const away = match.awayTeamId ? teamMap[match.awayTeamId] : null;
  const done = match.status === 'completed';
  const homeDisq = !!match.homeTeamId && disqualifiedTeamIds.includes(match.homeTeamId);
  const awayDisq = !!match.awayTeamId && disqualifiedTeamIds.includes(match.awayTeamId);
  const isWalkover = homeDisq || awayDisq;
  const canSim = canSimulate && !done && match.homeTeamId && match.awayTeamId && !isWalkover;
  const hasSummary = done && !!match.matchSummary;

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${hasSummary ? 'cursor-pointer hover:bg-border/10' : ''}`}
        onClick={() => hasSummary && setExpanded((v) => !v)}
      >
        {/* Home */}
        <div className="flex flex-1 items-center gap-2 min-w-0 justify-end">
          <span className={`truncate text-right text-[13px] ${homeDisq ? 'line-through text-muted' : done ? 'text-text' : 'font-medium'}`}>
            {home?.name ?? (match.homeTeamId ? '…' : 'À définir')}
          </span>
          {home?.flag
            ? <img src={home.flag} alt="" className={`h-6 w-6 rounded-sm object-cover shrink-0 ${homeDisq ? 'opacity-30' : ''}`} />
            : <div className="h-6 w-6 rounded-sm bg-border/40 shrink-0" />}
        </div>

        {/* Score / status */}
        <div className="shrink-0 w-24 text-center font-display tabular-nums">
          {isWalkover ? (
            <span className="text-[10px] font-medium text-green-500 uppercase tracking-wider">Forfait</span>
          ) : done && match.result ? (
            <div>
              <span className="text-base font-bold">
                <span className={match.result.home > match.result.away ? 'text-text' : 'text-muted'}>
                  {match.result.home}
                </span>
                <span className="text-muted/50 mx-1 font-normal">–</span>
                <span className={match.result.away > match.result.home ? 'text-text' : 'text-muted'}>
                  {match.result.away}
                </span>
              </span>
              {match.result.penalties && (
                <div className="text-[10px] text-muted font-normal leading-tight">
                  {match.result.penalties.home}–{match.result.penalties.away} tab
                </div>
              )}
            </div>
          ) : canSim ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSimulate(); }}
              className="text-accent hover:text-accent/70 transition-colors text-xs font-medium border border-accent/30 rounded px-2 py-0.5"
            >
              ▶ Jouer
            </button>
          ) : (
            <span className="text-muted/30 text-sm">·</span>
          )}
        </div>

        {/* Away */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {away?.flag
            ? <img src={away.flag} alt="" className={`h-6 w-6 rounded-sm object-cover shrink-0 ${awayDisq ? 'opacity-30' : ''}`} />
            : <div className="h-6 w-6 rounded-sm bg-border/40 shrink-0" />}
          <span className={`truncate text-[13px] ${awayDisq ? 'line-through text-muted' : done ? 'text-text' : 'font-medium'}`}>
            {away?.name ?? (match.awayTeamId ? '…' : 'À définir')}
          </span>
        </div>

        {hasSummary && (
          <span className="text-[10px] text-muted/30 shrink-0">{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {expanded && match.matchSummary && (
        <div className="border-t border-border/20 bg-bg/60 px-6 py-5 space-y-5">
          {match.matchSummary.motm && (
            <div className="flex items-center gap-3 rounded-lg bg-warning/5 border border-warning/20 px-4 py-3">
              <span className="text-lg shrink-0">⭐</span>
              <div className="min-w-0">
                <div className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Homme du match</div>
                <div className="font-semibold text-sm truncate">{match.matchSummary.motm.playerName}</div>
                <div className="text-xs text-muted">{match.matchSummary.motm.teamName} · {match.matchSummary.motm.rating.toFixed(1)}/10</div>
              </div>
            </div>
          )}
          <MatchEventsTimeline summary={match.matchSummary} homeName={home?.name ?? 'Dom.'} awayName={away?.name ?? 'Ext.'} />
          <MatchSummaryStatsInline
            snap={match.matchSummary.stats}
            homeName={home?.name ?? 'Domicile'}
            awayName={away?.name ?? 'Extérieur'}
          />
        </div>
      )}
    </div>
  );
}

function MatchEventsTimeline({ summary, homeName, awayName }: {
  summary: import('@/lib/competition/types').MatchSummary;
  homeName: string;
  awayName: string;
}) {
  type Ev = { minute: number; side: 'home' | 'away'; icon: string; label: string; sub?: string };
  const evs: Ev[] = [];
  for (const g of summary.homeGoals ?? []) {
    evs.push({ minute: g.minute, side: 'home', icon: '⚽', label: g.playerName, sub: g.assistName ? `Passe : ${g.assistName}` : undefined });
  }
  for (const g of summary.awayGoals ?? []) {
    evs.push({ minute: g.minute, side: 'away', icon: '⚽', label: g.playerName, sub: g.assistName ? `Passe : ${g.assistName}` : undefined });
  }
  for (const c of summary.homeCards ?? []) {
    evs.push({ minute: c.minute, side: 'home', icon: c.type === 'red' ? '🟥' : '🟨', label: c.playerName });
  }
  for (const c of summary.awayCards ?? []) {
    evs.push({ minute: c.minute, side: 'away', icon: c.type === 'red' ? '🟥' : '🟨', label: c.playerName });
  }
  if (evs.length === 0) return null;
  evs.sort((a, b) => a.minute - b.minute);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_40px_1fr] items-center text-[10px] font-medium text-muted mb-1">
        <span className="truncate">{homeName}</span>
        <span />
        <span className="truncate text-right">{awayName}</span>
      </div>
      {evs.map((ev, i) => (
        <div key={i} className="grid grid-cols-[1fr_40px_1fr] items-center gap-1 text-[11px]">
          {ev.side === 'home' ? (
            <>
              <div className="text-right min-w-0">
                <span className="font-medium truncate block">{ev.label}</span>
                {ev.sub && <span className="text-muted truncate block text-[10px]">{ev.sub}</span>}
              </div>
              <span className="text-center text-muted/60 tabular-nums">{ev.icon} {ev.minute}'</span>
              <div />
            </>
          ) : (
            <>
              <div />
              <span className="text-center text-muted/60 tabular-nums">{ev.minute}' {ev.icon}</span>
              <div className="min-w-0">
                <span className="font-medium truncate block">{ev.label}</span>
                {ev.sub && <span className="text-muted truncate block text-[10px]">{ev.sub}</span>}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function MatchSummaryStatsInline({ snap, homeName, awayName }: {
  snap: import('@/lib/competition/types').MatchStatSnapshot;
  homeName: string;
  awayName: string;
}) {
  const rows: Array<{ label: string; home: number; away: number; bar?: boolean; suffix?: string }> = [
    { label: 'Possession', home: snap.possession.home, away: snap.possession.away, bar: true, suffix: '%' },
    { label: 'Tirs', home: snap.shots.home, away: snap.shots.away, bar: true },
    { label: 'Cadrés', home: snap.shotsOnTarget.home, away: snap.shotsOnTarget.away, bar: true },
    { label: 'Arrêts', home: snap.saves.home, away: snap.saves.away, bar: true },
    { label: 'Passes', home: snap.passes.home, away: snap.passes.away, bar: true },
    { label: 'Fautes', home: snap.fouls.home, away: snap.fouls.away, bar: true },
    { label: 'Corners', home: snap.corners.home, away: snap.corners.away, bar: true },
    { label: 'Hors-jeu', home: snap.offsides.home, away: snap.offsides.away, bar: true },
    { label: 'Passes clés', home: snap.keyPasses.home, away: snap.keyPasses.away, bar: true },
    { label: 'Dribbles', home: snap.dribbles.home, away: snap.dribbles.away, bar: true },
    { label: 'Dégagements', home: snap.clearances.home, away: snap.clearances.away, bar: true },
    { label: '🟨 Jaunes', home: snap.yellowCards.home, away: snap.yellowCards.away },
    { label: '🟥 Rouges', home: snap.redCards.home, away: snap.redCards.away },
  ];

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center text-[10px] font-medium text-muted mb-2">
        <span className="truncate">{homeName}</span>
        <span className="px-3 text-center uppercase tracking-widest opacity-50">Stats</span>
        <span className="truncate text-right">{awayName}</span>
      </div>
      {rows.map(({ label, home, away, bar, suffix }) =>
        bar ? (
          <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
            <span className="tabular-nums text-right font-medium">{home}{suffix ?? ''}</span>
            <span className="text-muted/60 text-[10px] uppercase tracking-widest w-20 text-center shrink-0">{label}</span>
            <span className="tabular-nums font-medium">{away}{suffix ?? ''}</span>
          </div>
        ) : (
          <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
            <span className="tabular-nums text-right font-medium">{home}</span>
            <span className="text-muted/60 text-[10px] w-20 text-center shrink-0">{label}</span>
            <span className="tabular-nums font-medium">{away}</span>
          </div>
        )
      )}
    </div>
  );
}

function AwardCard({ emoji, label, stats, showRating }: {
  emoji: string;
  label: string;
  stats: PlayerCompStats | null | undefined;
  showRating?: boolean;
}) {
  if (!stats) return (
    <div className="rounded-md bg-warning/5 border border-warning/20 p-3 text-center space-y-1 opacity-40">
      <div className="text-lg">{emoji}</div>
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-xs text-muted">—</div>
    </div>
  );

  const sub = showRating
    ? `Note moy. ${stats.avgRating.toFixed(1)}`
    : stats.goals > 0 && label.includes('buteur')
    ? `${stats.goals} but${stats.goals > 1 ? 's' : ''}`
    : stats.assists > 0 && label.includes('passeur')
    ? `${stats.assists} passe${stats.assists > 1 ? 's' : ''}`
    : `${stats.cleanSheets} clean sheet${stats.cleanSheets > 1 ? 's' : ''}`;

  return (
    <div className="rounded-md bg-warning/5 border border-warning/20 p-3 text-center space-y-1">
      <div className="text-lg">{emoji}</div>
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium truncate">{stats.playerName}</div>
      <div className="text-xs text-muted">{stats.teamName}</div>
      <div className="text-xs text-accent font-medium">{sub}</div>
    </div>
  );
}

const PLAYER_STAT_LABELS: Record<string, string> = {
  // technical
  passing: 'Passe', crossing: 'Centre', dribbling: 'Dribble', finishing: 'Finition',
  firstTouch: '1er contact', heading: 'Jeu de tête', longShots: 'Frappes lointaines',
  tackling: 'Tacle', technique: 'Technique',
  // mental
  vision: 'Vision', decisions: 'Décisions', composure: 'Sang-froid', anticipation: 'Anticipation',
  offTheBall: 'Démarquage', aggression: 'Agressivité', workRate: 'Activité',
  // physical
  pace: 'Vitesse', acceleration: 'Accélération', strength: 'Force', stamina: 'Endurance',
  jumping: 'Détente', balance: 'Équilibre', agility: 'Agilité',
  // goalkeeping
  reflexes: 'Réflexes', handling: 'Jeu de mains', aerial: 'Sorties aériennes',
  oneOnOne: 'Face-à-face', kicking: 'Relances pieds', throwing: 'Relances mains',
};

const COACH_STAT_LABELS: Record<string, string> = {
  motivation: 'Motivation', tactique: 'Tactique', offensive: 'Offensive',
  defensif: 'Défensif', mentalite: 'Mentalité', gestion: 'Gestion',
};

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 20) * 100);
  const color = value >= 15 ? '#4ade80' : value >= 10 ? '#facc15' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] tabular-nums w-4 text-right shrink-0">{value}</span>
    </div>
  );
}

function MentionPopup({
  mention,
  onClose,
  playerStats,
  injuries,
  suspensions,
}: {
  mention: PressMention;
  onClose: () => void;
  playerStats?: Record<string, import('@/lib/competition/types').PlayerCompStats>;
  injuries?: Injury[];
  suspensions?: Suspension[];
}) {
  const isPlayer = mention.type === 'player';
  const isCoach = mention.type === 'coach';
  const p = isPlayer ? (mention as PressMentionPlayer) : null;
  const c = isCoach ? (mention as PressMentionCoach) : null;

  // Lookup comp stats by name
  const compStat = playerStats
    ? Object.values(playerStats).find((s) => s.playerName === mention.name)
    : undefined;
  // Blessure/suspension active pour ce joueur
  const injury = injuries?.find((i) => i.playerName === mention.name);
  const suspension = suspensions?.find((s) => s.subjectName === mention.name);
  // Suspension coach
  const coachSuspension = isCoach ? suspensions?.find((s) => s.subjectId === 'coach' && s.subjectName === mention.name) : undefined;

  function ratingColor(r: number) {
    if (r >= 8) return 'text-green-400';
    if (r >= 7) return 'text-accent';
    if (r >= 6) return 'text-text';
    return 'text-muted';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 rounded-xl border border-border bg-surface shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="font-display text-lg">{mention.name}</div>
            <div className="text-xs text-muted mt-0.5 flex items-center gap-2">
              {isPlayer && <span>{(mention as PressMentionPlayer).position}</span>}
              {isCoach && <span>Entraîneur</span>}
              <span className="font-medium text-accent">Overall {mention.overall}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-lg leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Blessure */}
          {injury && (
            <div className="rounded border border-danger/30 bg-danger/5 px-3 py-2 flex items-start gap-2">
              <span className="text-danger text-sm shrink-0">🤕</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-danger">Blessé — {injury.severity}</div>
                <div className="text-[10px] text-muted mt-0.5">{injury.description} · {injury.matchesRemaining} match{injury.matchesRemaining > 1 ? 's' : ''} restant{injury.matchesRemaining > 1 ? 's' : ''}</div>
              </div>
            </div>
          )}

          {/* Suspension joueur */}
          {suspension && !isCoach && (
            <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2">
              <span className="text-warning text-sm shrink-0">🟥</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-warning">Suspendu</div>
                <div className="text-[10px] text-muted mt-0.5">{suspension.reason} · {suspension.matchesRemaining} match{suspension.matchesRemaining > 1 ? 's' : ''} restant{suspension.matchesRemaining > 1 ? 's' : ''}</div>
              </div>
            </div>
          )}

          {/* Suspension coach */}
          {coachSuspension && (
            <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2">
              <span className="text-warning text-sm shrink-0">🚫</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-warning">Suspendu (banc)</div>
                <div className="text-[10px] text-muted mt-0.5">{coachSuspension.reason} · {coachSuspension.matchesRemaining} match{coachSuspension.matchesRemaining > 1 ? 's' : ''} restant{coachSuspension.matchesRemaining > 1 ? 's' : ''}</div>
              </div>
            </div>
          )}

          {/* Stats compétition joueur */}
          {compStat && isPlayer && (
            <div className="rounded border border-border bg-bg px-3 py-2 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-muted">Stats en compétition</div>
              <div className="grid grid-cols-4 gap-1 text-center">
                <div>
                  <div className="text-base font-display tabular-nums">{compStat.goals}</div>
                  <div className="text-[10px] text-muted">Buts</div>
                </div>
                <div>
                  <div className="text-base font-display tabular-nums">{compStat.assists}</div>
                  <div className="text-[10px] text-muted">P.D.</div>
                </div>
                <div>
                  <div className={`text-base font-display tabular-nums ${ratingColor(compStat.avgRating)}`}>
                    {compStat.avgRating > 0 ? compStat.avgRating.toFixed(1) : '—'}
                  </div>
                  <div className="text-[10px] text-muted">Note</div>
                </div>
                {compStat.motmCount > 0 && (
                  <div>
                    <div className="text-base font-display tabular-nums text-yellow-400">{compStat.motmCount}</div>
                    <div className="text-[10px] text-muted">MOTM</div>
                  </div>
                )}
              </div>
              {compStat.position === 'GK' && compStat.saves > 0 && (
                <div className="grid grid-cols-2 gap-1 text-center border-t border-border/50 pt-2">
                  <div>
                    <div className="text-base font-display tabular-nums">{compStat.saves}</div>
                    <div className="text-[10px] text-muted">Arrêts</div>
                  </div>
                  <div>
                    <div className="text-base font-display tabular-nums">{compStat.cleanSheets}</div>
                    <div className="text-[10px] text-muted">Clean sheets</div>
                  </div>
                </div>
              )}
              {compStat.matchRatings.length > 0 && (
                <div className="flex items-center gap-1 pt-1 border-t border-border/50 flex-wrap">
                  <span className="text-[10px] text-muted mr-1">Forme :</span>
                  {compStat.matchRatings.slice(-5).map((r, i) => (
                    <span key={i} className={`text-[10px] font-medium tabular-nums ${ratingColor(r)}`}>{r.toFixed(1)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Player attributes */}
          {p && (
            <>
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Technique</div>
                {Object.entries(p.stats.technical).map(([k, v]) => (
                  <StatBar key={k} label={PLAYER_STAT_LABELS[k] ?? k} value={v as number} />
                ))}
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Mental</div>
                {Object.entries(p.stats.mental).map(([k, v]) => (
                  <StatBar key={k} label={PLAYER_STAT_LABELS[k] ?? k} value={v as number} />
                ))}
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Physique</div>
                {Object.entries(p.stats.physical).map(([k, v]) => (
                  <StatBar key={k} label={PLAYER_STAT_LABELS[k] ?? k} value={v as number} />
                ))}
              </div>
              {p.stats.goalkeeping && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Gardien</div>
                  {Object.entries(p.stats.goalkeeping).map(([k, v]) => (
                    <StatBar key={k} label={PLAYER_STAT_LABELS[k] ?? k} value={v as number} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Coach stats + traits + forme */}
          {c && (
            <>
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Attributs</div>
                {Object.entries(c.stats).map(([k, v]) => (
                  <StatBar key={k} label={COACH_STAT_LABELS[k] ?? k} value={v as number} />
                ))}
              </div>
              {/* Forme coach : on utilise le playerStats du coach si dispo (coachId = nom) */}
              {compStat && compStat.matchRatings.length > 0 && (
                <div className="rounded border border-border bg-bg px-3 py-2 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-muted">Forme récente</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {compStat.matchRatings.slice(-5).map((r, i) => (
                      <span key={i} className={`text-xs font-medium tabular-nums ${ratingColor(r)}`}>{r.toFixed(1)}</span>
                    ))}
                  </div>
                </div>
              )}
              {c.positiveTraits.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Traits positifs</div>
                  {c.positiveTraits.map((t) => (
                    <div key={t} className="rounded border border-green-800/40 bg-green-950/30 px-2.5 py-1.5">
                      <div className="text-xs font-medium text-green-400">{COACH_TRAIT_LABEL[t as keyof typeof COACH_TRAIT_LABEL]}</div>
                      <div className="text-[10px] text-muted mt-0.5">{COACH_TRAIT_DESCRIPTION[t as keyof typeof COACH_TRAIT_DESCRIPTION]}</div>
                    </div>
                  ))}
                </div>
              )}
              {c.negativeTraits.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Traits négatifs</div>
                  {c.negativeTraits.map((t) => (
                    <div key={t} className="rounded border border-danger/30 bg-danger/5 px-2.5 py-1.5">
                      <div className="text-xs font-medium text-danger">{COACH_TRAIT_LABEL[t as keyof typeof COACH_TRAIT_LABEL]}</div>
                      <div className="text-[10px] text-muted mt-0.5">{COACH_TRAIT_DESCRIPTION[t as keyof typeof COACH_TRAIT_DESCRIPTION]}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerCompPopup({
  stat,
  teamMap,
  onClose,
  injuries,
  suspensions,
}: {
  stat: import('@/lib/competition/types').PlayerCompStats;
  teamMap: Record<string, Team>;
  onClose: () => void;
  injuries?: Injury[];
  suspensions?: Suspension[];
}) {
  const team = teamMap[stat.teamId];
  const injury = injuries?.find((i) => i.playerName === stat.playerName);
  const suspension = suspensions?.find((s) => s.subjectName === stat.playerName && s.subjectId !== 'coach');
  const recentRatings = stat.matchRatings.slice(-5);
  function rc(r: number) {
    return r >= 8 ? 'text-green-400' : r >= 7 ? 'text-accent' : r >= 6 ? 'text-text' : 'text-muted';
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 rounded-xl border border-border bg-surface shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {team?.flag && <img src={team.flag} alt="" className="h-7 w-7 object-cover rounded-sm shrink-0" />}
            <div>
              <div className="font-display text-base">{stat.playerName}</div>
              <div className="text-xs text-muted flex items-center gap-2">
                <span>{stat.position}</span>
                <span className="font-medium text-accent">Overall {stat.overall}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-lg leading-none">×</button>
        </div>
        <div className="p-4 space-y-3">
          {injury && (
            <div className="rounded border border-danger/30 bg-danger/5 px-3 py-2 flex items-start gap-2">
              <span className="text-danger text-sm shrink-0">🤕</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-danger">Blessé — {injury.severity}</div>
                <div className="text-[10px] text-muted mt-0.5">{injury.description} · {injury.matchesRemaining} match{injury.matchesRemaining > 1 ? 's' : ''} restant{injury.matchesRemaining > 1 ? 's' : ''}</div>
              </div>
            </div>
          )}
          {suspension && (
            <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2">
              <span className="text-warning text-sm shrink-0">🟥</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-warning">Suspendu</div>
                <div className="text-[10px] text-muted mt-0.5">{suspension.reason} · {suspension.matchesRemaining} match{suspension.matchesRemaining > 1 ? 's' : ''} restant{suspension.matchesRemaining > 1 ? 's' : ''}</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div>
              <div className="text-xl font-display tabular-nums">{stat.goals}</div>
              <div className="text-[10px] text-muted">Buts</div>
            </div>
            <div>
              <div className="text-xl font-display tabular-nums">{stat.assists}</div>
              <div className="text-[10px] text-muted">P.D.</div>
            </div>
            <div>
              <div className={`text-xl font-display tabular-nums ${rc(stat.avgRating)}`}>
                {stat.avgRating > 0 ? stat.avgRating.toFixed(1) : '—'}
              </div>
              <div className="text-[10px] text-muted">Note</div>
            </div>
            {stat.motmCount > 0 ? (
              <div>
                <div className="text-xl font-display tabular-nums text-yellow-400">{stat.motmCount}</div>
                <div className="text-[10px] text-muted">MOTM</div>
              </div>
            ) : <div />}
          </div>
          {stat.position === 'GK' && (stat.saves > 0 || stat.cleanSheets > 0) && (
            <div className="grid grid-cols-2 gap-1.5 text-center border-t border-border/50 pt-2">
              {stat.saves > 0 && (
                <div>
                  <div className="text-xl font-display tabular-nums">{stat.saves}</div>
                  <div className="text-[10px] text-muted">Arrêts</div>
                </div>
              )}
              {stat.cleanSheets > 0 && (
                <div>
                  <div className="text-xl font-display tabular-nums">{stat.cleanSheets}</div>
                  <div className="text-[10px] text-muted">Clean sheets</div>
                </div>
              )}
            </div>
          )}
          {(stat.yellowCards > 0 || stat.redCards > 0) && (
            <div className="flex gap-3 justify-center border-t border-border/50 pt-2">
              {stat.yellowCards > 0 && (
                <div className="text-center">
                  <div className="text-base font-display tabular-nums text-yellow-400">{stat.yellowCards}</div>
                  <div className="text-[10px] text-muted">Jaunes</div>
                </div>
              )}
              {stat.redCards > 0 && (
                <div className="text-center">
                  <div className="text-base font-display tabular-nums text-danger">{stat.redCards}</div>
                  <div className="text-[10px] text-muted">Rouges</div>
                </div>
              )}
            </div>
          )}
          {recentRatings.length > 0 && (
            <div className="border-t border-border/50 pt-2">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Forme récente ({stat.matchRatings.length} matchs)</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {recentRatings.map((r, i) => (
                  <span key={i} className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded border ${r >= 8 ? 'border-green-800/40 bg-green-950/30 text-green-400' : r >= 7 ? 'border-accent/30 bg-accent/5 text-accent' : r >= 6 ? 'border-border text-text' : 'border-border/50 text-muted'}`}>
                    {r.toFixed(1)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/** Replace mention names in text with clickable spans */
function renderBodyWithMentions(body: string, mentions: PressMention[] | undefined, onMention: (m: PressMention) => void) {
  if (!mentions?.length) return <>{body}</>;

  // Build a regex that matches any mention name (longest first to avoid partial matches)
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(`(${names.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');

  const parts = body.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const mention = mentions.find((m) => m.name === part);
        if (mention) {
          return (
            <button
              key={i}
              onClick={() => onMention(mention)}
              className="font-medium text-accent underline decoration-dotted hover:text-accent/70 transition-colors cursor-pointer"
            >
              {part} ({mention.overall})
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function MoraleTab({
  morale,
  teamMap,
  teamIds,
}: {
  morale: Record<string, number>;
  teamMap: Record<string, Team>;
  teamIds: string[];
}) {
  const sorted = [...teamIds].sort((a, b) => (morale[b] ?? MORALE_DEFAULT) - (morale[a] ?? MORALE_DEFAULT));
  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-muted">Moral des équipes</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((tid) => {
          const team = teamMap[tid];
          const m = morale[tid] ?? MORALE_DEFAULT;
          const { text, color } = moraleLabel(m);
          return (
            <div key={tid} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
              {team?.flag && <img src={team.flag} alt="" className="h-7 w-7 object-cover rounded-sm shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{team?.name ?? tid}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${m}%`,
                        background: m >= 70 ? '#4ade80' : m >= 40 ? '#facc15' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 ${color}`}>{text} ({m})</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PressTab({
  pressItems,
  teamMap,
  teamIds,
  playerStats,
  injuries,
  suspensions,
}: {
  pressItems: PressItem[];
  teamMap: Record<string, Team>;
  teamIds: string[];
  playerStats: Record<string, import('@/lib/competition/types').PlayerCompStats>;
  injuries: Injury[];
  suspensions: Suspension[];
}) {
  const [filter, setFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [roundFilter, setRoundFilter] = useState<string>('all');
  const [activeMention, setActiveMention] = useState<PressMention | null>(null);
  const [matchPopup, setMatchPopup] = useState<PressItem['matchSnapshot'] | null>(null);
  const roundsWithDrame = new Set(pressItems.filter((p) => p.category === 'drame').map((p) => p.round));
  const sorted = [...pressItems].sort((a, b) => {
    if (a.round !== b.round) return b.round - a.round;
    const hasDrame = roundsWithDrame.has(a.round);
    const aWeight = hasDrame ? (a.category === 'drame' ? 0 : 1) : (a.category === 'cmf' ? 0 : 1);
    const bWeight = hasDrame ? (b.category === 'drame' ? 0 : 1) : (b.category === 'cmf' ? 0 : 1);
    if (aWeight !== bWeight) return aWeight - bWeight;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const allRounds = [...new Set(pressItems.map((p) => p.round))].sort((a, b) => b - a);
  const filtered = sorted
    .filter((p) => filter === 'all' || p.teamId === filter)
    .filter((p) => catFilter === 'all' || p.category === catFilter)
    .filter((p) => roundFilter === 'all' || p.round === Number(roundFilter));

  return (
    <div className="space-y-6">
      {activeMention && <MentionPopup mention={activeMention} onClose={() => setActiveMention(null)} playerStats={playerStats} injuries={injuries} suspensions={suspensions} />}
      {matchPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setMatchPopup(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            {/* Score header */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {teamMap[matchPopup.homeTeamId]?.flag && <img src={teamMap[matchPopup.homeTeamId].flag} alt="" className="h-6 w-6 object-cover rounded-sm shrink-0" />}
                <span className="text-sm font-semibold truncate">{matchPopup.homeTeamName}</span>
              </div>
              <div className="shrink-0 px-3 py-1 rounded-lg bg-bg border border-border text-base font-bold tabular-nums">
                {matchPopup.homeScore} – {matchPopup.awayScore}
              </div>
              <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                <span className="text-sm font-semibold truncate">{matchPopup.awayTeamName}</span>
                {teamMap[matchPopup.awayTeamId]?.flag && <img src={teamMap[matchPopup.awayTeamId].flag} alt="" className="h-6 w-6 object-cover rounded-sm shrink-0" />}
              </div>
            </div>
            {/* Stats */}
            {matchPopup.stats && (() => {
              const s = matchPopup.stats!;
              const rows: [string, number, number][] = [
                ['Tirs', s.shots.home, s.shots.away],
                ['Tirs cadrés', s.shotsOnTarget.home, s.shotsOnTarget.away],
                ['Possession', s.possession.home, s.possession.away],
                ['Corners', s.corners.home, s.corners.away],
                ['Fautes', s.fouls.home, s.fouls.away],
                ['Jaunes', s.yellowCards.home, s.yellowCards.away],
                ['Rouges', s.redCards.home, s.redCards.away],
              ];
              return (
                <div className="space-y-1.5">
                  {rows.map(([label, h, a]) => {
                    const total = h + a || 1;
                    const pct = Math.round((h / total) * 100);
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-[10px] text-muted mb-0.5">
                          <span className="font-medium tabular-nums">{label === 'Possession' ? `${h}%` : h}</span>
                          <span className="text-[10px]">{label}</span>
                          <span className="font-medium tabular-nums">{label === 'Possession' ? `${a}%` : a}</span>
                        </div>
                        <div className="h-1 rounded-full bg-border overflow-hidden flex">
                          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {/* MOTM */}
            {matchPopup.motm && (
              <div className="flex items-center gap-2 rounded-lg border border-yellow-400/20 bg-yellow-400/5 px-3 py-2">
                <span className="text-base shrink-0">⭐</span>
                <div className="min-w-0">
                  <div className="text-[10px] text-muted uppercase tracking-wide">Homme du match</div>
                  <div className="flex items-center gap-1.5">
                    {teamMap[matchPopup.motm.teamId]?.flag && <img src={teamMap[matchPopup.motm.teamId].flag} alt="" className="h-4 w-4 object-cover rounded-sm shrink-0" />}
                    <span className="text-xs font-semibold truncate">{matchPopup.motm.playerName}</span>
                    <span className="text-xs text-yellow-400 font-bold shrink-0">{matchPopup.motm.rating.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}
            <button onClick={() => setMatchPopup(null)} className="w-full text-xs text-muted hover:text-text transition-colors">Fermer</button>
          </div>
        </div>
      )}
      {/* Press articles */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-xs uppercase tracking-widest text-muted">Articles</h3>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="ml-auto h-7 rounded border border-border bg-surface px-2 text-xs"
          >
            <option value="all">Tous les types</option>
            {(['victoire', 'exploit', 'defaite', 'crise', 'scandale', 'neutralite', 'forme', 'critique', 'revolte', 'drame', 'cmf'] as const).map((c) => (
              <option key={c} value={c}>{PRESS_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
          <select
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className="h-7 rounded border border-border bg-surface px-2 text-xs"
          >
            <option value="all">Toutes les journées</option>
            {allRounds.map((r) => (
              <option key={r} value={r}>Journée {r}</option>
            ))}
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 rounded border border-border bg-surface px-2 text-xs"
          >
            <option value="all">Toutes les équipes</option>
            {teamIds.map((tid) => (
              <option key={tid} value={tid}>{teamMap[tid]?.name ?? tid}</option>
            ))}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="text-muted text-sm">Aucun article pour l'instant — jouez des matchs !</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((item, idx) => {
              const prevItem = filtered[idx - 1];
              const showRoundSep = idx > 0 && prevItem.round !== item.round;
              const team = item.teamId ? teamMap[item.teamId] : null;
              const colorCls = PRESS_CATEGORY_COLOR[item.category];
              return (
                <div key={item.id}>
                  {showRoundSep && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] uppercase tracking-widest text-muted shrink-0">Journée {item.round}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                <article className="rounded-lg border border-border bg-surface p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    {team?.flag && <img src={team.flag} alt="" className="h-7 w-7 object-cover rounded-sm shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${colorCls}`}>
                          {PRESS_CATEGORY_LABEL[item.category]}
                        </span>
                        <span className="text-[10px] text-muted">J{item.round}</span>
                        {item.moraleBefore !== undefined && item.moraleAfter !== undefined && (
                          <span className="text-[10px] text-muted">
                            Moral {item.moraleBefore} → {item.moraleAfter}
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium text-sm leading-snug">{item.headline}</h4>
                      <p className="text-xs text-muted mt-1 leading-relaxed">
                        {renderBodyWithMentions(item.body, item.mentions, setActiveMention)}
                      </p>
                      {item.journalist && (
                        <p className="text-[10px] text-muted/60 mt-1.5 italic">
                          — {item.journalist.name} · {item.journalist.outlet}
                        </p>
                      )}
                      {item.matchId && item.matchSnapshot && (
                        <div className="mt-2 space-y-1">
                          {[item.matchSnapshot, ...(item.extraMatchSnapshots ?? [])].map((snap, si) => (
                            <button
                              key={si}
                              onClick={() => setMatchPopup(snap)}
                              className="w-full flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 hover:bg-border/30 transition-colors group text-left"
                            >
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                {teamMap[snap.homeTeamId]?.flag && (
                                  <img src={teamMap[snap.homeTeamId].flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />
                                )}
                                <span className="text-xs font-medium truncate">{snap.homeTeamName}</span>
                              </div>
                              <div className="shrink-0 px-2 py-0.5 rounded bg-surface border border-border text-xs font-bold tabular-nums">
                                {snap.homeScore} – {snap.awayScore}
                              </div>
                              <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                                <span className="text-xs font-medium truncate">{snap.awayTeamName}</span>
                                {teamMap[snap.awayTeamId]?.flag && (
                                  <img src={teamMap[snap.awayTeamId].flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />
                                )}
                              </div>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted group-hover:text-text transition-colors ml-1">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                              </svg>
                            </button>
                          ))}
                        </div>
                      )}
                      {item.cmfSnapshot && (
                        <div className="mt-2 space-y-2">
                          {item.cmfSnapshot.favoriteTeams.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[10px] text-muted uppercase tracking-wide">Favoris</div>
                              <div className="flex flex-wrap gap-1.5">
                                {item.cmfSnapshot.favoriteTeams.map((ft, i) => (
                                  <div key={ft.teamId} className="flex items-center gap-1.5 rounded border border-border bg-bg px-2 py-0.5">
                                    {teamMap[ft.teamId]?.flag && <img src={teamMap[ft.teamId].flag} alt="" className="h-3.5 w-3.5 object-cover rounded-sm shrink-0" />}
                                    <span className="text-[10px] font-medium">{i + 1}. {ft.teamName}</span>
                                    {ft.cote !== undefined && (
                                      <span className="text-[10px] font-bold text-yellow-400 ml-0.5">{ft.cote.toFixed(2)}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {(item.cmfSnapshot.topScorer || item.cmfSnapshot.topAssister || item.cmfSnapshot.bestPlayer || item.cmfSnapshot.bestGK) && (
                            <div className="grid grid-cols-2 gap-1">
                              {item.cmfSnapshot.topScorer && (
                                <div className="flex items-center gap-1.5 rounded border border-border bg-bg px-2 py-1">
                                  <span className="text-[11px]">🥇</span>
                                  <div className="min-w-0">
                                    <div className="text-[10px] text-muted">Buteur</div>
                                    <div className="flex items-center gap-1">
                                      {teamMap[item.cmfSnapshot.topScorer.teamId]?.flag && <img src={teamMap[item.cmfSnapshot.topScorer.teamId].flag} alt="" className="h-3 w-3 object-cover rounded-sm shrink-0" />}
                                      <span className="text-[10px] font-medium truncate">{item.cmfSnapshot.topScorer.playerName}</span>
                                      <span className="text-[10px] text-accent shrink-0">{item.cmfSnapshot.topScorer.goals}b</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {item.cmfSnapshot.topAssister && (
                                <div className="flex items-center gap-1.5 rounded border border-border bg-bg px-2 py-1">
                                  <span className="text-[11px]">🎯</span>
                                  <div className="min-w-0">
                                    <div className="text-[10px] text-muted">Passeur</div>
                                    <div className="flex items-center gap-1">
                                      {teamMap[item.cmfSnapshot.topAssister.teamId]?.flag && <img src={teamMap[item.cmfSnapshot.topAssister.teamId].flag} alt="" className="h-3 w-3 object-cover rounded-sm shrink-0" />}
                                      <span className="text-[10px] font-medium truncate">{item.cmfSnapshot.topAssister.playerName}</span>
                                      <span className="text-[10px] text-accent shrink-0">{item.cmfSnapshot.topAssister.assists}p</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {item.cmfSnapshot.bestPlayer && (
                                <div className="flex items-center gap-1.5 rounded border border-border bg-bg px-2 py-1">
                                  <span className="text-[11px]">⭐</span>
                                  <div className="min-w-0">
                                    <div className="text-[10px] text-muted">Meilleur joueur</div>
                                    <div className="flex items-center gap-1">
                                      {teamMap[item.cmfSnapshot.bestPlayer.teamId]?.flag && <img src={teamMap[item.cmfSnapshot.bestPlayer.teamId].flag} alt="" className="h-3 w-3 object-cover rounded-sm shrink-0" />}
                                      <span className="text-[10px] font-medium truncate">{item.cmfSnapshot.bestPlayer.playerName}</span>
                                      <span className="text-[10px] text-accent shrink-0">{item.cmfSnapshot.bestPlayer.avgRating.toFixed(1)}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {item.cmfSnapshot.bestGK && (
                                <div className="flex items-center gap-1.5 rounded border border-border bg-bg px-2 py-1">
                                  <span className="text-[11px]">🧤</span>
                                  <div className="min-w-0">
                                    <div className="text-[10px] text-muted">Gardien</div>
                                    <div className="flex items-center gap-1">
                                      {teamMap[item.cmfSnapshot.bestGK.teamId]?.flag && <img src={teamMap[item.cmfSnapshot.bestGK.teamId].flag} alt="" className="h-3 w-3 object-cover rounded-sm shrink-0" />}
                                      <span className="text-[10px] font-medium truncate">{item.cmfSnapshot.bestGK.playerName}</span>
                                      <span className="text-[10px] text-accent shrink-0">{item.cmfSnapshot.bestGK.cleanSheets}cs</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {item.cmfSnapshot.playoffPairs && item.cmfSnapshot.playoffPairs.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[10px] text-muted uppercase tracking-wide">Pronostics barrages</div>
                              <div className="space-y-1">
                                {item.cmfSnapshot.playoffPairs.map((pair, i) => (
                                  <div key={i} className="flex items-center gap-1.5 rounded border border-border bg-bg px-2 py-1 text-[10px]">
                                    {teamMap[pair.homeTeamId]?.flag && <img src={teamMap[pair.homeTeamId].flag} alt="" className="h-3 w-3 object-cover rounded-sm shrink-0" />}
                                    <span className={pair.favoriteTeamId === pair.homeTeamId ? 'font-bold text-accent' : 'text-muted'}>{pair.homeTeamName}</span>
                                    <span className="text-muted mx-0.5">vs</span>
                                    {teamMap[pair.awayTeamId]?.flag && <img src={teamMap[pair.awayTeamId].flag} alt="" className="h-3 w-3 object-cover rounded-sm shrink-0" />}
                                    <span className={pair.favoriteTeamId === pair.awayTeamId ? 'font-bold text-accent' : 'text-muted'}>{pair.awayTeamName}</span>
                                    <span className="ml-auto text-yellow-400 font-bold shrink-0">{pair.cote.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {item.cmfSnapshot.winner && (
                            <div className="flex items-center gap-2 rounded border border-yellow-400/20 bg-yellow-400/5 px-3 py-1.5">
                              {teamMap[item.cmfSnapshot.winner.teamId]?.flag && <img src={teamMap[item.cmfSnapshot.winner.teamId].flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />}
                              <span className="text-xs font-semibold text-yellow-400">🏆 {item.cmfSnapshot.winner.teamName}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MedicalTab({
  injuries,
  teamMap,
  playerStats,
}: {
  injuries: Injury[];
  teamMap: Record<string, Team>;
  playerStats: Record<string, import('@/lib/competition/types').PlayerCompStats>;
}) {
  const [activeStat, setActiveStat] = useState<import('@/lib/competition/types').PlayerCompStats | null>(null);
  const statByName = Object.values(playerStats).reduce<Record<string, import('@/lib/competition/types').PlayerCompStats>>((acc, s) => {
    acc[s.playerName] = s;
    return acc;
  }, {});
  const teamIds = [...new Set(injuries.map((i) => i.teamId))];

  if (injuries.length === 0) {
    return <div className="py-16 text-center text-muted text-sm">Aucun joueur blessé.</div>;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-center w-fit">
          <div className="text-2xl font-display text-danger">{injuries.length}</div>
          <div className="text-xs text-muted mt-0.5">Blessé{injuries.length > 1 ? 's' : ''}</div>
        </div>
        <div className="space-y-4">
          {teamIds.map((tid) => {
            const team = teamMap[tid];
            const teamInjuries = injuries.filter((i) => i.teamId === tid);
            return (
              <div key={tid} className="rounded-lg border border-border bg-surface overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg/40">
                  {team?.flag && <img src={team.flag} alt="" className="h-6 w-6 object-cover rounded-sm shrink-0" />}
                  <span className="font-medium text-sm">{team?.name ?? tid}</span>
                  <span className="ml-auto text-xs text-muted">{teamInjuries.length} blessé{teamInjuries.length > 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-border/50">
                  {teamInjuries.map((inj) => {
                    const stat = statByName[inj.playerName];
                    return (
                      <div key={inj.id} className="flex items-start gap-3 px-4 py-3">
                        <span className={`mt-0.5 shrink-0 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_COLOR[inj.severity]}`}>
                          {inj.severity}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {stat ? (
                              <button
                                onClick={() => setActiveStat(stat)}
                                className="text-sm font-medium text-accent underline decoration-dotted hover:text-accent/70 transition-colors"
                              >
                                {inj.playerName}
                              </button>
                            ) : (
                              <span className="text-sm font-medium">{inj.playerName}</span>
                            )}
                            <span className="text-[10px] text-muted">{CAUSE_LABEL[inj.cause]}</span>
                          </div>
                          <p className="text-xs text-muted mt-0.5">{inj.description}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-display tabular-nums text-danger">{inj.matchesRemaining}</div>
                          <div className="text-[10px] text-muted">match{inj.matchesRemaining > 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {activeStat && (
        <PlayerCompPopup stat={activeStat} teamMap={teamMap} onClose={() => setActiveStat(null)} injuries={injuries} />
      )}
    </>
  );
}

function SuspensionsTab({
  suspensions,
  teamMap,
  playerStats,
}: {
  suspensions: Suspension[];
  teamMap: Record<string, Team>;
  playerStats: Record<string, import('@/lib/competition/types').PlayerCompStats>;
}) {
  const [activeStat, setActiveStat] = useState<import('@/lib/competition/types').PlayerCompStats | null>(null);
  const statByName = Object.values(playerStats).reduce<Record<string, import('@/lib/competition/types').PlayerCompStats>>((acc, s) => {
    acc[s.playerName] = s;
    return acc;
  }, {});
  const players = suspensions.filter((s) => s.subjectId !== 'coach');
  const coaches = suspensions.filter((s) => s.subjectId === 'coach');

  if (suspensions.length === 0) {
    return <div className="py-16 text-center text-muted text-sm">Aucune suspension en cours.</div>;
  }

  function SuspRow({ sus }: { sus: Suspension }) {
    const team = teamMap[sus.teamId];
    const isRed = /rouge|red|2e jaune|double/i.test(sus.reason);
    const isDoping = /dopage/i.test(sus.reason);
    const cardBadge = isDoping
      ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-900/40 text-purple-300 border border-purple-700/40 shrink-0">DOPING</span>
      : isRed
        ? <span className="inline-block w-3 h-4 rounded-sm bg-danger shrink-0" title="Carton rouge" />
        : <span className="inline-block w-3 h-4 rounded-sm bg-yellow-400 shrink-0" title="Carton jaune" />;
    const stat = sus.subjectId !== 'coach' ? statByName[sus.subjectName] : null;

    return (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-border/50">
        {team?.flag && <img src={team.flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />}
        {cardBadge}
        <div className="min-w-0 flex-1">
          {stat ? (
            <button
              onClick={() => setActiveStat(stat)}
              className="text-sm font-medium text-accent underline decoration-dotted hover:text-accent/70 transition-colors"
            >
              {sus.subjectName}
            </button>
          ) : (
            <span className="text-sm font-medium">{sus.subjectName}</span>
          )}
          <span className="ml-2 text-xs text-muted">{team?.name ?? sus.teamId}</span>
          <p className="text-xs text-muted mt-0.5">{sus.reason}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-display tabular-nums text-warning">{sus.matchesRemaining}</div>
          <div className="text-[10px] text-muted">match{sus.matchesRemaining > 1 ? 's' : ''}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-center w-fit">
        <div className="text-2xl font-display text-warning">{suspensions.length}</div>
        <div className="text-xs text-muted mt-0.5">Suspendu{suspensions.length > 1 ? 's' : ''}</div>
      </div>

      {players.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs uppercase tracking-widest text-muted">Joueurs ({players.length})</h3>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {players.map((sus) => <SuspRow key={sus.id} sus={sus} />)}
          </div>
        </div>
      )}

      {coaches.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs uppercase tracking-widest text-muted">Entraîneurs ({coaches.length})</h3>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            {coaches.map((sus) => <SuspRow key={sus.id} sus={sus} />)}
          </div>
        </div>
      )}
      {activeStat && (
        <PlayerCompPopup stat={activeStat} teamMap={teamMap} onClose={() => setActiveStat(null)} suspensions={suspensions} />
      )}
    </div>
  );
}

function LPMStandingsView({
  standings,
  teams,
  hostTeamId,
  playoffMatches = [],
}: {
  standings: import('@/lib/competition/types').Standing[];
  teams: Record<string, Team>;
  hostTeamId?: string;
  playoffMatches?: import('@/lib/competition/types').CompMatch[];
}) {
  const sorted = [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.goalsFor - a.goalsFor;
  });

  const hostRank = hostTeamId ? sorted.findIndex((s) => s.teamId === hostTeamId) : -1;

  // Compute zone override note for the row that "inherits" host's place
  // If host is top 24 → 25th gets a note "Qualifié (place hôte)"
  // If host is 25-40 → 41st gets "Barrage (place hôte)"
  const inheritNote: Record<string, string> = {};
  if (hostTeamId && hostRank >= 0) {
    if (hostRank < 24 && sorted[24]) inheritNote[sorted[24].teamId] = 'Place hôte → qualif. directe';
    if (hostRank >= 24 && hostRank <= 39 && sorted[40]) inheritNote[sorted[40].teamId] = 'Place hôte → barrage';
  }

  // Compute playoff qualifiers from completed aller/retour pairs
  const playoffQualifiedIds = new Set<string>();
  const leg1s = playoffMatches.filter((m) => m.leg === 1 && m.status === 'completed');
  for (const leg1 of leg1s) {
    const leg2 = playoffMatches.find((m) =>
      m.leg === 2 && m.status === 'completed' && (
        m.homeFromMatch === leg1.id ||
        (m.homeTeamId && m.awayTeamId && leg1.homeTeamId && leg1.awayTeamId &&
          ((m.homeTeamId === leg1.awayTeamId && m.awayTeamId === leg1.homeTeamId) ||
           (m.homeTeamId === leg1.homeTeamId && m.awayTeamId === leg1.awayTeamId)))
      )
    );
    if (!leg2) continue;
    const l1h = leg1.result?.home ?? 0;
    const l1a = leg1.result?.away ?? 0;
    const l2h = leg2.result?.home ?? 0;
    const l2a = leg2.result?.away ?? 0;
    // higher seed = leg1.awayTeamId (reçoit au retour), lower = leg1.homeTeamId
    const aggHigher = l1a + l2h;
    const aggLower = l1h + l2a;
    if (aggHigher > aggLower && leg1.awayTeamId) playoffQualifiedIds.add(leg1.awayTeamId);
    else if (aggLower > aggHigher && leg1.homeTeamId) playoffQualifiedIds.add(leg1.homeTeamId);
    else if (leg2.result?.penalties) {
      const winnerId = leg2.result.penalties.home > leg2.result.penalties.away
        ? leg2.homeTeamId : leg2.awayTeamId;
      if (winnerId) playoffQualifiedIds.add(winnerId);
    }
  }

  const zones = [
    { label: 'Zone Or — Qualifiés directement', from: 0, to: 23, borderCls: 'border-yellow-500/40', bgCls: 'bg-yellow-400/5' },
    { label: 'Zone Rouge — Barrages A/R', from: 24, to: 39, borderCls: 'border-danger/40', bgCls: 'bg-danger/5' },
    { label: 'Zone Noire — Éliminés', from: 40, to: 47, borderCls: 'border-border/30', bgCls: 'bg-surface/50' },
  ];

  return (
    <div className="space-y-6">
      {hostTeamId && hostRank >= 0 && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm flex items-center gap-3">
          {teams[hostTeamId]?.flag && <img src={teams[hostTeamId].flag} alt="" className="h-6 w-6 object-cover rounded-sm shrink-0" />}
          <span>
            <span className="font-medium">{teams[hostTeamId]?.name ?? hostTeamId}</span>
            {' '}(pays hôte) — qualifié d'office · classé{' '}
            <span className="font-medium">{hostRank + 1}ème</span>
            {hostRank < 24 && ' · sa place Zone Or est réattribuée au 25ème'}
            {hostRank >= 24 && hostRank <= 39 && ' · sa place Zone Rouge est réattribuée au 41ème'}
          </span>
        </div>
      )}
      {zones.map((zone) => {
        const zoneTeams = sorted.slice(zone.from, zone.to + 1);
        if (zoneTeams.length === 0) return null;
        return (
          <div key={zone.label} className={`rounded-lg border overflow-hidden ${zone.borderCls} ${zone.bgCls}`}>
            <div className={`px-4 py-2 text-xs font-medium uppercase tracking-widest border-b ${zone.borderCls} ${zone.bgCls}`}>
              {zone.label}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted border-b border-border/50">
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-3 py-2 text-left">Équipe</th>
                    <th className="px-2 py-2 text-center">J</th>
                    <th className="px-2 py-2 text-center">G</th>
                    <th className="px-2 py-2 text-center">N</th>
                    <th className="px-2 py-2 text-center">P</th>
                    <th className="px-2 py-2 text-center">BP</th>
                    <th className="px-2 py-2 text-center">BC</th>
                    <th className="px-2 py-2 text-center">Diff</th>
                    <th className="px-3 py-2 text-center font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {zoneTeams.map((s, i) => {
                    const rank = zone.from + i + 1;
                    const team = teams[s.teamId];
                    const diff = s.goalsFor - s.goalsAgainst;
                    const isHost = s.teamId === hostTeamId;
                    const note = inheritNote[s.teamId];
                    const isPlayoffQualified = playoffQualifiedIds.has(s.teamId);
                    return (
                      <tr key={s.teamId} className={`hover:bg-border/10 transition-colors ${isHost ? 'bg-accent/5' : ''} ${isPlayoffQualified ? 'bg-green-500/5' : ''}`}>
                        <td className="px-3 py-2 tabular-nums text-muted text-xs">{rank}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {team?.flag && <img src={team.flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />}
                            <span className={`truncate max-w-[120px] ${isPlayoffQualified ? 'font-medium' : ''}`}>{team?.name ?? s.teamId}</span>
                            {isHost && (
                              <span className="rounded border border-accent/40 bg-accent/10 px-1 py-0.5 text-[9px] font-medium text-accent shrink-0">Hôte</span>
                            )}
                            {note && (
                              <span className="rounded border border-warning/40 bg-warning/10 px-1 py-0.5 text-[9px] font-medium text-warning shrink-0">{note}</span>
                            )}
                            {isPlayoffQualified && (
                              <span className="rounded border border-green-500/40 bg-green-500/10 px-1 py-0.5 text-[9px] font-medium text-green-400 shrink-0">✓ Qualifié</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums text-muted">{s.played}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{s.won}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{s.drawn}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{s.lost}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{s.goalsFor}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{s.goalsAgainst}</td>
                        <td className={`px-2 py-2 text-center tabular-nums font-medium ${diff > 0 ? 'text-green-500' : diff < 0 ? 'text-danger' : 'text-muted'}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums font-bold">{s.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OngoingSettingsPanel({
  current,
  setCurrent,
  teamMap,
}: {
  current: Competition;
  setCurrent: (c: Competition) => void;
  teamMap: Record<string, Team>;
}) {
  const [open, setOpen] = useState(false);

  const participantOptions = current.teamIds.map((id) => ({
    id,
    name: teamMap[id]?.name ?? current.teamSnapshot?.[id]?.name ?? id,
    flag: teamMap[id]?.flag ?? current.teamSnapshot?.[id]?.flag,
  }));

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted hover:text-text transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">⚙️ Paramètres</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Nom</span>
            <Input
              value={current.name}
              onChange={(e) => setCurrent({ ...current, name: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Année</span>
            <Input
              type="number"
              value={current.year ?? ''}
              onChange={(e) => setCurrent({ ...current, year: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Ex : 2026"
              min={1900}
              max={2200}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Nature (Officielle / Amicale)</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={current.kind ?? ''}
              onChange={(e) => setCurrent({ ...current, kind: (e.target.value || undefined) as CompetitionKind | undefined })}
            >
              <option value="">— Non défini —</option>
              {(Object.keys(COMPETITION_KIND_LABEL) as CompetitionKind[]).map((k) => (
                <option key={k} value={k}>{COMPETITION_KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Type</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={current.scope ?? ''}
              onChange={(e) => setCurrent({ ...current, scope: (e.target.value || undefined) as CompetitionScope | undefined })}
            >
              <option value="">— Non défini —</option>
              {(Object.keys(COMPETITION_SCOPE_LABEL) as CompetitionScope[]).map((s) => (
                <option key={s} value={s}>{COMPETITION_SCOPE_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Importance CMF</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={current.importance ?? ''}
              onChange={(e) => setCurrent({ ...current, importance: (e.target.value || undefined) as CompetitionImportance | undefined })}
            >
              <option value="">— Non défini —</option>
              {(Object.keys(COMPETITION_IMPORTANCE_LABEL) as CompetitionImportance[]).map((i) => (
                <option key={i} value={i}>{COMPETITION_IMPORTANCE_LABEL[i]}</option>
              ))}
            </select>
          </label>
          {(current.format === 'lpm' || current.format === 'groups_knockout') && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Équipe hôte</span>
              <select
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={current.hostTeamId ?? ''}
                onChange={(e) => setCurrent({ ...current, hostTeamId: e.target.value || undefined })}
              >
                <option value="">— Aucun hôte —</option>
                {participantOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function CompletedMetaEditor({
  current,
  setCurrent,
}: {
  current: Competition;
  setCurrent: (c: Competition) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted hover:text-text transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">Modifier les informations</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Nom</span>
            <Input
              value={current.name}
              onChange={(e) => setCurrent({ ...current, name: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Année</span>
            <Input
              type="number"
              value={current.year ?? ''}
              onChange={(e) => setCurrent({ ...current, year: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="Ex : 2026"
              min={1900}
              max={2200}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Nature (Officielle / Amicale)</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={current.kind ?? ''}
              onChange={(e) => setCurrent({ ...current, kind: (e.target.value || undefined) as CompetitionKind | undefined })}
            >
              <option value="">— Non défini —</option>
              {(Object.keys(COMPETITION_KIND_LABEL) as CompetitionKind[]).map((k) => (
                <option key={k} value={k}>{COMPETITION_KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Type</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={current.scope ?? ''}
              onChange={(e) => setCurrent({ ...current, scope: (e.target.value || undefined) as CompetitionScope | undefined })}
            >
              <option value="">— Non défini —</option>
              {(Object.keys(COMPETITION_SCOPE_LABEL) as CompetitionScope[]).map((s) => (
                <option key={s} value={s}>{COMPETITION_SCOPE_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Importance CMF</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={current.importance ?? ''}
              onChange={(e) => setCurrent({ ...current, importance: (e.target.value || undefined) as CompetitionImportance | undefined })}
            >
              <option value="">— Non défini (National par défaut) —</option>
              {(Object.keys(COMPETITION_IMPORTANCE_LABEL) as CompetitionImportance[]).map((i) => (
                <option key={i} value={i}>{COMPETITION_IMPORTANCE_LABEL[i]}</option>
              ))}
            </select>
          </label>
          {!current.matches.some((m) => m.phase === '3rd') && (
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted">3ème place (manuel)</span>
              <select
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={current.manualThird ?? ''}
                onChange={(e) => setCurrent({ ...current, manualThird: e.target.value || undefined })}
              >
                <option value="">— Non désigné —</option>
                {current.teamIds
                  .filter((id) => id !== current.winner)
                  .filter((id) => {
                    const finalMatch = current.matches.find((m) => m.phase === 'F' && m.status === 'completed');
                    return !(finalMatch && (finalMatch.homeTeamId === id || finalMatch.awayTeamId === id));
                  })
                  .map((id) => (
                    <option key={id} value={id}>{current.teamSnapshot?.[id]?.name ?? id}</option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

