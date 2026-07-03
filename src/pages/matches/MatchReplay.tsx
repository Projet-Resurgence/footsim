import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Scoreboard } from '@/components/match/Scoreboard';
import { Pitch, KitLegend } from '@/components/match/Pitch';
import { EventFeed } from '@/components/match/EventFeed';
import { resolveKits } from '@/lib/kits';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { PrApiMatchBackend, type StoredMatch } from '@/lib/prapi/matchBackend';
import type { MatchEvent, MatchState } from '@/lib/sim/types';

/**
 * Replay d'un match déjà joué : rejoue la timeline des événements enregistrés
 * sur le terrain animé, avec curseur de minute, vitesses et navigation.
 */

/** Vitesses de lecture : ms écoulées par minute de jeu */
const REPLAY_SPEEDS = [
  { label: '×0.5', msPerMinute: 1600 },
  { label: '×1', msPerMinute: 800 },
  { label: '×2', msPerMinute: 400 },
  { label: '×4', msPerMinute: 160 },
] as const;

/** Reconstruit le XI initial en remontant les événements depuis l'état final */
function initialOnPitch(finalOnPitch: string[], events: MatchEvent[], side: 'home' | 'away'): string[] {
  let current = [...finalOnPitch];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.side !== side) continue;
    if (ev.type === 'substitution' && ev.playerId && ev.replacedId) {
      // in → out (marche arrière)
      current = current.map((id) => (id === ev.playerId ? ev.replacedId! : id));
    } else if (ev.type === 'red' && ev.playerId && !current.includes(ev.playerId)) {
      current = [...current, ev.playerId];
    } else if (ev.type === 'injury' && ev.playerId && !current.includes(ev.playerId)) {
      // Blessure sans remplacement possible : le joueur avait quitté le terrain
      const hadSub = events.some((e) => e.type === 'substitution' && e.side === side && e.replacedId === ev.playerId);
      if (!hadSub) current = [...current, ev.playerId];
    }
  }
  return current;
}

/** Applique les événements jusqu'à l'index donné pour obtenir le XI sur le terrain */
function onPitchAt(initial: string[], events: MatchEvent[], upTo: number, side: 'home' | 'away'): string[] {
  let current = [...initial];
  for (let i = 0; i < upTo; i++) {
    const ev = events[i];
    if (ev.side !== side) continue;
    if (ev.type === 'substitution' && ev.playerId && ev.replacedId) {
      current = current.map((id) => (id === ev.replacedId ? ev.playerId! : id));
    } else if (ev.type === 'red' && ev.playerId) {
      current = current.filter((id) => id !== ev.playerId);
    } else if (ev.type === 'injury' && ev.playerId) {
      const hadSub = events.some((e) => e.type === 'substitution' && e.side === side && e.replacedId === ev.playerId);
      if (!hadSub) current = current.filter((id) => id !== ev.playerId);
    }
  }
  return current;
}

/**
 * Le backend reconstruit le match depuis ses colonnes : `input` peut revenir
 * partiel ou vide ({}) sur les vieux matchs ou ceux simulés en multiplex.
 * On normalise pour garantir input.home/away complets et les XI présents.
 */
function normalizeStored(m: StoredMatch): StoredMatch {
  const fallbackSide = (side: 'home' | 'away') => {
    const inputSide = m.input?.[side];
    const teamData = m[side];
    const players = teamData?.players ?? [];
    return {
      ...inputSide,
      team: teamData?.team ?? inputSide?.team ?? ({ name: side === 'home' ? 'Domicile' : 'Extérieur' } as StoredMatch['home']['team']),
      players: players.length ? players : (inputSide?.players ?? []),
      formation: (inputSide?.formation ?? teamData?.team?.formation ?? '4-3-3') as StoredMatch['input']['home']['formation'],
    };
  };
  const home = fallbackSide('home');
  const away = fallbackSide('away');
  const state = m.state;
  // XI finaux absents du state reconstruit → retombe sur la compo de l'input ou les 11 premiers joueurs
  const homeOnPitch = state.homeOnPitch?.length ? state.homeOnPitch : (home.lineup ?? home.players.slice(0, 11).map((p) => p.id));
  const awayOnPitch = state.awayOnPitch?.length ? state.awayOnPitch : (away.lineup ?? away.players.slice(0, 11).map((p) => p.id));
  return {
    ...m,
    input: { ...m.input, home, away },
    state: { ...state, homeOnPitch, awayOnPitch, score: state.score ?? { home: 0, away: 0 } },
  };
}

type ReplayStats = {
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  offsides: { home: number; away: number };
  yellows: { home: number; away: number };
  reds: { home: number; away: number };
};

function statsAt(events: MatchEvent[], upTo: number): ReplayStats {
  const s: ReplayStats = {
    shots: { home: 0, away: 0 }, shotsOnTarget: { home: 0, away: 0 },
    corners: { home: 0, away: 0 }, fouls: { home: 0, away: 0 },
    offsides: { home: 0, away: 0 }, yellows: { home: 0, away: 0 }, reds: { home: 0, away: 0 },
  };
  for (let i = 0; i < upTo; i++) {
    const ev = events[i];
    if (!ev.side) continue;
    const side = ev.side;
    const opp: 'home' | 'away' = side === 'home' ? 'away' : 'home';
    switch (ev.type) {
      case 'shot': case 'crossbar': s.shots[side]++; break;
      case 'goal': s.shots[side]++; s.shotsOnTarget[side]++; break;
      case 'save': s.shots[opp]++; s.shotsOnTarget[opp]++; break; // l'arrêt est côté gardien
      case 'corner': s.corners[side]++; break;
      case 'foul': s.fouls[side]++; break;
      case 'offside': s.offsides[side]++; break;
      case 'yellow': s.yellows[side]++; break;
      case 'red': s.reds[side]++; break;
    }
  }
  return s;
}

export default function MatchReplay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { prApiToken } = useBackendArgs();

  const [stored, setStored] = useState<StoredMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Curseur = index dans la liste des événements (granularité fine pour le terrain)
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      if (!prApiToken) { setError('Connexion PR_API requise pour charger le replay.'); setLoading(false); return; }
      try {
        const backend = new PrApiMatchBackend(prApiToken);
        let m = await backend.loadMatch(id);
        // Compat liens legacy « comp-<competitionId>-<matchId> » : le match est
        // stocké sous l'id brut du match de compétition (dernier segment)
        if (!m && id.startsWith('comp-')) {
          const rawId = id.slice(id.lastIndexOf('-') + 1);
          if (rawId && rawId !== id) m = await backend.loadMatch(rawId);
        }
        if (!m || !m.state?.events?.length) {
          setError('Match introuvable ou sans événements enregistrés.');
        } else {
          setStored(normalizeStored(m));
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, prApiToken]);

  const events = stored?.state.events ?? [];
  const finalState = stored?.state;

  const homeInitial = useMemo(
    () => finalState ? initialOnPitch(finalState.homeOnPitch, events, 'home') : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finalState],
  );
  const awayInitial = useMemo(
    () => finalState ? initialOnPitch(finalState.awayOnPitch, events, 'away') : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finalState],
  );

  // Minute de fin de chaque période pour le statut (flip du terrain)
  const halftimeIdx = useMemo(() => events.findIndex((e) => e.type === 'halftime'), [events]);

  // État synthétique au curseur — alimente Scoreboard + Pitch + EventFeed
  const replayState: MatchState | null = useMemo(() => {
    if (!stored || !finalState) return null;
    const visible = events.slice(0, cursor);
    const last = visible[visible.length - 1];
    const minute = last?.minute ?? 0;
    const score = { home: 0, away: 0 };
    for (const ev of visible) {
      if (ev.type === 'goal' && ev.side) score[ev.side]++;
    }
    const isDone = cursor >= events.length;
    const pastHalftime = halftimeIdx >= 0 && cursor > halftimeIdx;
    const status: MatchState['status'] = isDone ? 'fulltime' : pastHalftime ? 'secondHalf' : 'firstHalf';
    const st = statsAt(events, cursor);
    return {
      ...finalState,
      // Les matchs simulés en 'instant' garderaient une durée d'animation nulle au replay
      speed: '1',
      status,
      minute,
      half: pastHalftime ? 2 : 1,
      score,
      events: visible,
      shots: st.shots,
      shotsOnTarget: st.shotsOnTarget,
      corners: st.corners,
      fouls: st.fouls,
      offsides: st.offsides,
      cards: {
        home: { yellow: Array(st.yellows.home).fill(''), red: Array(st.reds.home).fill('') },
        away: { yellow: Array(st.yellows.away).fill(''), red: Array(st.reds.away).fill('') },
      },
      homeOnPitch: onPitchAt(homeInitial, events, cursor, 'home'),
      awayOnPitch: onPitchAt(awayInitial, events, cursor, 'away'),
      ball: last?.ballPos ?? { x: 50, y: 25 },
      weather: finalState.weather,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, cursor, homeInitial, awayInitial, halftimeIdx]);

  // Lecture automatique : avance d'un événement, délai proportionnel à l'écart de minutes
  useEffect(() => {
    if (!playing || !stored) return;
    if (cursor >= events.length) { setPlaying(false); return; }
    const msPerMinute = REPLAY_SPEEDS[speedIdx].msPerMinute;
    const cur = events[cursor - 1]?.minute ?? 0;
    const next = events[cursor]?.minute ?? cur;
    const gap = Math.max(0.35, Math.min(next - cur, 5)); // min ~un tiers de minute, max 5
    timerRef.current = window.setTimeout(() => setCursor((c) => c + 1), gap * msPerMinute);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, cursor, speedIdx, stored, events]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  }
  if (error || !stored || !replayState) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center space-y-4">
        <p className="text-sm text-danger">{error ?? 'Replay indisponible.'}</p>
        <Button variant="ghost" onClick={() => navigate(-1)}>← Retour</Button>
      </main>
    );
  }

  const maxMinute = events[events.length - 1]?.minute ?? 90;
  const curMinute = replayState.minute;
  const kits = resolveKits(stored.home.team, stored.away.team);
  const homeKit = kits.home;
  const awayKit = kits.away;

  // Seek par minute : trouve le premier index d'événement au-delà de la minute cible
  function seekToMinute(m: number) {
    setPlaying(false);
    let idx = 0;
    while (idx < events.length && events[idx].minute <= m) idx++;
    setCursor(idx);
  }

  const stats = statsAt(events, cursor);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>← Retour</Button>
          <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-medium uppercase tracking-widest text-accent">Replay</span>
          <span className="text-xs text-muted">
            {new Date(stored.playedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <span className="text-xs text-muted">Score final : {stored.state.score.home} – {stored.state.score.away}</span>
      </div>

      <Scoreboard
        state={replayState}
        home={stored.home.team}
        away={stored.away.team}
        homeFormation={stored.input.home.formationLabel ?? stored.input.home.formation}
        awayFormation={stored.input.away.formationLabel ?? stored.input.away.formation}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Pitch
            state={replayState}
            homeFormation={stored.input.home.formation}
            awayFormation={stored.input.away.formation}
            homeColor={homeKit}
            awayColor={awayKit}
            homeTokenPositions={stored.input.home.tokenPositions}
            awayTokenPositions={stored.input.away.tokenPositions}
          />
          <KitLegend
            homeName={stored.home.team.name}
            awayName={stored.away.team.name}
            homeColor={homeKit}
            awayColor={awayKit}
            awayAlternate={kits.awayUsedAlternate}
          />

          {/* ── Contrôles de lecture ── */}
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => setPlaying((p) => !p)} disabled={cursor >= events.length && !playing}>
                {playing ? '⏸ Pause' : '▶ Lecture'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setCursor(Math.max(0, cursor - 1)); }}>⏮ Précédent</Button>
              <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setCursor(Math.min(events.length, cursor + 1)); }}>Suivant ⏭</Button>
              <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setCursor(0); }}>↺ Début</Button>
              <div className="ml-auto flex gap-1">
                {REPLAY_SPEEDS.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => setSpeedIdx(i)}
                    className={`rounded px-2 py-1 text-xs transition-colors ${i === speedIdx ? 'bg-accent/20 text-accent font-medium' : 'text-muted hover:text-text'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-10 text-right text-xs tabular-nums text-muted">{curMinute}'</span>
              <input
                type="range"
                min={0}
                max={maxMinute}
                value={curMinute}
                onChange={(e) => seekToMinute(Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className="w-10 text-xs tabular-nums text-muted">{maxMinute}'</span>
            </div>
          </div>

          {/* ── Stats reconstruites, avec barres comparatives ── */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 font-display text-sm uppercase tracking-widest text-muted">Statistiques</h3>
            <div className="space-y-2.5 text-sm">
              {([
                ['Tirs', stats.shots],
                ['Tirs cadrés', stats.shotsOnTarget],
                ['Corners', stats.corners],
                ['Fautes', stats.fouls],
                ['Hors-jeu', stats.offsides],
                ['Cartons jaunes', stats.yellows],
                ['Cartons rouges', stats.reds],
              ] as const).map(([label, v]) => {
                const total = v.home + v.away;
                const homePct = total === 0 ? 50 : (v.home / total) * 100;
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="w-8 text-right tabular-nums">{v.home}</span>
                      <span className="flex-1 text-center text-xs text-muted">{label}</span>
                      <span className="w-8 tabular-nums">{v.away}</span>
                    </div>
                    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-border/30">
                      <div
                        className="rounded-full transition-all duration-300"
                        style={{ width: `${homePct}%`, background: total === 0 ? 'transparent' : homeKit }}
                      />
                      <div
                        className="rounded-full transition-all duration-300"
                        style={{ width: `${100 - homePct}%`, background: total === 0 ? 'transparent' : awayKit }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <EventFeed events={replayState.events} full />
      </div>
    </main>
  );
}
