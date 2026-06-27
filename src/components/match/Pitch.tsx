import { motion, AnimatePresence } from 'framer-motion';
import type { MatchState } from '@/lib/sim/types';
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
  events: import('@/lib/sim/types').MatchEvent[],
): Record<string, { x: number; y: number }> {
  const enriched = { ...base };
  for (const ev of events) {
    if (ev.type === 'substitution' && ev.replacedId && ev.playerId) {
      const outPos = enriched[ev.replacedId];
      if (outPos && !enriched[ev.playerId]) {
        enriched[ev.playerId] = outPos;
      }
    }
  }
  return enriched;
}

// Pentagon seam points
const PENTAGON_ANGLES = [0, 1, 2, 3, 4].map((i) => (i / 5) * 2 * Math.PI - Math.PI / 2);
const BALL_R = 0.6;

const BALL_TRANSITION = { type: 'spring', stiffness: 120, damping: 18, mass: 0.8 } as const;
const PLAYER_TRANSITION = { type: 'spring', stiffness: 90, damping: 20 } as const;

// Detect which side possesses from last event
function getPossessingSide(state: MatchState): 'home' | 'away' | null {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const ev = state.events[i];
    if (ev.side === 'home' || ev.side === 'away') return ev.side;
  }
  return null;
}

export function Pitch({ state, homeFormation, awayFormation, homeColor = '#F4F0E6', awayColor = '#C73E3E', homeTokenPositions, awayTokenPositions }: Props) {
  const flipped = SECOND_HALF_STATUSES.has(state.status);
  const possessing = getPossessingSide(state);

  const enrichedHome = homeTokenPositions ? enrichTokenPositions(homeTokenPositions, state.events) : undefined;
  const enrichedAway = awayTokenPositions ? enrichTokenPositions(awayTokenPositions, state.events) : undefined;

  const rawHome = enrichedHome
    ? buildPositionsFromTokens(state.homeOnPitch, enrichedHome, FORMATION_POSITIONS[homeFormation])
    : FORMATION_POSITIONS[homeFormation];
  const rawAway = enrichedAway
    ? buildPositionsFromTokens(state.awayOnPitch, enrichedAway, FORMATION_POSITIONS[awayFormation])
    : FORMATION_POSITIONS[awayFormation];

  // 1st half: home attacks right; 2nd half: swap
  const homePositions = flipped ? rawHome.map(mirror) : rawHome;
  const awayPositions = flipped ? rawAway : rawAway.map(mirror);

  const ballX = state.ball?.x ?? 50;
  const ballY = state.ball?.y ?? 25;

  // Subtle formation drift toward ball
  const driftX = (ballX - 50) * 0.06;
  const driftY = (ballY - 25) * 0.04;

  const isActive = state.status !== 'pregame' && state.status !== 'halftime' &&
    state.status !== 'extraTimeHalfTime' && state.status !== 'fulltime' && state.status !== 'penalties';

  return (
    <svg
      viewBox="0 0 100 50"
      className="w-full max-w-3xl rounded-xl border border-border shadow-subtle-md"
      style={{ background: 'var(--pitch)' }}
    >
      {/* Pitch markings */}
      <rect x="0.5" y="0.5" width="99" height="49" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <line x1="50" y1="0.5" x2="50" y2="49.5" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      {/* Centre circle */}
      <circle cx="50" cy="25" r="8" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <circle cx="50" cy="25" r="0.6" fill="var(--pitch-line)" opacity="0.7" />
      {/* Penalty areas */}
      <rect x="0.5" y="13.5" width="16" height="23" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <rect x="83.5" y="13.5" width="16" height="23" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      {/* Goal areas */}
      <rect x="0.5" y="19" width="6" height="12" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      <rect x="93.5" y="19" width="6" height="12" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.7" />
      {/* Penalty spots */}
      <circle cx="11" cy="25" r="0.4" fill="var(--pitch-line)" opacity="0.5" />
      <circle cx="89" cy="25" r="0.4" fill="var(--pitch-line)" opacity="0.5" />
      {/* Corner arcs */}
      <path d="M 0.5 4 A 3.5 3.5 0 0 1 4 0.5" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.5" />
      <path d="M 96 0.5 A 3.5 3.5 0 0 1 99.5 4" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.5" />
      <path d="M 0.5 46 A 3.5 3.5 0 0 0 4 49.5" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.5" />
      <path d="M 96 49.5 A 3.5 3.5 0 0 0 99.5 46" fill="none" stroke="var(--pitch-line)" strokeWidth="0.3" opacity="0.5" />

      {/* Home players */}
      {homePositions.slice(0, state.homeOnPitch.length).map((pos, i) => {
        const id = state.homeOnPitch[i];
        const hasBall = isActive && possessing === 'home' && i === 0;
        const cx = pos.x + (isActive ? driftX : 0);
        const cy = pos.y + (isActive ? driftY : 0);
        return (
          <g key={`h-${id}`}>
            {/* Pulse ring when possessing */}
            {hasBall && (
              <motion.circle
                cx={cx} cy={cy} r={2.2}
                fill="none"
                stroke={homeColor}
                strokeWidth="0.3"
                opacity={0}
                animate={{ r: [2.2, 3.5], opacity: [0.6, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
            <motion.circle
              r="1.5"
              fill={homeColor}
              stroke={hasBall ? '#FFE566' : '#1A1A1A'}
              strokeWidth={hasBall ? 0.35 : 0.2}
              opacity="0.95"
              initial={{ cx, cy }}
              animate={{ cx, cy }}
              transition={PLAYER_TRANSITION}
            />
          </g>
        );
      })}

      {/* Away players */}
      {awayPositions.slice(0, state.awayOnPitch.length).map((pos, i) => {
        const id = state.awayOnPitch[i];
        const hasBall = isActive && possessing === 'away' && i === 0;
        const cx = pos.x - (isActive ? driftX : 0);
        const cy = pos.y - (isActive ? driftY : 0);
        return (
          <g key={`a-${id}`}>
            {hasBall && (
              <motion.circle
                cx={cx} cy={cy} r={2.2}
                fill="none"
                stroke={awayColor}
                strokeWidth="0.3"
                opacity={0}
                animate={{ r: [2.2, 3.5], opacity: [0.6, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
            <motion.circle
              r="1.5"
              fill={awayColor}
              stroke={hasBall ? '#FFE566' : '#1A1A1A'}
              strokeWidth={hasBall ? 0.35 : 0.2}
              opacity="0.95"
              initial={{ cx, cy }}
              animate={{ cx, cy }}
              transition={PLAYER_TRANSITION}
            />
          </g>
        );
      })}

      {/* Ball shadow */}
      <motion.ellipse
        rx="1.0" ry="0.4"
        fill="rgba(0,0,0,0.25)"
        initial={{ cx: ballX + 0.3, cy: ballY + 1.2 }}
        animate={{ cx: ballX + 0.3, cy: ballY + 1.2 }}
        transition={BALL_TRANSITION}
      />

      {/* Ball */}
      <motion.circle
        r="1.15"
        fill="white"
        stroke="#333"
        strokeWidth="0.14"
        initial={{ cx: ballX, cy: ballY }}
        animate={{ cx: ballX, cy: ballY }}
        transition={BALL_TRANSITION}
      />

      {/* Pentagon seams */}
      {PENTAGON_ANGLES.map((angle, i) => {
        const next = PENTAGON_ANGLES[(i + 1) % 5];
        return (
          <motion.line
            key={`seam-${i}`}
            stroke="#444"
            strokeWidth="0.13"
            opacity="0.45"
            initial={{
              x1: ballX + Math.cos(angle) * BALL_R,
              y1: ballY + Math.sin(angle) * BALL_R,
              x2: ballX + Math.cos(next) * BALL_R,
              y2: ballY + Math.sin(next) * BALL_R,
            }}
            animate={{
              x1: ballX + Math.cos(angle) * BALL_R,
              y1: ballY + Math.sin(angle) * BALL_R,
              x2: ballX + Math.cos(next) * BALL_R,
              y2: ballY + Math.sin(next) * BALL_R,
            }}
            transition={BALL_TRANSITION}
          />
        );
      })}

      {/* But flash : halo doré sur le but quand goal */}
      <AnimatePresence>
        {state.events.length > 0 && state.events[state.events.length - 1]?.type === 'goal' && (() => {
          const lastGoal = state.events[state.events.length - 1];
          const goalSide = lastGoal.side;
          // home attacks right in 1st half → goal cx=100, away goal cx=0
          const effectiveSide = flipped
            ? (goalSide === 'home' ? 'away' : 'home')
            : goalSide;
          const goalCx = effectiveSide === 'home' ? 100 : 0;
          return (
            <motion.circle
              key={`goal-flash-${lastGoal.id}`}
              cx={goalCx} cy={25} r={8}
              fill="rgba(255,220,50,0.18)"
              stroke="rgba(255,220,50,0.5)"
              strokeWidth="0.4"
              initial={{ opacity: 0, r: 4 }}
              animate={{ opacity: [0, 1, 0], r: [4, 12, 16] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          );
        })()}
      </AnimatePresence>
    </svg>
  );
}
