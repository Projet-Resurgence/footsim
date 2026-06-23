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
import { useCredentials } from '@/stores/credentials';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { useSession } from '@/stores/session';
import { needsKnockoutDraw, getQualifiersByRank, seedKnockoutWithOrder, sortStandings, seedLPMPlayoffs } from '@/lib/competition/scheduler';
import { LPMDrawCeremony, type LPMPair } from '@/components/competition/LPMDrawCeremony';
import { buildKnockoutPots, conductKnockoutDraw } from '@/lib/competition/draw';
import type { DrawResult } from '@/lib/competition/draw';
import type { Competition, CompMatch, PlayerCompStats, CompHistoryEntry, CompetitionKind, CompetitionScope } from '@/lib/competition/types';
import { COMPETITION_KIND_LABEL, COMPETITION_SCOPE_LABEL } from '@/lib/competition/types';
import type { CorruptionDeal } from '@/lib/sim/types';
import type { Team } from '@/lib/types';
import { env } from '@/lib/env';
import { moraleLabel, MORALE_DEFAULT } from '@/lib/competition/morale';
import type { PressItem, PressMention, PressMentionPlayer, PressMentionCoach } from '@/lib/competition/press';
import { PRESS_CATEGORY_COLOR, PRESS_CATEGORY_LABEL, generateCmfItems } from '@/lib/competition/press';
import { COACH_TRAIT_LABEL, COACH_TRAIT_DESCRIPTION } from '@/lib/gen/coach';
import { batchUpdateTeamCompHistory } from '@/lib/github/store';
import { commitFiles, readJson as ghReadJson } from '@/lib/github/api';
import type { Injury, Suspension } from '@/lib/competition/injuries';
import { SEVERITY_COLOR, CAUSE_LABEL } from '@/lib/competition/injuries';

export default function CompetitionDetail() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const isPublicView = pathname.startsWith('/competition-view');
  const backTo = isPublicView ? '/my-team' : '/dashboard/competitions';
  const backLabel = isPublicView ? '← My Team' : '← Compétitions';
  const load = useCompetition((s) => s.load);
  const save = useCompetition((s) => s.save);
  const remove = useCompetition((s) => s.remove);
  const setCurrent = useCompetition((s) => s.setCurrent);
  const current = useCompetition((s) => s.current);
  const dirty = useCompetition((s) => s.dirty);
  const teams = useTeams((s) => s.teams);
  const refreshTeams = useTeams((s) => s.refresh);
  const pat = useCredentials((s) => s.githubPat);
  const navigate = useNavigate();
  const { ownerId, pat: effectivePat } = useBackendArgs();
  const isAdmin = useSession((s) => s.isAdmin());

  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bracket' | 'rounds' | 'stats' | 'presse' | 'medical' | 'suspensions'>('overview');
  const [knockoutDraw, setKnockoutDraw] = useState<DrawResult | null>(null);
  const [lpmDraw, setLpmDraw] = useState<LPMPair[] | null>(null);
  const [roundDraw, setRoundDraw] = useState<{ round: number; pairs: LPMPair[]; isScheduleDraw?: boolean } | null>(null);
  const [preMatchModal, setPreMatchModal] = useState<{ matchId: string; home: Team; away: Team } | null>(null);

  // For public repos, reads work without a token. PAT only needed for writes.
  const readToken = pat ?? env.githubReadToken ?? '';

  useEffect(() => {
    if (!id) { setLoading(false); return; }

    async function init() {
      // Load competition first (usually instant from localStorage)
      const comp = current?.id === id ? current : await load(id!, readToken);

      // If teamSnapshot covers all teamIds, skip the expensive listTeams call entirely.
      // Teams store is still loaded lazily when admin needs it (handleSync, handleDelete use teams directly).
      const snapshotIds = new Set(Object.keys(comp?.teamSnapshot ?? {}));
      const allCovered = comp != null && comp.teamIds.every((tid) => snapshotIds.has(tid));

      if (!allCovered && teams.length === 0) {
        await refreshTeams(ownerId, effectivePat ?? null);
      }
    }

    init().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, readToken]);

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
    });
    if (cmfDebut.length === 0) return;
    const updated = {
      ...current,
      cmfDebutGenerated: true,
      pressItems: [...(current.pressItems ?? []), ...cmfDebut],
    };
    setCurrent(updated);
    if (pat) save(updated, pat).catch(() => {/* non-blocking */});
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
        {isAdmin && pat && id && (
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              try {
                await remove(id, pat);
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
    if (teams.length === 0) await refreshTeams(ownerId, effectivePat);
  }

  async function handleSync() {
    if (!pat || !current) return;
    await ensureTeams();
    setSyncing(true);
    try {
      await save(current, pat);

      // When competition is completed, append compHistory — one Git commit for all teams
      if (current.status === 'completed') {
        const participating = teams.filter((t) => current.teamIds.includes(t.id));
        const reads = await Promise.all(
          participating.map(async (t) => ({ t, existing: await ghReadJson<import('@/lib/types').Team>(`data/teams/${t.slug}/team.json`, pat) })),
        );
        const files: Array<{ path: string; content: unknown }> = [];
        for (const { t, existing } of reads) {
          if (!existing) continue;
          const team = existing.data;
          const prev = team.compHistory ?? [];
          if (prev.some((e) => e.compId === current.id)) continue;
          const entry: CompHistoryEntry = {
            compId: current.id,
            compName: current.name,
            year: current.year,
            format: current.format,
            kind: current.kind,
            scope: current.scope,
            result: deriveTeamResult(t.id, current),
            phase: deriveTeamPhase(t.id, current),
          };
          files.push({ path: `data/teams/${t.slug}/team.json`, content: { ...team, compHistory: [...prev, entry] } });
        }
        if (files.length > 0) {
          await commitFiles(files, `chore(teams): add ${current.name} to palmares (${files.length} équipes)`, pat);
        }
      }

      toast('success', 'Compétition sauvegardée sur GitHub.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handlePatchSnapshot() {
    if (!pat || !current) return;
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
      await save(updated, pat);
      toast('success', 'Noms et drapeaux mis à jour.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!pat || !current) return;
    if (!confirm(`Supprimer « ${current.name} » ? Cette action est irréversible.`)) return;
    await ensureTeams();
    setDeleting(true);
    try {
      await remove(current.id, pat);
      // Strip compHistory entries from all participating teams (single commit)
      const participating = teams.filter((t) => current.teamIds.includes(t.id));
      await batchUpdateTeamCompHistory(participating.map((t) => t.slug), pat, { mode: 'remove', compId: current.id });
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
    toast('success', 'Barrages LPM générés — sauvegarde via le bouton GitHub.');
  }

  function startKnockoutDraw() {
    if (!current || !current.groups || !current.config.qualifyPerGroup) return;
    const byRank = getQualifiersByRank(current.groups, current.standings, current.config.qualifyPerGroup);
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
    toast('success', 'Tirage phase finale effectué — sauvegarde via le bouton GitHub.');
  }

  function openMatchModal(matchId: string) {
    if (!current) return;
    const m = current.matches.find((x) => x.id === matchId);
    if (!m?.homeTeamId || !m?.awayTeamId) return;
    const home = teamMap[m.homeTeamId];
    const away = teamMap[m.awayTeamId];
    if (!home || !away) return;
    setPreMatchModal({ matchId, home, away });
  }

  function launchMatch(matchId: string, corruption: CorruptionDeal | null, tactics?: { home?: import('@/lib/types').TacticStyle; away?: import('@/lib/types').TacticStyle }) {
    if (!current) return;
    if (corruption) {
      sessionStorage.setItem(`footsim.corruption.${matchId}`, JSON.stringify(corruption));
    } else {
      sessionStorage.removeItem(`footsim.corruption.${matchId}`);
    }
    const filteredTactics = { home: tactics?.home || undefined, away: tactics?.away || undefined };
    if (filteredTactics.home || filteredTactics.away) {
      sessionStorage.setItem(`footsim.tactics.${matchId}`, JSON.stringify(filteredTactics));
    } else {
      sessionStorage.removeItem(`footsim.tactics.${matchId}`);
    }
    setPreMatchModal(null);
    navigate(`/competition/${current.id}/match/${matchId}`);
  }

  async function simulateRound(round: number) {
    if (!pat || !current) return;
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
            if (isScheduleDraw && pat) {
              const updated = { ...current, drawRevealed: true };
              setCurrent(updated);
              try { await save(updated, pat); } catch { /* non-blocking */ }
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
          <h1 className="mt-2 font-display text-4xl">Tirage — Barrages de la Peur</h1>
          <p className="text-muted text-sm mt-1">{current.name}</p>
        </div>
        <LPMDrawCeremony
          pairs={lpmDraw}
          teams={allTeams}
          title="Barrages de la Peur — 8 confrontations"
          subtitle="Places 25–40 · Aller-Retour · Les vainqueurs décrochent les derniers tickets"
          pairLabels={(i) => `Match ${'ABCDEFGH'[i]}`}
          onConfirm={confirmLPMDraw}
        />
      </div>
    );
  }

  if (knockoutDraw) {
    const allQualifiedTeams = teams.filter((t) =>
      Object.values(knockoutDraw.groups).flat().includes(t.id)
    );
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
            {dirty && (
              <Button size="sm" variant="ghost" onClick={handleSync} disabled={syncing}>
                {syncing ? <Spinner className="h-4 w-4" /> : '↑ Sauvegarder'}
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
            <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Spinner className="h-4 w-4" /> : 'Supprimer'}
            </Button>
          </div>
        )}
      </div>

      {current.status === 'completed' && isAdmin && (
        <CompletedMetaEditor current={current} setCurrent={setCurrent} />
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
            <div className="font-medium">11 journées terminées — Barrages de la Peur</div>
            <div className="text-sm text-muted">Places 25–40 : génère les 8 confrontations aller-retour pour les derniers tickets.</div>
          </div>
          <Button size="sm" onClick={seedLPMBarrages}>
            ⚔ Lancer les barrages
          </Button>
        </div>
      )}

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(['overview', 'bracket', 'rounds', 'stats', 'presse', 'medical', 'suspensions'] as const).map((tab) => (
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
              : tab === 'stats' ? 'Statistiques'
              : tab === 'presse' ? 'Presse'
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
            />
          )}

          {activeTab === 'presse' && (
            <PressTab
              pressItems={current.pressItems ?? []}
              morale={current.morale ?? {}}
              teamMap={teamMap}
              teamIds={current.teamIds}
            />
          )}

          {activeTab === 'medical' && (
            <MedicalTab
              injuries={current.injuries ?? []}
              teamMap={teamMap}
              playerStats={current.playerStats ?? {}}
            />
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
          onConfirm={(corruption, tactics) => launchMatch(preMatchModal.matchId, corruption, tactics)}
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
            : `Tour ${round}${phase ? ` · ${phase}` : ''}`;

        return (
          <div
            key={round}
            className={`rounded-lg border transition-colors ${
              isCurrent && completed < total
                ? 'border-accent/40 bg-accent/3'
                : 'border-border bg-surface'
            }`}
          >
            {/* Round header */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left select-none"
              onClick={() => toggleRound(round)}
            >
              <span className={`text-sm font-semibold ${isCurrent && completed < total ? 'text-accent' : ''}`}>
                {label}
              </span>
              <span className="text-xs text-muted tabular-nums">
                {completed === total
                  ? <span className="text-green-500">✓ Terminé</span>
                  : `${completed} / ${total}`}
              </span>
              {canMultiplex && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSimulateRound(round); }}
                  className="ml-auto text-xs font-medium text-accent hover:text-accent/70 transition-colors flex items-center gap-1 shrink-0"
                >
                  ▶ Multiplex
                </button>
              )}
              {!canMultiplex && (
                <span className="ml-auto text-xs text-muted/40">{isOpen ? '▲' : '▼'}</span>
              )}
              {canMultiplex && (
                <span className="text-xs text-muted/40 ml-1">{isOpen ? '▲' : '▼'}</span>
              )}
            </button>

            {/* Match list */}
            {isOpen && (
              <div className="border-t border-border/40 divide-y divide-border/30">
                {roundMatches.map((m) => (
                  <RoundMatchRow
                    key={m.id}
                    match={m}
                    teamMap={teamMap}
                    canSimulate={canSimulate}
                    onSimulate={() => onSimulateMatch(m.id)}
                    disqualifiedTeamIds={competition.disqualifiedTeamIds ?? []}
                  />
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
        className={`flex items-center gap-2 px-4 py-2.5 text-sm ${hasSummary ? 'cursor-pointer hover:bg-surface/60' : ''}`}
        onClick={() => hasSummary && setExpanded((v) => !v)}
      >
        {/* Home */}
        <div className="flex flex-1 items-center gap-2 min-w-0 justify-end flex-row-reverse">
          {home?.flag
            ? <img src={home.flag} alt="" className={`h-5 w-5 rounded-sm object-cover shrink-0 ${homeDisq ? 'opacity-40' : ''}`} />
            : <div className="h-5 w-5 rounded-sm bg-border/40 shrink-0" />}
          <span className={`truncate text-right text-[13px] ${homeDisq ? 'line-through text-muted' : 'font-medium'}`}>
            {home?.name ?? (match.homeTeamId ? '…' : 'À définir')}
          </span>
        </div>

        {/* Score / status */}
        <div className="shrink-0 w-20 text-center font-display tabular-nums text-[13px]">
          {isWalkover ? (
            <span className="text-[10px] font-medium text-green-500 uppercase tracking-wider">Tapis vert</span>
          ) : done && match.result ? (
            <span className={`font-bold ${match.result.home > match.result.away ? 'text-accent' : match.result.home < match.result.away ? 'text-muted' : ''}`}>
              {match.result.home}
              <span className="text-muted font-normal mx-0.5">–</span>
              {match.result.away}
              {match.result.penalties && (
                <div className="text-[10px] text-muted font-normal leading-none mt-0.5">
                  {match.result.penalties.home}–{match.result.penalties.away} tab
                </div>
              )}
            </span>
          ) : canSim ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSimulate(); }}
              className="text-accent hover:text-accent/70 transition-colors text-xs font-medium"
            >
              ▶ Jouer
            </button>
          ) : (
            <span className="text-muted/40 text-xs">vs</span>
          )}
        </div>

        {/* Away */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {away?.flag
            ? <img src={away.flag} alt="" className={`h-5 w-5 rounded-sm object-cover shrink-0 ${awayDisq ? 'opacity-40' : ''}`} />
            : <div className="h-5 w-5 rounded-sm bg-border/40 shrink-0" />}
          <span className={`truncate text-[13px] ${awayDisq ? 'line-through text-muted' : ''}`}>
            {away?.name ?? (match.awayTeamId ? '…' : 'À définir')}
          </span>
        </div>

        {hasSummary && (
          <span className="text-xs text-muted/40 shrink-0 ml-1">{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {expanded && match.matchSummary && (
        <div className="border-t border-border/20 bg-surface/30 px-4 py-4 space-y-4">
          {match.matchSummary.motm && (
            <div className="flex items-center gap-3 rounded-md bg-warning/5 border border-warning/20 px-3 py-2">
              <span className="text-base">⭐</span>
              <div className="min-w-0">
                <div className="text-[10px] text-muted uppercase tracking-wide">Homme du match</div>
                <div className="font-medium text-sm truncate">{match.matchSummary.motm.playerName}</div>
                <div className="text-xs text-muted">{match.matchSummary.motm.teamName} · {match.matchSummary.motm.rating.toFixed(1)}/10</div>
              </div>
            </div>
          )}
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

function MentionPopup({ mention, onClose }: { mention: PressMention; onClose: () => void }) {
  const isPlayer = mention.type === 'player';
  const isCoach = mention.type === 'coach';
  const p = isPlayer ? (mention as PressMentionPlayer) : null;
  const c = isCoach ? (mention as PressMentionCoach) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 rounded-xl border border-border bg-surface shadow-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto"
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
          {/* Player stats */}
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

          {/* Coach stats + traits */}
          {c && (
            <>
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Attributs</div>
                {Object.entries(c.stats).map(([k, v]) => (
                  <StatBar key={k} label={COACH_STAT_LABELS[k] ?? k} value={v as number} />
                ))}
              </div>
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

function PlayerCompPopup({ stat, teamMap, onClose }: { stat: import('@/lib/competition/types').PlayerCompStats; teamMap: Record<string, Team>; onClose: () => void }) {
  const team = teamMap[stat.teamId];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 rounded-xl border border-border bg-surface shadow-2xl w-full max-w-xs"
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
        <div className="px-4 py-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-display tabular-nums">{stat.goals}</div>
            <div className="text-[10px] text-muted">Buts</div>
          </div>
          <div>
            <div className="text-xl font-display tabular-nums">{stat.assists}</div>
            <div className="text-[10px] text-muted">Passes D.</div>
          </div>
          <div>
            <div className={`text-xl font-display tabular-nums ${stat.avgRating >= 8 ? 'text-green-400' : stat.avgRating >= 7 ? 'text-accent' : stat.avgRating >= 6 ? 'text-text' : 'text-muted'}`}>
              {stat.avgRating > 0 ? stat.avgRating.toFixed(1) : '—'}
            </div>
            <div className="text-[10px] text-muted">Note moy.</div>
          </div>
          {stat.cleanSheets > 0 && (
            <div>
              <div className="text-xl font-display tabular-nums">{stat.cleanSheets}</div>
              <div className="text-[10px] text-muted">Clean sheets</div>
            </div>
          )}
          {stat.yellowCards > 0 && (
            <div>
              <div className="text-xl font-display tabular-nums text-yellow-400">{stat.yellowCards}</div>
              <div className="text-[10px] text-muted">Jaunes</div>
            </div>
          )}
          {stat.redCards > 0 && (
            <div>
              <div className="text-xl font-display tabular-nums text-danger">{stat.redCards}</div>
              <div className="text-[10px] text-muted">Rouges</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PHASE_ORDER = ['group', 'league', 'lpm_playoff', 'R64', 'R32', 'R16', 'QF', 'SF', '3rd', 'F'];

function deriveTeamPhase(teamId: string, comp: Competition): string | undefined {
  const played = comp.matches.filter(
    (m) => m.status === 'completed' && (m.homeTeamId === teamId || m.awayTeamId === teamId),
  );
  if (played.length === 0) return undefined;
  return played.reduce((best, m) => {
    const bi = PHASE_ORDER.indexOf(best);
    const mi = PHASE_ORDER.indexOf(m.phase);
    return mi > bi ? m.phase : best;
  }, played[0].phase);
}

function deriveTeamResult(teamId: string, comp: Competition): CompHistoryEntry['result'] {
  if (comp.winner === teamId) return 'winner';

  const finalMatch = comp.matches.find((m) => m.phase === 'F' && m.status === 'completed');
  if (finalMatch && (finalMatch.homeTeamId === teamId || finalMatch.awayTeamId === teamId)) {
    return 'finalist';
  }

  const thirdMatch = comp.matches.find((m) => m.phase === '3rd' && m.status === 'completed');
  if (thirdMatch) {
    const thirdWinner = thirdMatch.result
      ? (thirdMatch.result.home > thirdMatch.result.away ? thirdMatch.homeTeamId : thirdMatch.awayTeamId)
      : null;
    if (thirdWinner === teamId) return 'third';
    if (thirdMatch.homeTeamId === teamId || thirdMatch.awayTeamId === teamId) return 'semi';
  }

  const sfMatches = comp.matches.filter((m) => m.phase === 'SF' && m.status === 'completed');
  if (sfMatches.some((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)) return 'semi';

  return 'participant';
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

function PressTab({
  pressItems,
  morale,
  teamMap,
  teamIds,
}: {
  pressItems: PressItem[];
  morale: Record<string, number>;
  teamMap: Record<string, Team>;
  teamIds: string[];
}) {
  const [filter, setFilter] = useState<string>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [roundFilter, setRoundFilter] = useState<string>('all');
  const [activeMention, setActiveMention] = useState<PressMention | null>(null);
  const [matchPopup, setMatchPopup] = useState<PressItem['matchSnapshot'] | null>(null);
  const sorted = [...pressItems].sort((a, b) => b.round - a.round || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const allRounds = [...new Set(pressItems.map((p) => p.round))].sort((a, b) => b - a);
  const filtered = sorted
    .filter((p) => filter === 'all' || p.teamId === filter)
    .filter((p) => catFilter === 'all' || p.category === catFilter)
    .filter((p) => roundFilter === 'all' || p.round === Number(roundFilter));

  return (
    <div className="space-y-6">
      {activeMention && <MentionPopup mention={activeMention} onClose={() => setActiveMention(null)} />}
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
      {/* Moral board */}
      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest text-muted">Moral des équipes</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teamIds.map((tid) => {
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
        <PlayerCompPopup stat={activeStat} teamMap={teamMap} onClose={() => setActiveStat(null)} />
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
        <PlayerCompPopup stat={activeStat} teamMap={teamMap} onClose={() => setActiveStat(null)} />
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
    { label: 'Zone Rouge — Barrages de la Peur', from: 24, to: 39, borderCls: 'border-danger/40', bgCls: 'bg-danger/5' },
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
            <span className="mb-1 block text-muted">Statut</span>
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
        </div>
      )}
    </div>
  );
}

