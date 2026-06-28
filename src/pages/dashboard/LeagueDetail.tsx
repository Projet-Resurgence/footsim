import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import type { League, Division, LeagueClub, SeasonState } from '@/lib/types';
import { useLeagues } from '@/stores/leagues';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { useSession } from '@/stores/session';
import { buildRoundRobin, simulateDay } from '@/lib/sim/season';

export default function LeagueDetail() {
  const { leagueId: encoded = '' } = useParams<{ leagueId: string }>();
  const leagueId = decodeURIComponent(encoded);
  const { ownerId, prApiToken, isAdmin } = useBackendArgs();
  const session = useSession((s) => s.session);
  const loadLeague = useLeagues((s) => s.loadLeague);
  const saveLeague = useLeagues((s) => s.saveLeague);
  const removeLeague = useLeagues((s) => s.removeLeague);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const navigate = useNavigate();

  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'clubs' | 'saison' | 'params'>('clubs');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingLeague, setDeletingLeague] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [simulatingDay, setSimulatingDay] = useState(false);
  const [simulatingAll, setSimulatingAll] = useState(false);
  const [startDate, setStartDate] = useState('');

  // nationSlug is encoded before the first "/" in leagueId
  const nationSlug = leagueId.includes('/') ? leagueId.split('/')[0] : '';

  useEffect(() => {
    setLoading(true);
    loadLeague(leagueId, null, prApiToken)
      .then((l) => {
        if (!l) toast('error', 'Championnat introuvable.');
        setLeague(l);
        setStartDate(l?.season?.startDate ?? '');
      })
      .catch((err) => toast('error', String(err)))
      .finally(() => setLoading(false));
  }, [leagueId, prApiToken, loadLeague]);

  function mutate(next: League) {
    setLeague(next);
    setDirty(true);
  }

  async function publish() {
    if (!league) return;
    setSaving(true);
    try {
      await saveLeague(league, null, prApiToken);
      setDirty(false);
      toast('success', 'Championnat sauvegardé.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLeague() {
    if (!league) return;
    setDeletingLeague(true);
    try {
      await removeLeague(league.id, league.nationSlug, null, prApiToken);
      toast('success', 'Championnat supprimé.');
      navigate(`/dashboard/teams/${league.nationSlug}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setDeletingLeague(false);
    }
  }

  function deleteClub(divisionId: string, clubId: string) {
    if (!league) return;
    mutate({
      ...league,
      divisions: league.divisions.map((d) =>
        d.id === divisionId
          ? { ...d, clubs: d.clubs.filter((c) => c.id !== clubId) }
          : d,
      ),
    });
  }

  async function generateSeason() {
    if (!league) return;
    const allClubs = league.divisions.flatMap((d) => d.clubs);
    if (allClubs.length < 2) { toast('error', 'Ajoute au moins 2 clubs pour générer une saison.'); return; }

    const divisionSeasons = league.divisions
      .filter((d) => d.clubs.length >= 2)
      .map((d) => buildRoundRobin(d));

    const season: SeasonState = {
      status: 'scheduled',
      startDate: startDate || undefined,
      currentDay: 0,
      divisionSeasons,
    };
    mutate({ ...league, season });
    toast('success', 'Calendrier généré. Publie pour sauvegarder.');
  }

  async function cancelSeason() {
    if (!league?.season) return;
    mutate({ ...league, season: { ...league.season, status: 'cancelled' } });
    toast('success', 'Saison annulée.');
  }

  async function handleSimulateDay() {
    if (!league?.season) return;
    const season = league.season;
    const day = season.currentDay;
    const totalDays = Math.max(...season.divisionSeasons.map((ds) => ds.schedule.length));
    if (day >= totalDays) { toast('error', 'Tous les matchs joués.'); return; }

    setSimulatingDay(true);
    try {
      const roster = await fetchTeam(league.nationSlug, ownerId, null, prApiToken);
      const allPlayers = roster?.players ?? [];
      const updated = await simulateDay(season, day, allPlayers, league.divisions);
      mutate({ ...league, season: { ...updated, status: updated.currentDay >= totalDays ? 'finished' : 'running' } });
      await saveLeague({ ...league, season: { ...updated, status: updated.currentDay >= totalDays ? 'finished' : 'running' } }, null, prApiToken);
      setDirty(false);
      toast('success', `Journée ${day + 1} simulée.`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSimulatingDay(false);
    }
  }

  async function handleSimulateAll() {
    if (!league?.season) return;
    setSimulatingAll(true);
    try {
      const roster = await fetchTeam(league.nationSlug, ownerId, null, prApiToken);
      const allPlayers = roster?.players ?? [];
      let season = league.season;
      const totalDays = Math.max(...season.divisionSeasons.map((ds) => ds.schedule.length));
      while (season.currentDay < totalDays) {
        season = await simulateDay(season, season.currentDay, allPlayers, league.divisions);
      }
      const finalSeason = { ...season, status: 'finished' as const };
      mutate({ ...league, season: finalSeason });
      await saveLeague({ ...league, season: finalSeason }, null, prApiToken);
      setDirty(false);
      toast('success', 'Saison terminée.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSimulatingAll(false);
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <SkeletonCard lines={1} />
      {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  );
  if (!league) return <div className="space-y-3"><p className="text-danger">Championnat introuvable.</p><Button variant="ghost" onClick={() => navigate(-1)}>Retour</Button></div>;

  const totalDays = league.season
    ? Math.max(...league.season.divisionSeasons.map((ds) => ds.schedule.length), 0)
    : 0;
  const canSimulate = isAdmin || league.ownerId === session?.id;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs text-muted">
            <Link to={`/dashboard/teams/${nationSlug}`} className="hover:text-accent">
              {nationSlug}
            </Link>
            {' '}/ Championnats
          </div>
          <h1 className="font-display text-4xl">{league.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {league.divisions.length} division{league.divisions.length > 1 ? 's' : ''} · {league.divisions.reduce((s, d) => s + d.clubs.length, 0)} clubs
            {league.season ? ` · Saison ${league.season.status}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {dirty && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warning">Non sauvegardé</span>
              <Button size="sm" onClick={publish} disabled={saving}>
                {saving ? <Spinner className="mr-1" /> : null}
                Sauvegarder
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-4 py-2">
          <span className="text-sm text-warning">Modifications non sauvegardées.</span>
          <Button size="sm" onClick={publish} disabled={saving}>
            {saving ? <Spinner className="mr-1" /> : null}
            Sauvegarder
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['clubs', 'saison', 'params'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'clubs' ? 'Clubs' : t === 'saison' ? 'Saison' : 'Paramètres'}
          </button>
        ))}
      </div>

      {/* === CLUBS TAB === */}
      {tab === 'clubs' && (
        <div className="space-y-8">
          {league.divisions.map((div) => (
            <DivisionSection
              key={div.id}
              division={div}
              leagueId={leagueId}
              canEdit={canSimulate}
              onDeleteClub={(clubId) => deleteClub(div.id, clubId)}
            />
          ))}
        </div>
      )}

      {/* === SAISON TAB === */}
      {tab === 'saison' && (
        <div className="space-y-6">
          {!league.season || league.season.status === 'cancelled' ? (
            <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
              <h2 className="font-display text-xl">Générer une saison</h2>
              <p className="text-sm text-muted">
                Calendrier round-robin double pour chaque division. Chaque journée regroupe tous les matchs simultanés.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Date de début (optionnel)</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
                />
              </label>
              {canSimulate && (
                <Button onClick={generateSeason}>
                  Générer le calendrier
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Progress */}
              <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl">
                    Journée {league.season.currentDay} / {totalDays}
                  </h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    league.season.status === 'finished' ? 'bg-accent/10 text-accent' :
                    league.season.status === 'running' ? 'bg-warning/10 text-warning' :
                    'bg-border text-muted'
                  }`}>
                    {league.season.status === 'finished' ? 'Terminée' :
                     league.season.status === 'running' ? 'En cours' : 'Planifiée'}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-accent transition-[width] duration-300"
                    style={{ width: `${totalDays > 0 ? (league.season.currentDay / totalDays) * 100 : 0}%` }}
                  />
                </div>
                {league.season.startDate && (
                  <p className="text-xs text-muted">Début : {new Date(league.season.startDate).toLocaleDateString('fr-FR')}</p>
                )}
                {canSimulate && league.season.status !== 'finished' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleSimulateDay} disabled={simulatingDay || simulatingAll}>
                      {simulatingDay ? <Spinner className="mr-1" /> : null}
                      Simuler journée {league.season.currentDay + 1}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleSimulateAll} disabled={simulatingDay || simulatingAll}>
                      {simulatingAll ? <Spinner className="mr-1" /> : null}
                      Tout simuler
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelSeason} disabled={simulatingDay || simulatingAll}>
                      Annuler la saison
                    </Button>
                  </div>
                )}
              </div>

              {/* Standings per division */}
              {league.season.divisionSeasons.map((ds) => {
                const div = league.divisions.find((d) => d.id === ds.divisionId);
                if (!div) return null;
                return (
                  <StandingsTable key={ds.divisionId} division={div} divisionSeason={ds} />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === PARAMS TAB === */}
      {tab === 'params' && canSimulate && (
        <div className="max-w-sm space-y-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="font-display text-xl">Paramètres</h2>
          <div className="border-t border-border pt-4">
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-sm text-danger">Supprimer définitivement ce championnat ?</p>
                <div className="flex gap-2">
                  <Button variant="danger" onClick={handleDeleteLeague} disabled={deletingLeague}>
                    {deletingLeague ? <Spinner className="mr-1" /> : null}
                    Confirmer
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                Supprimer le championnat
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DivisionSection({
  division, leagueId, canEdit, onDeleteClub,
}: {
  division: Division;
  leagueId: string;
  canEdit: boolean;
  onDeleteClub: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">{division.name}</h2>
        {canEdit && (
          <Link to={`/dashboard/leagues/${encodeURIComponent(leagueId)}/divisions/${division.id}/clubs/new`}>
            <Button size="sm">+ Club</Button>
          </Link>
        )}
      </div>

      {division.clubs.length === 0 ? (
        <p className="text-sm text-muted">Aucun club dans cette division.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {division.clubs.map((club) => (
            <ClubCard
              key={club.id}
              club={club}
              confirming={confirmId === club.id}
              canEdit={canEdit}
              onDelete={() => {
                if (confirmId === club.id) { onDeleteClub(club.id); setConfirmId(null); }
                else setConfirmId(club.id);
              }}
              onCancelDelete={() => setConfirmId(null)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ClubCard({ club, confirming, canEdit, onDelete, onCancelDelete }: {
  club: LeagueClub;
  confirming: boolean;
  canEdit: boolean;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        {club.logo ? (
          <img src={club.logo} alt="" className="h-14 w-14 object-contain" />
        ) : (
          <div className="h-14 w-14 rounded-md bg-border" />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium">{club.name}</div>
          <div className="text-xs text-muted">Force {club.globalStrength}</div>
          <div className="text-xs text-muted">{club.playerIds.length} joueurs</div>
        </div>
      </div>
      {canEdit && (
        <div className="flex gap-2 border-t border-border pt-2">
          {confirming ? (
            <>
              <button onClick={onDelete} className="text-xs text-danger hover:text-danger/70">Confirmer</button>
              <button onClick={onCancelDelete} className="text-xs text-muted hover:text-text">Annuler</button>
            </>
          ) : (
            <button onClick={onDelete} className="text-xs text-muted hover:text-danger transition-colors">Supprimer</button>
          )}
        </div>
      )}
    </div>
  );
}

function StandingsTable({ division, divisionSeason }: {
  division: Division;
  divisionSeason: import('@/lib/types').DivisionSeason;
}) {
  const clubMap = new Map(division.clubs.map((c) => [c.id, c]));

  return (
    <div className="space-y-2">
      <h3 className="font-display text-lg">{division.name}</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-muted">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Club</th>
              <th className="px-3 py-2 text-center">J</th>
              <th className="px-3 py-2 text-center">V</th>
              <th className="px-3 py-2 text-center">N</th>
              <th className="px-3 py-2 text-center">D</th>
              <th className="px-3 py-2 text-center">BP</th>
              <th className="px-3 py-2 text-center">BC</th>
              <th className="px-3 py-2 text-center font-bold text-text">Pts</th>
            </tr>
          </thead>
          <tbody>
            {divisionSeason.table.map((row, idx) => {
              const club = clubMap.get(row.clubId);
              const played = row.w + row.d + row.l;
              return (
                <tr key={row.clubId} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-muted">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {club?.logo && <img src={club.logo} alt="" className="h-5 w-5 object-contain" />}
                      <span>{club?.name ?? row.clubId}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-muted">{played}</td>
                  <td className="px-3 py-2 text-center">{row.w}</td>
                  <td className="px-3 py-2 text-center">{row.d}</td>
                  <td className="px-3 py-2 text-center">{row.l}</td>
                  <td className="px-3 py-2 text-center">{row.gf}</td>
                  <td className="px-3 py-2 text-center">{row.ga}</td>
                  <td className="px-3 py-2 text-center font-bold text-accent">{row.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
