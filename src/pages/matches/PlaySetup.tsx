import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import type { Formation, SavedTactic, Team, TeamTactics, TacticStyle } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';
import { COACH_TRAIT_LABEL, computeCoachBonuses } from '@/lib/gen/coach';
import type { MatchRules, Speed } from '@/lib/sim/types';
import { DEFAULT_RULES } from '@/lib/sim/types';
import { useTeams } from '@/stores/teams';
import { useSession } from '@/stores/session';
import { useMatch } from '@/stores/match';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { resolveActiveTactic, loadLocalSavedTactics } from '@/lib/localTactics';

const FORMATIONS: Formation[] = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2', '4-1-4-1', '3-4-3', '4-3-2-1', '4-5-1', '4-4-1-1', '3-4-1-2', '5-4-1', '3-6-1'];

export default function PlaySetup() {
  const teams = useTeams((s) => s.teams);
  const refresh = useTeams((s) => s.refresh);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const session = useSession((s) => s.session);
  const start = useMatch((s) => s.start);
  const navigate = useNavigate();
  const { ownerId, prApiToken: effectivePat } = useBackendArgs();

  const myTeam = teams.find((t) => t.managerDiscordId === session?.id);

  const [homeTactics, setHomeTactics] = useState<TeamTactics | null>(null);
  const [homeFormation, setHomeFormation] = useState<Formation>('4-3-3');
  const [homeSavedTactics, setHomeSavedTactics] = useState<SavedTactic[]>([]);

  const [awaySlug, setAwaySlug] = useState<string>('');
  const [awayFormation, setAwayFormation] = useState<Formation>('4-3-3');
  const [awayTactics, setAwayTactics] = useState<TeamTactics | null>(null);
  const [awaySavedTactics, setAwaySavedTactics] = useState<SavedTactic[]>([]);

  const [speed, setSpeed] = useState<Speed>('1');
  const [rules, setRules] = useState<MatchRules>(DEFAULT_RULES);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ownerId && teams.length === 0) refresh(ownerId, null, effectivePat);
  }, [effectivePat, teams.length, refresh]);

  useEffect(() => {
    if (!myTeam) return;
    const tactics = resolveActiveTactic(myTeam) ?? null;
    setHomeTactics(tactics);
    if (tactics) setHomeFormation(tactics.formation);
    const local = loadLocalSavedTactics(myTeam.id);
    setHomeSavedTactics(local.savedTactics.length > 0 ? local.savedTactics : (myTeam.savedTactics ?? []));
  }, [myTeam?.id]);

  function handleAwaySlug(slug: string) {
    setAwaySlug(slug);
    const t = teams.find((x) => x.slug === slug);
    const tactics = t ? (resolveActiveTactic(t) ?? null) : null;
    setAwayTactics(tactics);
    if (tactics) setAwayFormation(tactics.formation);
    const local = t ? loadLocalSavedTactics(t.id) : { savedTactics: [] };
    setAwaySavedTactics(local.savedTactics.length > 0 ? local.savedTactics : (t?.savedTactics ?? []));
  }

  async function launch() {
    if (!myTeam) { toast('error', 'Aucune équipe associée à votre compte.'); return; }
    if (!awaySlug) { toast('error', "Choisis l'équipe adverse."); return; }
    setBusy(true);
    try {
      const [home, away] = await Promise.all([
        fetchTeam(myTeam.slug, ownerId, null, effectivePat),
        fetchTeam(awaySlug, ownerId, null, effectivePat),
      ]);
      if (!home || !away) { toast('error', 'Impossible de charger les équipes.'); return; }
      if (home.players.length < 11 || away.players.length < 11) {
        toast('error', 'Chaque équipe doit avoir au moins 11 joueurs.');
        return;
      }
      const matchId = crypto.randomUUID();
      const homeCustomStyle = homeTactics?.activeCustomStyleId
        ? homeTactics.customStyles?.find((s) => s.id === homeTactics.activeCustomStyleId)
        : undefined;
      const awayCustomStyle = awayTactics?.activeCustomStyleId
        ? awayTactics.customStyles?.find((s) => s.id === awayTactics.activeCustomStyleId)
        : undefined;
      start({
        matchId,
        home: {
          team: home.team,
          players: home.players,
          formation: homeFormation,
          formationLabel: homeTactics?.formationLabel,
          lineup: homeTactics?.lineup,
          bench: homeTactics?.bench,
          plannedSubs: homeTactics?.plannedSubs,
          tacticStyle: homeTactics?.style as TacticStyle | undefined,
          customTacticStyle: homeCustomStyle,
          positionMap: homeTactics?.positionMap,
          tokenPositions: homeTactics?.tokenPositions,
          hasTactic: !!homeTactics,
        },
        away: {
          team: away.team,
          players: away.players,
          formation: awayFormation,
          formationLabel: awayTactics?.formationLabel,
          lineup: awayTactics?.lineup,
          bench: awayTactics?.bench,
          plannedSubs: awayTactics?.plannedSubs,
          tacticStyle: awayTactics?.style as TacticStyle | undefined,
          customTacticStyle: awayCustomStyle,
          positionMap: awayTactics?.positionMap,
          tokenPositions: awayTactics?.tokenPositions,
          hasTactic: !!awayTactics,
        },
        speed,
        rules,
      });
      navigate(`/match/${matchId}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setBusy(false);
    }
  }

  const opponentTeams = teams.filter((t) => t.slug !== myTeam?.slug);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/my-team')}>
          ← Retour
        </Button>
      </div>
      <div>
        <h1 className="font-display text-4xl">Jouer un match</h1>
        <p className="text-muted">Choisis ton adversaire et lance la simulation.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Home — user's team */}
        <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-widest text-muted">Domicile — Mon équipe</div>
          {myTeam ? (
            <>
              <div className="flex items-center gap-3">
                <img src={myTeam.flag} alt="" className="h-12 w-12 object-cover" />
                <div className="text-sm">
                  <div className="font-medium">{myTeam.name}</div>
                  <div className="text-xs text-muted">Force {myTeam.globalStrength} · {myTeam.playerCount} joueurs</div>
                </div>
              </div>
              {homeSavedTactics.length > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Tactique</span>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                    value={(homeTactics as SavedTactic | null)?.id ?? ''}
                    onChange={(e) => {
                      const t = homeSavedTactics.find((x) => x.id === e.target.value) ?? null;
                      setHomeTactics(t);
                      if (t) setHomeFormation(t.formation);
                    }}
                  >
                    <option value="">— Aucune (auto) —</option>
                    {homeSavedTactics.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} · {t.formationLabel ?? t.formation}</option>
                    ))}
                  </select>
                </label>
              )}
              {homeTactics && (
                <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">
                  ✓ {(homeTactics as SavedTactic).name ?? 'Compo'} · {homeTactics.formationLabel ?? homeTactics.formation} · {(() => {
                    if (homeTactics.activeCustomStyleId) {
                      const cs = homeTactics.customStyles?.find((s) => s.id === homeTactics.activeCustomStyleId);
                      if (cs) return `🎨 ${cs.name}`;
                    }
                    return TACTIC_STYLE_LABEL[homeTactics.style];
                  })()}
                </div>
              )}
              {myTeam.coach && (
                <CoachCard team={myTeam} />
              )}
              {!homeTactics && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Formation</span>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                    value={homeFormation}
                    onChange={(e) => setHomeFormation(e.target.value as Formation)}
                  >
                    {FORMATIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-border bg-bg p-4 text-sm text-muted">
              Aucune équipe associée à votre compte Discord.
            </div>
          )}
        </section>

        {/* Away — pick any team */}
        <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <div className="text-xs uppercase tracking-widest text-muted">Extérieur</div>
          <select
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={awaySlug}
            onChange={(e) => handleAwaySlug(e.target.value)}
          >
            <option value="">— Choisir l'adversaire —</option>
            {opponentTeams.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
          {awaySlug && (() => {
            const t = teams.find((x) => x.slug === awaySlug);
            if (!t) return null;
            return (
              <>
                <div className="flex items-center gap-3">
                  <img src={t.flag} alt="" className="h-12 w-12 object-cover" />
                  <div className="text-sm">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted">Force {t.globalStrength} · {t.playerCount} joueurs</div>
                  </div>
                </div>
                {awaySavedTactics.length > 0 && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted">Tactique adverse</span>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                      value={(awayTactics as SavedTactic | null)?.id ?? ''}
                      onChange={(e) => {
                        const tac = awaySavedTactics.find((x) => x.id === e.target.value) ?? null;
                        setAwayTactics(tac);
                        if (tac) setAwayFormation(tac.formation);
                      }}
                    >
                      <option value="">— Aucune (auto) —</option>
                      {awaySavedTactics.map((tac) => (
                        <option key={tac.id} value={tac.id}>{tac.name} · {tac.formationLabel ?? tac.formation}</option>
                      ))}
                    </select>
                  </label>
                )}
                {awayTactics && (
                  <div className="rounded border border-border bg-bg px-3 py-2 text-xs text-muted">
                    {(awayTactics as SavedTactic).name ?? 'Compo'} · {awayTactics.formationLabel ?? awayTactics.formation} · {(() => {
                      if (awayTactics.activeCustomStyleId) {
                        const cs = awayTactics.customStyles?.find((s) => s.id === awayTactics.activeCustomStyleId);
                        if (cs) return `🎨 ${cs.name}`;
                      }
                      return TACTIC_STYLE_LABEL[awayTactics.style];
                    })()}
                  </div>
                )}
                {t.coach && <CoachCard team={t} />}
                {!awayTactics && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted">Formation</span>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                      value={awayFormation}
                      onChange={(e) => setAwayFormation(e.target.value as Formation)}
                    >
                      {FORMATIONS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            );
          })()}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <label className="block text-sm">
          <span className="mb-2 block text-muted">Vitesse de simulation</span>
          <div className="flex flex-wrap gap-2">
            {(['0.5', '1', '2', '5', 'instant'] as Speed[]).map((s) => (
              <Button key={s} size="sm" variant={speed === s ? 'primary' : 'ghost'} onClick={() => setSpeed(s)}>
                {s === 'instant' ? 'Instant' : `×${s}`}
              </Button>
            ))}
          </div>
        </label>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5 space-y-4">
        <div className="text-xs uppercase tracking-widest text-muted">Règles du match</div>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={rules.noOffside}
            onChange={(e) => setRules({ ...rules, noOffside: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          Hors-jeu désactivé
        </label>
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted">Remplacements max</span>
          <select
            value={rules.maxSubs}
            onChange={(e) => setRules({ ...rules, maxSubs: Number(e.target.value) as 3 | 5 })}
            className="h-8 rounded border border-border bg-surface px-2 text-sm"
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={rules.extraTime}
            onChange={(e) => setRules({ ...rules, extraTime: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          Prolongations (2×15 min si égalité à 90')
        </label>
        {rules.extraTime && (
          <label className="flex items-center gap-3 text-sm cursor-pointer pl-6">
            <input
              type="checkbox"
              checked={rules.goldenGoal}
              onChange={(e) => setRules({ ...rules, goldenGoal: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            But en or
          </label>
        )}
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={rules.penalties}
            onChange={(e) => setRules({ ...rules, penalties: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          Tirs au but {rules.extraTime ? 'si toujours à égalité après les prolongations' : "si égalité à 90'"}
        </label>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={launch} size="lg" disabled={busy || !myTeam}>
          {busy ? <Spinner className="mr-2" /> : null}
          Démarrer le match
        </Button>
      </div>
    </main>
  );
}

function CoachCard({ team }: { team: Team }) {
  if (!team.coach) return null;
  return (
    <div className={`rounded border px-3 py-2 space-y-2 ${team.coachSuspended ? 'border-danger/30 bg-danger/5' : 'border-border bg-bg'}`}>
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${team.coachSuspended ? 'line-through text-muted' : ''}`}>
          {team.coach.firstName} {team.coach.lastName}
        </span>
        <span className="text-muted">OVR {team.coach.overall}</span>
      </div>
      {team.coachSuspended && (
        <div className="text-xs text-danger font-medium">🟥 Suspendu — aucun bonus ce match</div>
      )}
      <div className="flex flex-wrap gap-1">
        {(team.coach.positiveTraits ?? (team.coach.trait ? [team.coach.trait] : [])).map(t => (
          <span key={t} className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400 border border-green-500/20">{COACH_TRAIT_LABEL[t]}</span>
        ))}
        {(team.coach.negativeTraits ?? []).map(t => (
          <span key={t} className="rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger border border-danger/20">{COACH_TRAIT_LABEL[t]}</span>
        ))}
      </div>
      <div className="text-xs text-muted">
        {(() => {
          const b = computeCoachBonuses(team.coach!);
          const parts: string[] = [];
          if (b.attackMult > 1.01) parts.push(`+${Math.round((b.attackMult - 1) * 100)}% ATK`);
          if (b.attackMult < 0.99) parts.push(`${Math.round((b.attackMult - 1) * 100)}% ATK`);
          if (b.midfieldMult > 1.01) parts.push(`+${Math.round((b.midfieldMult - 1) * 100)}% MID`);
          if (b.midfieldMult < 0.99) parts.push(`${Math.round((b.midfieldMult - 1) * 100)}% MID`);
          if (b.defenseMult > 1.01) parts.push(`+${Math.round((b.defenseMult - 1) * 100)}% DEF`);
          if (b.defenseMult < 0.99) parts.push(`${Math.round((b.defenseMult - 1) * 100)}% DEF`);
          if (b.foulRateMult < 0.99) parts.push(`-${Math.round((1 - b.foulRateMult) * 100)}% fautes`);
          if (b.foulRateMult > 1.01) parts.push(`+${Math.round((b.foulRateMult - 1) * 100)}% fautes`);
          if (b.shotFreqMult > 1.01) parts.push(`+${Math.round((b.shotFreqMult - 1) * 100)}% tirs`);
          if (b.shotFreqMult < 0.99) parts.push(`${Math.round((b.shotFreqMult - 1) * 100)}% tirs`);
          return parts.join(' · ') || 'Aucun bonus net';
        })()}
      </div>
    </div>
  );
}
