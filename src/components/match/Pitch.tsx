import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import type { MatchState, MatchEvent } from '@/lib/sim/types';
import type { Formation } from '@/lib/types';

type Props = {
  state: MatchState;
  homeFormation: Formation;
  awayFormation: Formation;
  homeColor?: string;
  awayColor?: string;
  homeTokenPositions?: Record<string, { x: number; y: number }>;
  awayTokenPositions?: Record<string, { x: number; y: number }>;
};

const SECOND_HALF_STATUSES = new Set(['secondHalf', 'extraTimeFirst', 'extraTimeHalfTime', 'extraTimeSecond', 'penalties']);

const FORMATION_POSITIONS: Record<Formation, Array<{ x: number; y: number }>> = {
  '4-3-3': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 30, y: 12 }, { x: 30, y: 25 }, { x: 30, y: 38 },
    { x: 42, y: 8 }, { x: 45, y: 25 }, { x: 42, y: 42 },
  ],
  '4-4-2': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 30, y: 8 }, { x: 30, y: 18 }, { x: 30, y: 32 }, { x: 30, y: 42 },
    { x: 42, y: 18 }, { x: 42, y: 32 },
  ],
  '3-5-2': [
    { x: 5, y: 25 },
    { x: 18, y: 12 }, { x: 18, y: 25 }, { x: 18, y: 38 },
    { x: 28, y: 8 }, { x: 28, y: 18 }, { x: 28, y: 25 }, { x: 28, y: 32 }, { x: 28, y: 42 },
    { x: 42, y: 18 }, { x: 42, y: 32 },
  ],
  '4-2-3-1': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 28, y: 18 }, { x: 28, y: 32 },
    { x: 38, y: 10 }, { x: 38, y: 25 }, { x: 38, y: 40 },
    { x: 45, y: 25 },
  ],
  '5-3-2': [
    { x: 5, y: 25 },
    { x: 18, y: 5 }, { x: 18, y: 15 }, { x: 18, y: 25 }, { x: 18, y: 35 }, { x: 18, y: 45 },
    { x: 30, y: 12 }, { x: 30, y: 25 }, { x: 30, y: 38 },
    { x: 42, y: 18 }, { x: 42, y: 32 },
  ],
  '4-1-4-1': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 26, y: 25 },
    { x: 35, y: 8 }, { x: 35, y: 18 }, { x: 35, y: 32 }, { x: 35, y: 42 },
    { x: 45, y: 25 },
  ],
  '3-4-3': [
    { x: 5, y: 25 },
    { x: 18, y: 12 }, { x: 18, y: 25 }, { x: 18, y: 38 },
    { x: 30, y: 8 }, { x: 30, y: 18 }, { x: 30, y: 32 }, { x: 30, y: 42 },
    { x: 42, y: 8 }, { x: 45, y: 25 }, { x: 42, y: 42 },
  ],
  '4-3-2-1': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 28, y: 12 }, { x: 28, y: 25 }, { x: 28, y: 38 },
    { x: 38, y: 18 }, { x: 38, y: 32 },
    { x: 45, y: 25 },
  ],
  '4-5-1': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 30, y: 5 }, { x: 30, y: 15 }, { x: 30, y: 25 }, { x: 30, y: 35 }, { x: 30, y: 45 },
    { x: 45, y: 25 },
  ],
  '4-4-1-1': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 30, y: 8 }, { x: 30, y: 18 }, { x: 30, y: 32 }, { x: 30, y: 42 },
    { x: 40, y: 25 },
    { x: 46, y: 25 },
  ],
  '3-4-1-2': [
    { x: 5, y: 25 },
    { x: 18, y: 12 }, { x: 18, y: 25 }, { x: 18, y: 38 },
    { x: 28, y: 8 }, { x: 28, y: 18 }, { x: 28, y: 32 }, { x: 28, y: 42 },
    { x: 38, y: 25 },
    { x: 45, y: 18 }, { x: 45, y: 32 },
  ],
  '5-4-1': [
    { x: 5, y: 25 },
    { x: 18, y: 5 }, { x: 18, y: 15 }, { x: 18, y: 25 }, { x: 18, y: 35 }, { x: 18, y: 45 },
    { x: 30, y: 8 }, { x: 30, y: 18 }, { x: 30, y: 32 }, { x: 30, y: 42 },
    { x: 45, y: 25 },
  ],
  '3-6-1': [
    { x: 5, y: 25 },
    { x: 18, y: 12 }, { x: 18, y: 25 }, { x: 18, y: 38 },
    { x: 28, y: 5 }, { x: 28, y: 15 }, { x: 28, y: 22 }, { x: 28, y: 28 }, { x: 28, y: 35 }, { x: 28, y: 45 },
    { x: 45, y: 25 },
  ],
};

function mirror(p: { x: number; y: number }) {
  return { x: 100 - p.x, y: p.y };
}

function editorToSvg(t: { x: number; y: number }): { x: number; y: number } {
  return { x: (100 - t.y) / 100 * 50, y: t.x / 100 * 50 };
}

function buildPositionsFromTokens(
  onPitchIds: string[],
  tokenPositions: Record<string, { x: number; y: number }>,
  fallback: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  return onPitchIds.map((id, i) => {
    const t = tokenPositions[id];
    if (!t) return fallback[i] ?? { x: 25, y: 25 };
    return editorToSvg(t);
  });
}

function enrichTokenPositions(
  base: Record<string, { x: number; y: number }>,
  events: MatchEvent[],
): Record<string, { x: number; y: number }> {
  const enriched = { ...base };
  for (const ev of events) {
    if (ev.type === 'substitution' && ev.replacedId && ev.playerId) {
      const outPos = enriched[ev.replacedId];
      if (outPos && !enriched[ev.playerId]) enriched[ev.playerId] = outPos;
    }
  }
  return enriched;
}

// ── Event-driven player displacement ──────────────────────────────────────────
//
// Each event type pushes players toward or away from ballPos.
// Possessing side: attack-minded players move toward ballPos.
// Defending side: defensive block shifts to cover ballPos.
// The active player (playerId) moves closest to ballPos.
// Base formation is always the anchor — displacements are additive offsets.

type Displacement = { dx: number; dy: number };

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function eventDisplacements(
  ev: MatchEvent | null,
  onPitchIds: string[],
  basePositions: Array<{ x: number; y: number }>,
  side: 'home' | 'away',
  flipped: boolean,
): Displacement[] {
  if (!ev || !ev.ballPos) return onPitchIds.map(() => ({ dx: 0, dy: 0 }));

  const rawBall = ev.ballPos;
  const attacking = ev.side === side;

  // Ball in display space for this side's perspective
  let bx: number, by: number;
  if (side === 'home') {
    bx = flipped ? 100 - rawBall.x : rawBall.x;
    by = rawBall.y;
  } else {
    bx = flipped ? rawBall.x : 100 - rawBall.x;
    by = rawBall.y;
  }

  // Attacking direction: home attacks toward x=100 in 1st half, x=0 in 2nd. Mirror for away.
  // After display-space transform both sides "attack toward x=100".
  const attackDir = 100; // target x when pushing forward (both sides post-mirror)
  const defendDir = 0;   // goal to protect

  // Intensity per event type
  const intensity: Record<string, { att: number; def: number; gk: number }> = {
    shot:        { att: 0.60, def: 0.18, gk: 0.06 },
    goal:        { att: 0.30, def: 0.10, gk: 0.02 },
    save:        { att: 0.22, def: 0.10, gk: 0.02 },
    keyPass:     { att: 0.45, def: 0.22, gk: 0.03 },
    dribble:     { att: 0.55, def: 0.28, gk: 0.04 },
    corner:      { att: 0.50, def: 0.38, gk: 0.05 },
    header:      { att: 0.52, def: 0.32, gk: 0.04 },
    freeKick:    { att: 0.44, def: 0.38, gk: 0.05 },
    penalty:     { att: 0.15, def: 0.10, gk: 0.02 },
    foul:        { att: 0.18, def: 0.18, gk: 0.02 },
    clearance:   { att: 0.10, def: 0.22, gk: 0.03 },
    offside:     { att: 0.12, def: 0.06, gk: 0.01 },
  };

  const mod = intensity[ev.type] ?? { att: 0.14, def: 0.12, gk: 0.02 };

  const n = onPitchIds.length;

  return onPitchIds.map((id, i) => {
    const base = basePositions[i];
    if (!base) return { dx: 0, dy: 0 };

    const isGk = i === 0;
    const isActive = ev.playerId === id || ev.assistId === id;
    // Normalised position in lineup (0=GK, 1=fwd) for role-based intensity
    const roleFactor = i / Math.max(n - 1, 1); // 0..1

    if (isGk) {
      // GK barely moves — slight lateral shift toward ball y
      const dy = lerp(0, by - base.y, mod.gk);
      return { dx: 0, dy };
    }

    let targetX: number;
    let targetY: number;
    let t: number;

    if (attacking) {
      // Attacking: push players toward ball position + forward bias
      // Active player goes closest to ball; others push proportionally to their role
      t = isActive ? Math.min(mod.att * 1.8, 0.88) : mod.att * (0.3 + 0.7 * roleFactor);
      // Target blends between ball position and deep attack position
      const advanceBias = isActive ? 0.7 : 0.4 * roleFactor;
      targetX = lerp(lerp(base.x, bx, t), lerp(base.x, attackDir, t), advanceBias);
      targetY = lerp(base.y, by, t * 0.8);
    } else {
      // Defending: players compress toward ball to block, forwards track back less
      t = isActive ? mod.def * 1.5 : mod.def * (0.25 + 0.75 * (1 - roleFactor));
      // Defenders track toward ball; attackers only partially
      const trackBias = isActive ? 0.8 : 0.5 * (1 - roleFactor);
      targetX = lerp(lerp(base.x, bx, t), lerp(base.x, defendDir, t * 0.3), trackBias);
      targetY = lerp(base.y, by, t * 0.75);
    }

    return { dx: targetX - base.x, dy: targetY - base.y };
  });
}

// Pentagon seam points
const PENTAGON_ANGLES = [0, 1, 2, 3, 4].map((i) => (i / 5) * 2 * Math.PI - Math.PI / 2);
const BALL_R = 0.6;

// Slower spring for players (looks natural), fast for ball
const BALL_SPRING   = { type: 'spring', stiffness: 140, damping: 20, mass: 0.7 } as const;
const PLAYER_SPRING = { type: 'spring', stiffness: 60,  damping: 18, mass: 1.2 } as const;
const PULSE_TRANS   = { duration: 1.1, repeat: Infinity, ease: 'easeOut' } as const;

export function Pitch({ state, homeFormation, awayFormation, homeColor = '#F4F0E6', awayColor = '#C73E3E', homeTokenPositions, awayTokenPositions }: Props) {
  const flipped = SECOND_HALF_STATUSES.has(state.status);

  const subCount = useMemo(
    () => state.events.filter((e) => e.type === 'substitution').length,
    [state.events],
  );

  const enrichedHome = useMemo(
    () => homeTokenPositions ? enrichTokenPositions(homeTokenPositions, state.events) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [homeTokenPositions, subCount],
  );
  const enrichedAway = useMemo(
    () => awayTokenPositions ? enrichTokenPositions(awayTokenPositions, state.events) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awayTokenPositions, subCount],
  );

  const rawHome = useMemo(
    () => enrichedHome
      ? buildPositionsFromTokens(state.homeOnPitch, enrichedHome, FORMATION_POSITIONS[homeFormation])
      : FORMATION_POSITIONS[homeFormation],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedHome, state.homeOnPitch.join(','), homeFormation],
  );
  const rawAway = useMemo(
    () => enrichedAway
      ? buildPositionsFromTokens(state.awayOnPitch, enrichedAway, FORMATION_POSITIONS[awayFormation])
      : FORMATION_POSITIONS[awayFormation],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedAway, state.awayOnPitch.join(','), awayFormation],
  );

  // Display-space base positions (formation + half flip)
  const homeBase = flipped ? rawHome.map(mirror) : rawHome;
  const awayBase = flipped ? rawAway : rawAway.map(mirror);

  // Last meaningful event (skip halftime/fulltime/kickoff for displacement)
  const SKIP = new Set(['halftime', 'fulltime', 'kickoff', 'extraTime', 'substitution', 'coachRed', 'injury']);
  const lastEv = useMemo(() => {
    for (let i = state.events.length - 1; i >= 0; i--) {
      if (!SKIP.has(state.events[i].type)) return state.events[i];
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.events.length]);

  const isActive = state.status !== 'pregame' && state.status !== 'halftime' &&
    state.status !== 'extraTimeHalfTime' && state.status !== 'fulltime' && state.status !== 'penalties';

  // Per-player displacements from last event
  const homeDisp = useMemo(
    () => isActive ? eventDisplacements(lastEv, state.homeOnPitch, homeBase, 'home', flipped) : homeBase.map(() => ({ dx: 0, dy: 0 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastEv?.id, state.homeOnPitch.join(','), homeBase, flipped, isActive],
  );
  const awayDisp = useMemo(
    () => isActive ? eventDisplacements(lastEv, state.awayOnPitch, awayBase, 'away', flipped) : awayBase.map(() => ({ dx: 0, dy: 0 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastEv?.id, state.awayOnPitch.join(','), awayBase, flipped, isActive],
  );

  // Ball follows the active player's display position when there is one.
  // Fallback: transform engine ballPos (x=0..100, y=0..50) into display space.
  const { ballX, ballY } = useMemo(() => {
    if (lastEv?.playerId && isActive) {
      // Find active player in home or away lineup
      const hIdx = state.homeOnPitch.indexOf(lastEv.playerId);
      if (hIdx >= 0 && homeBase[hIdx] && homeDisp[hIdx]) {
        return { ballX: homeBase[hIdx].x + homeDisp[hIdx].dx, ballY: homeBase[hIdx].y + homeDisp[hIdx].dy };
      }
      const aIdx = state.awayOnPitch.indexOf(lastEv.playerId);
      if (aIdx >= 0 && awayBase[aIdx] && awayDisp[aIdx]) {
        return { ballX: awayBase[aIdx].x + awayDisp[aIdx].dx, ballY: awayBase[aIdx].y + awayDisp[aIdx].dy };
      }
    }
    // No active player — use engine ballPos transformed to display space
    const raw = state.ball ?? { x: 50, y: 25 };
    // engine: home attacks right in 1st half (x=0 home goal, x=100 away goal)
    // display: same orientation, but flipped in 2nd half
    const dx = flipped ? 100 - raw.x : raw.x;
    return { ballX: dx, ballY: raw.y };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEv?.id, lastEv?.playerId, homeBase, awayBase, homeDisp, awayDisp, state.ball, flipped, isActive]);

  // Possessing side from last event
  const possessing = lastEv?.side ?? null;

  return (
    <svg
      viewBox="0 0 100 50"
      className="w-full max-w-3xl rounded-xl border border-border shadow-subtle-md"
      style={{ background: 'var(--pitch)' }}
    >
      {/* ── Pitch markings ── */}
      <rect x="0.5" y="0.5" width="99" height="49" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <line x1="50" y1="0.5" x2="50" y2="49.5" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <circle cx="50" cy="25" r="8" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <circle cx="50" cy="25" r="0.6" fill="var(--pitch-line)" opacity="0.7" />
      <rect x="0.5" y="13.5" width="16" height="23" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <rect x="83.5" y="13.5" width="16" height="23" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <rect x="0.5" y="19" width="6" height="12" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <rect x="93.5" y="19" width="6" height="12" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <circle cx="11" cy="25" r="0.4" fill="var(--pitch-line)" opacity="0.5" />
      <circle cx="89" cy="25" r="0.4" fill="var(--pitch-line)" opacity="0.5" />
      <path d="M 0.5 4 A 3.5 3.5 0 0 1 4 0.5" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.5" />
      <path d="M 96 0.5 A 3.5 3.5 0 0 1 99.5 4" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.5" />
      <path d="M 0.5 46 A 3.5 3.5 0 0 0 4 49.5" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.5" />
      <path d="M 96 49.5 A 3.5 3.5 0 0 0 99.5 46" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.5" />

      {/* ── Home players ── */}
      {homeBase.slice(0, state.homeOnPitch.length).map((base, i) => {
        const id = state.homeOnPitch[i];
        const disp = homeDisp[i] ?? { dx: 0, dy: 0 };
        const cx = base.x + disp.dx;
        const cy = base.y + disp.dy;
        const isActivePlayer = isActive && (lastEv?.playerId === id || lastEv?.assistId === id);
        const hasBall = isActivePlayer && lastEv?.side === 'home';

        return (
          <g key={`h-${id}`}>
            {hasBall && (
              <motion.circle
                cx={cx} cy={cy} r={2.4}
                fill="none" stroke={homeColor} strokeWidth="0.3" opacity={0}
                animate={{ r: [2.4, 4.0], opacity: [0.7, 0] }}
                transition={PULSE_TRANS}
              />
            )}
            <motion.circle
              r="1.5"
              fill={homeColor}
              stroke={hasBall ? '#FFE566' : '#1A1A1A'}
              strokeWidth={hasBall ? 0.4 : 0.2}
              opacity={0.95}
              initial={{ cx, cy }}
              animate={{ cx, cy }}
              transition={PLAYER_SPRING}
            />
          </g>
        );
      })}

      {/* ── Away players ── */}
      {awayBase.slice(0, state.awayOnPitch.length).map((base, i) => {
        const id = state.awayOnPitch[i];
        const disp = awayDisp[i] ?? { dx: 0, dy: 0 };
        const cx = base.x + disp.dx;
        const cy = base.y + disp.dy;
        const isActivePlayer = isActive && (lastEv?.playerId === id || lastEv?.assistId === id);
        const hasBall = isActivePlayer && lastEv?.side === 'away';

        return (
          <g key={`a-${id}`}>
            {hasBall && (
              <motion.circle
                cx={cx} cy={cy} r={2.4}
                fill="none" stroke={awayColor} strokeWidth="0.3" opacity={0}
                animate={{ r: [2.4, 4.0], opacity: [0.7, 0] }}
                transition={PULSE_TRANS}
              />
            )}
            <motion.circle
              r="1.5"
              fill={awayColor}
              stroke={hasBall ? '#FFE566' : '#1A1A1A'}
              strokeWidth={hasBall ? 0.4 : 0.2}
              opacity={0.95}
              initial={{ cx, cy }}
              animate={{ cx, cy }}
              transition={PLAYER_SPRING}
            />
          </g>
        );
      })}

      {/* ── Ball shadow ── */}
      <motion.ellipse
        rx="1.0" ry="0.4" fill="rgba(0,0,0,0.22)"
        initial={{ cx: ballX + 0.3, cy: ballY + 1.3 }}
        animate={{ cx: ballX + 0.3, cy: ballY + 1.3 }}
        transition={BALL_SPRING}
      />

      {/* ── Ball ── */}
      <motion.circle
        r="1.15" fill="white" stroke="#333" strokeWidth="0.14"
        initial={{ cx: ballX, cy: ballY }}
        animate={{ cx: ballX, cy: ballY }}
        transition={BALL_SPRING}
      />

      {/* ── Pentagon seams ── */}
      {PENTAGON_ANGLES.map((angle, i) => {
        const next = PENTAGON_ANGLES[(i + 1) % 5];
        return (
          <motion.line
            key={`seam-${i}`}
            stroke="#444" strokeWidth="0.13" opacity="0.45"
            initial={{ x1: ballX + Math.cos(angle) * BALL_R, y1: ballY + Math.sin(angle) * BALL_R, x2: ballX + Math.cos(next) * BALL_R, y2: ballY + Math.sin(next) * BALL_R }}
            animate={{ x1: ballX + Math.cos(angle) * BALL_R, y1: ballY + Math.sin(angle) * BALL_R, x2: ballX + Math.cos(next) * BALL_R, y2: ballY + Math.sin(next) * BALL_R }}
            transition={BALL_SPRING}
          />
        );
      })}

      {/* ── Goal flash ── */}
      <AnimatePresence>
        {lastEv?.type === 'goal' && (() => {
          const effectiveSide = flipped ? (lastEv.side === 'home' ? 'away' : 'home') : lastEv.side;
          const goalCx = effectiveSide === 'home' ? 100 : 0;
          return (
            <motion.circle
              key={`goal-flash-${lastEv.id}`}
              cx={goalCx} cy={25} r={8}
              fill="rgba(255,220,50,0.18)" stroke="rgba(255,220,50,0.5)" strokeWidth="0.4"
              initial={{ opacity: 0, r: 4 }}
              animate={{ opacity: [0, 1, 0], r: [4, 14, 18] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ── Possession indicator (subtle line under pitch) ── */}
      {isActive && possessing && (
        <motion.line
          x1={possessing === 'home' ? 0.5 : 99.5}
          y1={49.8} x2={possessing === 'home' ? 0.5 : 99.5} y2={49.8}
          stroke={possessing === 'home' ? homeColor : awayColor}
          strokeWidth="0.6" opacity="0.5"
        />
      )}
    </svg>
  );
}
