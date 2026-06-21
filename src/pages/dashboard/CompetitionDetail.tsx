import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { StandingsTable } from '@/components/competition/StandingsTable';
import { BracketView } from '@/components/competition/BracketView';
import { CompetitionStats } from '@/components/competition/CompetitionStats';
import { DrawCeremony } from '@/components/competition/DrawCeremony';
import { PreMatchModal } from '@/components/competition/PreMatchModal';
import { useCompetition } from '@/stores/competition';
import { useTeams } from '@/stores/teams';
import { useCredentials } from '@/stores/credentials';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { useSession } from '@/stores/session';
import { needsKnockoutDraw, getQualifiersByRank, seedKnockoutWithOrder } from '@/lib/competition/scheduler';
import { buildKnockoutPots, conductKnockoutDraw } from '@/lib/competition/draw';
import type { DrawResult } from '@/lib/competition/draw';
import type { Competition, CompMatch, PlayerCompStats } from '@/lib/competition/types';
import type { CorruptionDeal } from '@/lib/sim/types';
import type { Team } from '@/lib/types';
import { env } from '@/lib/env';
import { moraleLabel, MORALE_DEFAULT } from '@/lib/competition/morale';
import type { PressItem } from '@/lib/competition/press';
import { PRESS_CATEGORY_COLOR, PRESS_CATEGORY_LABEL } from '@/lib/competition/press';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'bracket' | 'rounds' | 'stats' | 'presse'>('overview');
  const [knockoutDraw, setKnockoutDraw] = useState<DrawResult | null>(null);
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
    toast('success', 'Tirage phase finale effectué. Sauvegardez pour conserver.');
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
    } else {
      navigate(`/competition/${current.id}/round/${round}`);
    }
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
            {current.format === 'league' ? 'Championnat' : current.format === 'cup' ? 'Coupe' : 'Groupes + Phase finale'}
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

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(['overview', 'bracket', 'rounds', 'stats', 'presse'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {tab === 'overview' ? 'Classement' : tab === 'bracket' ? 'Tableau' : tab === 'rounds' ? 'Journées' : tab === 'stats' ? 'Statistiques' : '📰 Presse'}
            {tab === 'presse' && (current.pressItems?.length ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{current.pressItems!.length}</span>
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
              {!isLeague && !isGroupsKO && (
                <p className="text-muted text-sm">Format coupe — pas de classement général.</p>
              )}
            </div>
          )}

          {activeTab === 'bracket' && (
            <div className="space-y-4">
              {isLeague ? (
                <p className="text-muted text-sm">Format ligue — utilise l'onglet Journées.</p>
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
        const label = competition.format === 'league'
          ? `Journée ${round}`
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
}: {
  match: CompMatch;
  teamMap: Record<string, Team>;
  canSimulate: boolean;
  onSimulate: () => void;
}) {
  const home = match.homeTeamId ? teamMap[match.homeTeamId] : null;
  const away = match.awayTeamId ? teamMap[match.awayTeamId] : null;
  const done = match.status === 'completed';
  const canSim = canSimulate && match.status === 'pending' && match.homeTeamId && match.awayTeamId;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${done ? 'border-border/50 bg-surface/50' : 'border-border bg-surface'}`}>
      <TeamCell team={home} side="home" />
      <div className="flex-1 text-center font-display tabular-nums">
        {done && match.result ? (
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
      <TeamCell team={away} side="away" />
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
  const sorted = [...pressItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const filtered = filter === 'all' ? sorted : sorted.filter((p) => p.teamId === filter);

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
        <div className="flex items-center gap-3">
          <h3 className="text-xs uppercase tracking-widest text-muted">Articles</h3>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ml-auto h-7 rounded border border-border bg-surface px-2 text-xs"
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

function TeamCell({ team, side }: { team: Team | null; side: 'home' | 'away' }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 flex-1 ${side === 'away' ? 'flex-row-reverse text-right' : ''}`}>
      {team?.flag ? (
        <img src={team.flag} alt="" className="h-6 w-6 object-cover rounded-sm shrink-0" />
      ) : (
        <div className="h-6 w-6 rounded-sm bg-border shrink-0" />
      )}
      <span className="truncate text-sm">{team?.name ?? 'À définir'}</span>
    </div>
  );
}
