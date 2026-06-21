import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
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
import type { Competition, CompMatch, PlayerCompStats } from '@/lib/competition/types';
import type { CorruptionDeal } from '@/lib/sim/types';
import type { Team } from '@/lib/types';
import { env } from '@/lib/env';
import { moraleLabel, MORALE_DEFAULT } from '@/lib/competition/morale';
import type { PressItem } from '@/lib/competition/press';
import { PRESS_CATEGORY_COLOR, PRESS_CATEGORY_LABEL } from '@/lib/competition/press';
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
  const [roundDraw, setRoundDraw] = useState<{ round: number; pairs: LPMPair[] } | null>(null);
  const [preMatchModal, setPreMatchModal] = useState<{ matchId: string; home: Team; away: Team } | null>(null);

  // For public repos, reads work without a token. PAT only needed for writes.
  const readToken = pat ?? env.githubReadToken ?? '';

  useEffect(() => {
    if (!id) { setLoading(false); return; }

    const teamLoad = teams.length === 0 ? refreshTeams(ownerId, effectivePat) : Promise.resolve();

    // Si la compétition est déjà en mémoire (mise à jour optimiste), on ne recharge pas depuis GitHub
    if (current?.id === id) {
      teamLoad.finally(() => setLoading(false));
      return;
    }

    Promise.all([load(id, readToken), teamLoad]).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, readToken]);

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

  async function handleSync() {
    if (!pat || !current) return;
    setSyncing(true);
    try {
      await save(current, pat);
      toast('success', 'Compétition sauvegardée sur GitHub.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handlePatchSnapshot() {
    if (!pat || !current) return;
    const snapshot: Record<string, { name: string; flag: string }> = {};
    for (const id of current.teamIds) {
      const t = teams.find((x) => x.id === id);
      if (t) snapshot[id] = { name: t.name, flag: t.flag };
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
    setDeleting(true);
    try {
      await remove(current.id, pat);
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

  function launchMatch(matchId: string, corruption: CorruptionDeal | null) {
    if (!current) return;
    // Store corruption in sessionStorage so CompetitionMatchLive can pick it up
    if (corruption) {
      sessionStorage.setItem(`footsim.corruption.${matchId}`, JSON.stringify(corruption));
    } else {
      sessionStorage.removeItem(`footsim.corruption.${matchId}`);
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
    } else if (isLPM && roundMatches[0]?.phase === 'league') {
      // LPM league rounds: show draw ceremony before launching multiplex
      const pairs: LPMPair[] = roundMatches.map((m) => ({ home: m.homeTeamId!, away: m.awayTeamId! }));
      setRoundDraw({ round, pairs });
    } else {
      navigate(`/competition/${current.id}/round/${round}`);
    }
  }

  if (roundDraw) {
    const allTeams = [...teams, ...Object.entries(current.teamSnapshot ?? {}).map(([id, s]) => ({ id, name: s.name, flag: s.flag } as Team))];
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <button onClick={() => setRoundDraw(null)} className="text-sm text-muted hover:text-text">← Retour</button>
          <h1 className="mt-2 font-display text-4xl">Tirage — Journée {roundDraw.round}</h1>
          <p className="text-muted text-sm mt-1">{current.name} · {roundDraw.pairs.length} matchs</p>
        </div>
        <LPMDrawCeremony
          pairs={roundDraw.pairs}
          teams={allTeams}
          title={`Journée ${roundDraw.round}`}
          subtitle="Tirage au sort des confrontations de la journée"
          pairLabels={(i) => `Match ${i + 1}`}
          onConfirm={() => {
            setRoundDraw(null);
            navigate(`/competition/${current.id}/round/${roundDraw.round}`);
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
          <p className="text-muted text-sm mt-1">
            {current.format === 'league' ? 'Championnat'
              : current.format === 'cup' ? 'Coupe'
              : current.format === 'lpm' ? 'LPM'
              : 'Groupes + Phase finale'}
            {' · '}
            {current.teamIds.length} équipes
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap justify-end">
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
            />
          )}

          {activeTab === 'suspensions' && (
            <SuspensionsTab
              suspensions={current.suspensions ?? []}
              teamMap={teamMap}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {preMatchModal && (
        <PreMatchModal
          home={preMatchModal.home}
          away={preMatchModal.away}
          onConfirm={(corruption) => launchMatch(preMatchModal.matchId, corruption)}
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
  const rounds = Array.from(
    new Set(competition.matches.map((m) => m.round)),
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {rounds.map((round) => {
        const roundMatches = competition.matches.filter((m) => m.round === round);
        const hasPending = roundMatches.some(
          (m) => m.status === 'pending' && m.homeTeamId && m.awayTeamId,
        );
        const label = competition.format === 'league' || (competition.format === 'lpm' && roundMatches[0]?.phase === 'league')
          ? `Journée ${round}`
          : competition.format === 'lpm' && roundMatches[0]?.phase === 'lpm_playoff'
          ? (roundMatches[0]?.leg === 1 ? 'Barrages — Match aller' : 'Barrages — Match retour')
          : roundMatches[0]?.phase === 'group'
          ? `Phase de groupes — J${round}`
          : `Tour ${round} — ${roundMatches[0]?.phase ?? ''}`;

        return (
          <div key={round} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-muted uppercase tracking-wide">{label}</div>
              {canSimulate && hasPending && roundMatches.filter((m) => m.homeTeamId && m.awayTeamId).length > 1 && (
                <button
                  onClick={() => onSimulateRound(round)}
                  className="text-xs text-accent hover:text-accent/70 transition-colors"
                >
                  ▶ Simuler tous en multiplex
                </button>
              )}
            </div>
            <div className="grid gap-2">
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
  const home = match.homeTeamId ? teamMap[match.homeTeamId] : null;
  const away = match.awayTeamId ? teamMap[match.awayTeamId] : null;
  const done = match.status === 'completed';

  const homeDisq = !!match.homeTeamId && disqualifiedTeamIds.includes(match.homeTeamId);
  const awayDisq = !!match.awayTeamId && disqualifiedTeamIds.includes(match.awayTeamId);
  const isWalkover = homeDisq || awayDisq;

  const canSim = canSimulate && match.status === 'pending' && match.homeTeamId && match.awayTeamId && !isWalkover;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
      isWalkover
        ? 'border-green-800/40 bg-green-950/30'
        : done
        ? 'border-border/50 bg-surface/50'
        : 'border-border bg-surface'
    }`}>
      <TeamCell team={home} side="home" dimmed={homeDisq} />
      <div className="flex-1 text-center font-display tabular-nums">
        {isWalkover ? (
          <span className="text-xs font-medium text-green-500 uppercase tracking-wider">Tapis vert</span>
        ) : done && match.result ? (
          <span>
            {match.result.home} – {match.result.away}
            {match.result.penalties && (
              <span className="ml-1 text-xs text-muted">
                ({match.result.penalties.home}–{match.result.penalties.away} tab)
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted">vs</span>
        )}
      </div>
      <TeamCell team={away} side="away" dimmed={awayDisq} />
      {canSim && (
        <button
          onClick={onSimulate}
          className="ml-2 shrink-0 text-xs text-accent hover:text-accent/70 transition-colors"
        >
          ▶
        </button>
      )}
      {!match.homeTeamId && !match.awayTeamId && (
        <span className="ml-2 shrink-0 text-xs text-muted">À définir</span>
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
  const sorted = [...pressItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const filtered = sorted
    .filter((p) => filter === 'all' || p.teamId === filter)
    .filter((p) => catFilter === 'all' || p.category === catFilter);

  return (
    <div className="space-y-6">
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
            {(['victoire', 'exploit', 'defaite', 'crise', 'scandale', 'neutralite', 'forme'] as const).map((c) => (
              <option key={c} value={c}>{PRESS_CATEGORY_LABEL[c]}</option>
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
            {filtered.map((item) => {
              const team = item.teamId ? teamMap[item.teamId] : null;
              const colorCls = PRESS_CATEGORY_COLOR[item.category];
              return (
                <article key={item.id} className="rounded-lg border border-border bg-surface p-4 space-y-2">
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
                      <p className="text-xs text-muted mt-1 leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                </article>
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
}: {
  injuries: Injury[];
  teamMap: Record<string, Team>;
}) {
  const teamIds = [...new Set(injuries.map((i) => i.teamId))];

  if (injuries.length === 0) {
    return <div className="py-16 text-center text-muted text-sm">Aucun joueur blessé.</div>;
  }

  return (
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
                {teamInjuries.map((inj) => (
                  <div key={inj.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={`mt-0.5 shrink-0 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_COLOR[inj.severity]}`}>
                      {inj.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{inj.playerName}</span>
                        <span className="text-[10px] text-muted">{CAUSE_LABEL[inj.cause]}</span>
                      </div>
                      <p className="text-xs text-muted mt-0.5">{inj.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-display tabular-nums text-danger">{inj.matchesRemaining}</div>
                      <div className="text-[10px] text-muted">match{inj.matchesRemaining > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SuspensionsTab({
  suspensions,
  teamMap,
}: {
  suspensions: Suspension[];
  teamMap: Record<string, Team>;
}) {
  const players = suspensions.filter((s) => s.subjectId !== 'coach');
  const coaches = suspensions.filter((s) => s.subjectId === 'coach');

  if (suspensions.length === 0) {
    return <div className="py-16 text-center text-muted text-sm">Aucune suspension en cours.</div>;
  }

  function SuspRow({ sus }: { sus: Suspension }) {
    const team = teamMap[sus.teamId];
    // Detect card type from reason string
    const isRed = /rouge|red|2e jaune|double/i.test(sus.reason);
    const cardBadge = isRed
      ? <span className="inline-block w-3 h-4 rounded-sm bg-danger shrink-0" title="Carton rouge" />
      : <span className="inline-block w-3 h-4 rounded-sm bg-yellow-400 shrink-0" title="Carton jaune" />;

    return (
      <div className="flex items-center gap-3 px-4 py-3 border-t border-border/50">
        {team?.flag && <img src={team.flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />}
        {cardBadge}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">{sus.subjectName}</span>
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

function TeamCell({ team, side, dimmed }: { team: Team | null; side: 'home' | 'away'; dimmed?: boolean }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 flex-1 ${side === 'away' ? 'flex-row-reverse text-right' : ''} ${dimmed ? 'opacity-40 line-through' : ''}`}>
      {team?.flag ? (
        <img src={team.flag} alt="" className="h-6 w-6 object-cover rounded-sm shrink-0" />
      ) : (
        <div className="h-6 w-6 rounded-sm bg-border shrink-0" />
      )}
      <span className="truncate text-sm">{team?.name ?? 'À définir'}</span>
    </div>
  );
}
