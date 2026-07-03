import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useRef } from 'react';
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
  '4-1-2-1-2': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 26, y: 25 },
    { x: 32, y: 14 }, { x: 32, y: 36 },
    { x: 38, y: 25 },
    { x: 45, y: 18 }, { x: 45, y: 32 },
  ],
  '3-4-2-1': [
    { x: 5, y: 25 },
    { x: 18, y: 12 }, { x: 18, y: 25 }, { x: 18, y: 38 },
    { x: 28, y: 5 }, { x: 28, y: 18 }, { x: 28, y: 32 }, { x: 28, y: 45 },
    { x: 38, y: 15 }, { x: 38, y: 35 },
    { x: 46, y: 25 },
  ],
  '4-2-2-2': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 27, y: 18 }, { x: 27, y: 32 },
    { x: 37, y: 12 }, { x: 37, y: 38 },
    { x: 45, y: 18 }, { x: 45, y: 32 },
  ],
  '4-2-4': [
    { x: 5, y: 25 },
    { x: 18, y: 8 }, { x: 18, y: 18 }, { x: 18, y: 32 }, { x: 18, y: 42 },
    { x: 30, y: 18 }, { x: 30, y: 32 },
    { x: 43, y: 5 }, { x: 46, y: 18 }, { x: 46, y: 32 }, { x: 43, y: 45 },
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

// ── Chorégraphies de coups de pied arrêtés ────────────────────────────────────
//
// Pour penalty / corner / coup franc / hors-jeu / but, on remplace le simple
// déplacement par une scène complète : tireur au point, mur, joueurs massés
// dans la surface, ligne de hors-jeu… Positions ABSOLUES en espace d'affichage
// (les deux équipes attaquent vers x=100 après transformation).
// null = garder la position déplacement classique.

/** Jitter déterministe par indice — mêmes positions à chaque rendu d'un même événement */
function jitter(i: number, evId: number, range: number): number {
  const h = Math.sin(i * 127.1 + evId * 311.7) * 43758.5453;
  return ((h - Math.floor(h)) - 0.5) * 2 * range;
}

const SET_PIECE_TYPES = new Set(['penalty', 'corner', 'freeKick', 'offside', 'goal', 'header']);

function sceneTargets(
  ev: MatchEvent | null,
  onPitchIds: string[],
  basePositions: Array<{ x: number; y: number }>,
  attacking: boolean,
  bx: number,
  by: number,
): Array<{ x: number; y: number } | null> | null {
  if (!ev || !ev.ballPos || !SET_PIECE_TYPES.has(ev.type)) return null;
  const none: Array<{ x: number; y: number } | null> = onPitchIds.map(() => null);

  // Indices triés par avancement (base.x) — les plus offensifs vont dans la surface
  const outfield = onPitchIds.map((_, i) => i).filter((i) => i !== 0);
  const byAdvance = [...outfield].sort((a, b) => (basePositions[b]?.x ?? 0) - (basePositions[a]?.x ?? 0));
  const takerIdx = ev.playerId ? onPitchIds.indexOf(ev.playerId) : -1;

  // Espace canonique : ce côté attaque vers x=100, son propre but est à x=0.
  // En défense, l'action se joue près de son but (bx petit).

  if (ev.type === 'penalty') {
    if (attacking) {
      const targets = [...none];
      // Tireur au point de penalty (but adverse), coéquipiers en arc à l'entrée de la surface
      const spot = { x: 89, y: 25 };
      const arcIdxs = byAdvance.filter((i) => i !== takerIdx).slice(0, 6);
      arcIdxs.forEach((idx, k) => {
        const ang = -0.9 + (k / Math.max(arcIdxs.length - 1, 1)) * 1.8;
        targets[idx] = { x: 81.5 - Math.cos(ang) * 2, y: 25 + Math.sin(ang) * 11 };
      });
      if (takerIdx > 0) targets[takerIdx] = spot;
      return targets;
    } else {
      const targets = [...none];
      // GK sur sa ligne (son but = x=0), défenseurs à l'arc de sa surface
      targets[0] = { x: 1, y: 25 };
      const arcIdxs = byAdvance.slice(-6);
      arcIdxs.forEach((idx, k) => {
        const ang = -1.0 + (k / Math.max(arcIdxs.length - 1, 1)) * 2.0;
        targets[idx] = { x: 19.5 + Math.cos(ang) * 2, y: 25 + Math.sin(ang) * 12 };
      });
      return targets;
    }
  }

  if (ev.type === 'corner' || ev.type === 'header') {
    if (attacking) {
      const targets = [...none];
      const cornerY = by < 25 ? 1 : 49;
      // 5 attaquants dans la surface adverse, tireur au poteau de corner
      const inBox = byAdvance.filter((i) => i !== takerIdx).slice(0, 5);
      inBox.forEach((idx, k) => {
        targets[idx] = {
          x: 88 + jitter(k, ev.id, 3.5) + (k % 2) * 3,
          y: 19 + (k / Math.max(inBox.length - 1, 1)) * 12 + jitter(k + 7, ev.id, 2),
        };
      });
      if (ev.type === 'corner' && takerIdx > 0) targets[takerIdx] = { x: 99, y: cornerY };
      else if (ev.type === 'header' && takerIdx > 0) targets[takerIdx] = { x: 92, y: 25 + jitter(1, ev.id, 4) };
      return targets;
    } else {
      const targets = [...none];
      // Marquage individuel dans sa propre surface + GK sur sa ligne
      targets[0] = { x: 1.5, y: 25 };
      const markers = byAdvance.slice(-6);
      markers.forEach((idx, k) => {
        targets[idx] = {
          x: 10 + jitter(k + 3, ev.id, 3),
          y: 18 + (k / Math.max(markers.length - 1, 1)) * 14 + jitter(k + 11, ev.id, 1.5),
        };
      });
      return targets;
    }
  }

  if (ev.type === 'freeKick') {
    if (attacking) {
      const targets = [...none];
      if (takerIdx > 0) targets[takerIdx] = { x: bx, y: by };
      // 3 attaquants montés dans la surface adverse
      const inBox = byAdvance.filter((i) => i !== takerIdx).slice(0, 3);
      inBox.forEach((idx, k) => {
        targets[idx] = { x: 89 + jitter(k, ev.id, 2.5), y: 20 + k * 5 + jitter(k + 5, ev.id, 1.5) };
      });
      return targets;
    } else {
      const targets = [...none];
      // Ballon adverse près de notre but (x=0) : mur de 4 entre le ballon et le but
      const goal = { x: 0, y: 25 };
      const dxg = goal.x - bx, dyg = goal.y - by;
      const dist = Math.hypot(dxg, dyg) || 1;
      const wx = bx + (dxg / dist) * 7;
      const wy = by + (dyg / dist) * 7;
      // Perpendiculaire pour aligner le mur
      const px = -dyg / dist, py = dxg / dist;
      const wall = byAdvance.slice(-4);
      wall.forEach((idx, k) => {
        const off = (k - (wall.length - 1) / 2) * 1.7;
        targets[idx] = { x: wx + px * off, y: wy + py * off };
      });
      // GK positionné côté ouvert
      targets[0] = { x: 1, y: 25 + (by < 25 ? 1.5 : -1.5) };
      // Marquage dans la surface
      const markers = byAdvance.slice(0, 3);
      markers.forEach((idx, k) => {
        if (targets[idx]) return;
        targets[idx] = { x: 10 + jitter(k, ev.id, 2), y: 20 + k * 5 };
      });
      return targets;
    }
  }

  if (ev.type === 'offside') {
    if (attacking) {
      const targets = [...none];
      // Joueur signalé au-delà de la dernière ligne défensive adverse
      if (takerIdx > 0) targets[takerIdx] = { x: Math.min(bx + 2, 95), y: by };
      return targets;
    } else {
      const targets = [...none];
      // Ligne défensive à plat près de notre but — visualise la ligne de hors-jeu.
      // Notre espace : ballon à bx (petit) ; la ligne est côté terrain (bx + 1.5).
      const defLine = byAdvance.slice(-4);
      const lineX = Math.max(bx + 1.5, 8);
      defLine.forEach((idx, k) => {
        targets[idx] = { x: lineX, y: 12 + k * 8.5 };
      });
      return targets;
    }
  }

  if (ev.type === 'goal') {
    if (attacking) {
      const targets = [...none];
      // Le buteur file vers le poteau de corner, grappe de coéquipiers derrière
      const celebr = { x: 96, y: by < 25 ? 6 : 44 };
      if (takerIdx > 0) targets[takerIdx] = celebr;
      const crowd = byAdvance.filter((i) => i !== takerIdx).slice(0, 4);
      crowd.forEach((idx, k) => {
        targets[idx] = { x: celebr.x - 3 - k * 1.6 + jitter(k, ev.id, 1), y: celebr.y + jitter(k + 9, ev.id, 2.5) };
      });
      return targets;
    }
    return none; // défenseurs restent sur le déplacement standard (têtes basses)
  }

  return null;
}

// ── Chemins de ballon : l'action se construit au lieu de téléporter ───────────
//
// Chaque événement génère une séquence de points de passage (keyframes) jouée
// dans la fenêtre du tick : départ = position précédente du ballon, progression
// (relais au milieu, débordement, zigzag de dribble…), puis l'événement lui-même
// — et pour les tirs, la trajectoire de frappe différenciée (but au fond des
// filets, arrêt sur le gardien, barre avec rebond, hors-cadre à côté du poteau).
// La continuité vient du chaînage : un corner s'arrête au poteau de corner, la
// tête qui suit REPART du poteau ; un penalty pose le ballon au point, la frappe
// suivante part du point.

const SPEED_TO_MS: Record<string, number> = { '0.5': 2000, '1': 1000, '2': 500, '5': 200, instant: 0 };

type BallPath = { xs: number[]; ys: number[]; times: number[]; kind: 'pass' | 'strike' | 'move' };

/** Variation déterministe par événement (pas de Math.random → stable au re-render) */
function evJitter(evId: number, salt: number, range: number): number {
  const h = Math.sin(evId * 12.9898 + salt * 78.233) * 43758.5453;
  return ((h - Math.floor(h)) - 0.5) * 2 * range;
}

function clampPitch(p: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.max(0.5, Math.min(99.5, p.x)), y: Math.max(1, Math.min(49, p.y)) };
}

function buildBallPath(
  ev: MatchEvent | null,
  prev: { x: number; y: number },
  flipped: boolean,
): BallPath {
  const still: BallPath = { xs: [prev.x], ys: [prev.y], times: [0], kind: 'move' };
  if (!ev || !ev.ballPos) return still;

  // Cible en espace SVG
  const target = { x: flipped ? 100 - ev.ballPos.x : ev.ballPos.x, y: ev.ballPos.y };
  // But attaqué par le côté de l'événement, en espace SVG
  const goalX = ev.side === 'home' ? (flipped ? 0 : 100) : ev.side === 'away' ? (flipped ? 100 : 0) : 50;
  const dir = goalX > 50 ? 1 : -1;
  const j = (salt: number, r: number) => evJitter(ev.id, salt, r);

  // Trop loin (mi-temps, seek du replay…) : trajet direct sans construction
  const far = Math.hypot(target.x - prev.x, target.y - prev.y) > 55;

  const seq = (pts: { x: number; y: number }[], times: number[], kind: BallPath['kind']): BallPath => {
    const c = pts.map(clampPitch);
    return { xs: c.map((p) => p.x), ys: c.map((p) => p.y), times, kind };
  };

  // Relais de construction : point intermédiaire décalé latéralement (une-deux, renversement)
  const buildup = (advance: number): { x: number; y: number } => ({
    x: prev.x + (target.x - prev.x) * advance + j(1, 4),
    y: prev.y + (target.y - prev.y) * advance + (target.y >= 25 ? -1 : 1) * (6 + j(2, 3)),
  });

  switch (ev.type) {
    case 'goal': {
      const mouth = { x: goalX, y: 25 + j(3, 3) };
      if (far) return seq([prev, target, mouth], [0, 0.7, 1], 'strike');
      return seq([prev, buildup(0.55), target, mouth], [0, 0.45, 0.78, 1], 'strike');
    }
    case 'save':
    case 'shotOnTarget': {
      const gk = { x: goalX - dir * 1.5, y: 25 + j(4, 2) };
      if (far) return seq([prev, target, gk], [0, 0.7, 1], 'strike');
      return seq([prev, buildup(0.55), target, gk], [0, 0.45, 0.78, 1], 'strike');
    }
    case 'crossbar': {
      const bar = { x: goalX, y: 25 };
      const bounce = { x: goalX - dir * (5 + j(5, 2)), y: 21 + j(6, 3) };
      if (far) return seq([prev, target, bar, bounce], [0, 0.55, 0.8, 1], 'strike');
      return seq([prev, buildup(0.5), target, bar, bounce], [0, 0.4, 0.68, 0.85, 1], 'strike');
    }
    case 'shot': {
      // Non cadré : file à côté du poteau ou au-dessus
      const wide = { x: goalX, y: 25 + (j(7, 1) >= 0 ? 1 : -1) * (9 + j(8, 3)) };
      if (far) return seq([prev, target, wide], [0, 0.7, 1], 'strike');
      return seq([prev, buildup(0.55), target, wide], [0, 0.45, 0.78, 1], 'strike');
    }
    case 'keyPass': {
      // Passe clé : circulation, puis passe tranchante vers l'avant (dernier segment rapide)
      const carry = { x: prev.x + (target.x - prev.x) * 0.4 + j(9, 3), y: prev.y + (25 - prev.y) * 0.5 + j(10, 5) };
      if (far) return seq([prev, target], [0, 1], 'pass');
      return seq([prev, carry, target], [0, 0.62, 1], 'pass');
    }
    case 'dribble': {
      // Percée balle au pied : zigzag d'appuis
      if (far) return seq([prev, target], [0, 1], 'move');
      const z1 = { x: prev.x + (target.x - prev.x) * 0.35, y: prev.y + (target.y - prev.y) * 0.35 + 3.5 + j(11, 1.5) };
      const z2 = { x: prev.x + (target.x - prev.x) * 0.7, y: prev.y + (target.y - prev.y) * 0.7 - 3.5 + j(12, 1.5) };
      return seq([prev, z1, z2, target], [0, 0.35, 0.7, 1], 'move');
    }
    case 'corner':
      // Le ballon sort au poteau de corner et y reste posé — le centre viendra
      // avec l'événement suivant (tête/tir), qui repartira du poteau.
      return seq([prev, target, target], [0, 0.6, 1], 'move');
    case 'freeKick':
    case 'penalty':
      // Ballon posé : la frappe est jouée par l'événement suivant (but/arrêt/raté)
      return seq([prev, target, target], [0, 0.55, 1], 'move');
    case 'penalty_saved':
    case 'penalty_miss': {
      const end = ev.type === 'penalty_saved'
        ? { x: goalX - dir * 1.5, y: 25 + j(13, 2) }
        : { x: goalX, y: 25 + (j(14, 1) >= 0 ? 1 : -1) * (8 + j(15, 2)) };
      return seq([prev, end], [0, 1], 'strike');
    }
    case 'header':
      // Centre depuis le point précédent (poteau de corner) vers la tête
      return seq([prev, target], [0, 1], 'pass');
    case 'foul': {
      // Progression stoppée net par la faute
      if (far) return seq([prev, target], [0, 1], 'move');
      return seq([prev, buildup(0.6), target], [0, 0.65, 1], 'move');
    }
    case 'clearance':
      // Long dégagement — rapide et direct
      return seq([prev, target], [0, 1], 'move');
    case 'offside': {
      // Passe en profondeur… trop profonde : le ballon dépasse la ligne, coup de sifflet
      const beyond = { x: target.x + dir * 3, y: target.y };
      if (far) return seq([prev, target, beyond], [0, 0.75, 1], 'pass');
      return seq([prev, buildup(0.5), target, beyond], [0, 0.45, 0.8, 1], 'pass');
    }
    default:
      return seq([prev, target], [0, 1], 'move');
  }
}

// Pentagon seam points
const PENTAGON_ANGLES = [0, 1, 2, 3, 4].map((i) => (i / 5) * 2 * Math.PI - Math.PI / 2);
const BALL_R = 0.6;

// Déplacement des joueurs : transition CSS `.fs-token` (globals.css) — le spring
// framer-motion tenait un rAF JS actif en continu et faisait chauffer la machine.

/** Légende des maillots sous le terrain — quelle couleur = quelle équipe */
export function KitLegend({ homeName, awayName, homeColor, awayColor, awayAlternate }: {
  homeName: string;
  awayName: string;
  homeColor: string;
  awayColor: string;
  /** l'extérieur joue en maillot extérieur (couleurs principales trop proches) */
  awayAlternate?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-6 text-xs text-muted">
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="h-3 w-3 shrink-0 rounded-full border border-black/40" style={{ background: homeColor }} />
        <span className="truncate">{homeName}</span>
      </span>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="h-3 w-3 shrink-0 rounded-full border border-black/40" style={{ background: awayColor }} />
        <span className="truncate">{awayName}</span>
        {awayAlternate && <span className="shrink-0 text-[10px] text-muted/70">(maillot extérieur)</span>}
      </span>
    </div>
  );
}
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

  // Formations inconnues (données legacy, labels libres, match rechargé partiel) → fallback 4-3-3
  const homeLayout = FORMATION_POSITIONS[homeFormation] ?? FORMATION_POSITIONS['4-3-3'];
  const awayLayout = FORMATION_POSITIONS[awayFormation] ?? FORMATION_POSITIONS['4-3-3'];

  const rawHome = useMemo(
    () => enrichedHome
      ? buildPositionsFromTokens(state.homeOnPitch, enrichedHome, homeLayout)
      : homeLayout,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedHome, state.homeOnPitch.join(','), homeLayout],
  );
  const rawAway = useMemo(
    () => enrichedAway
      ? buildPositionsFromTokens(state.awayOnPitch, enrichedAway, awayLayout)
      : awayLayout,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrichedAway, state.awayOnPitch.join(','), awayLayout],
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

  // Scènes de coups de pied arrêtés — calculées en espace canonique
  // ("mon équipe attaque vers x=100, mon but est à x=0"), converties en SVG après.
  const { homeScene, awayScene } = useMemo(() => {
    if (!isActive || !lastEv?.ballPos) return { homeScene: null, awayScene: null };
    const raw = lastEv.ballPos; // espace moteur : home attaque vers x=100
    const hb = { x: raw.x, y: raw.y };
    const ab = { x: 100 - raw.x, y: raw.y };
    // Bases en espace canonique (dé-mirror des positions SVG)
    const hCanon = flipped ? homeBase.map(mirror) : homeBase;
    const aCanon = flipped ? awayBase : awayBase.map(mirror);
    return {
      homeScene: sceneTargets(lastEv, state.homeOnPitch, hCanon, lastEv.side === 'home', hb.x, hb.y),
      awayScene: sceneTargets(lastEv, state.awayOnPitch, aCanon, lastEv.side === 'away', ab.x, ab.y),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEv?.id, state.homeOnPitch.join(','), state.awayOnPitch.join(','), homeBase, awayBase, flipped, isActive]);

  // Positions finales SVG : scène (convertie depuis l'espace canonique) sinon base + déplacement.
  // SVG : home attaque vers 100 en 1re MT (identité), vers 0 en 2e (mirror) — inverse pour away.
  const homePos = homeBase.map((base, i) => {
    const sc = homeScene?.[i];
    if (sc) return flipped ? mirror(sc) : sc;
    const d = homeDisp[i] ?? { dx: 0, dy: 0 };
    return { x: base.x + d.dx, y: base.y + d.dy };
  });
  const awayPos = awayBase.map((base, i) => {
    const sc = awayScene?.[i];
    if (sc) return flipped ? sc : mirror(sc);
    const d = awayDisp[i] ?? { dx: 0, dy: 0 };
    return { x: base.x + d.dx, y: base.y + d.dy };
  });

  // Chemin du ballon pour l'événement courant — repart de la fin du chemin précédent
  // (continuité : corner → poteau, la tête suivante repart du poteau).
  // Idempotent par événement pour survivre aux double-renders.
  const ballRef = useRef<{ pos: { x: number; y: number }; start: { x: number; y: number }; evId: number }>({
    pos: { x: 50, y: 25 }, start: { x: 50, y: 25 }, evId: -1,
  });
  const ballPath = useMemo(() => {
    const ref = ballRef.current;
    const evId = lastEv?.id ?? -1;
    if (ref.evId !== evId) {
      ref.start = ref.pos;
      ref.evId = evId;
    }
    const path = buildBallPath(isActive ? lastEv : null, ref.start, flipped);
    ref.pos = { x: path.xs[path.xs.length - 1], y: path.ys[path.ys.length - 1] };
    return path;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEv?.id, flipped, isActive]);

  // Durée : l'animation remplit ~85% de la fenêtre du tick (bornée pour rester lisible)
  const tickMs = SPEED_TO_MS[state.speed] ?? 1000;
  const ballDur = tickMs === 0 ? 0 : Math.min(Math.max(tickMs * 0.85, 350), 1700) / 1000;
  const trailD = ballPath.xs.length > 1
    ? `M ${ballPath.xs[0]} ${ballPath.ys[0]} ` + ballPath.xs.slice(1).map((x, i) => `L ${x} ${ballPath.ys[i + 1]}`).join(' ')
    : null;

  // Possessing side from last event
  const possessing = lastEv?.side ?? null;

  return (
    <svg
      viewBox="-2 -3 104 56"
      className="w-full max-w-3xl rounded-xl border border-border shadow-subtle-md"
      style={{ background: 'var(--pitch)' }}
    >
      {/* ── Pelouse rayée (tonte) ── */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
        <rect key={`stripe-${i}`} x={i * 10} y="0" width="10" height="50" fill={i % 2 === 0 ? 'rgba(255,255,255,0.030)' : 'rgba(0,0,0,0.035)'} />
      ))}

      {/* ── Filets des buts ── */}
      <g opacity="0.55">
        <rect x="-1.1" y="21" width="1.4" height="8" fill="none" stroke="var(--pitch-line)" strokeWidth="0.22" />
        <line x1="-0.75" y1="23" x2="0.3" y2="23" stroke="var(--pitch-line)" strokeWidth="0.1" />
        <line x1="-0.75" y1="25" x2="0.3" y2="25" stroke="var(--pitch-line)" strokeWidth="0.1" />
        <line x1="-0.75" y1="27" x2="0.3" y2="27" stroke="var(--pitch-line)" strokeWidth="0.1" />
        <rect x="99.7" y="21" width="1.4" height="8" fill="none" stroke="var(--pitch-line)" strokeWidth="0.22" />
        <line x1="99.7" y1="23" x2="100.75" y2="23" stroke="var(--pitch-line)" strokeWidth="0.1" />
        <line x1="99.7" y1="25" x2="100.75" y2="25" stroke="var(--pitch-line)" strokeWidth="0.1" />
        <line x1="99.7" y1="27" x2="100.75" y2="27" stroke="var(--pitch-line)" strokeWidth="0.1" />
      </g>

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

      {/* ── Ligne de hors-jeu (événement offside) ── */}
      <AnimatePresence>
        {lastEv?.type === 'offside' && isActive && (() => {
          // Position SVG du ballon = point du hors-jeu
          const raw = lastEv.ballPos ?? { x: 50, y: 25 };
          const lx = flipped ? 100 - raw.x : raw.x;
          return (
            <motion.g key={`offside-${lastEv.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <line x1={lx} y1="1" x2={lx} y2="49" stroke="#FFB020" strokeWidth="0.3" strokeDasharray="1.4 1" opacity="0.8" />
              {/* Drapeau de touche levé */}
              <line x1={lx} y1={raw.y < 25 ? 0.5 : 49.5} x2={lx} y2={raw.y < 25 ? -1.5 : 51.5} stroke="#FFB020" strokeWidth="0.35" />
              <path d={raw.y < 25 ? `M ${lx} -1.5 l 2.2 0.7 l -2.2 0.7 Z` : `M ${lx} 51.5 l 2.2 -0.7 l -2.2 -0.7 Z`} fill="#FFB020" />
            </motion.g>
          );
        })()}
      </AnimatePresence>

      {/* ── Home players ── */}
      {homePos.slice(0, state.homeOnPitch.length).map((pos, i) => {
        const id = state.homeOnPitch[i];
        const cx = pos.x;
        const cy = pos.y;
        const isActivePlayer = isActive && (lastEv?.playerId === id || lastEv?.assistId === id);
        const hasBall = isActivePlayer && lastEv?.side === 'home';
        const isGk = i === 0;

        return (
          <g key={`h-${id}`} className="fs-token" style={{ transform: `translate(${cx}px, ${cy}px)` }}>
            {hasBall && (
              <circle
                r={2.4}
                fill="none" stroke={homeColor} strokeWidth="0.3"
                className="fs-pulse"
              />
            )}
            <circle
              r={isGk ? 1.6 : 1.5}
              fill={homeColor}
              stroke={hasBall ? '#FFE566' : isGk ? '#3A7A3A' : '#1A1A1A'}
              strokeWidth={hasBall ? 0.4 : isGk ? 0.35 : 0.2}
              opacity={0.95}
            />
          </g>
        );
      })}

      {/* ── Away players ── */}
      {awayPos.slice(0, state.awayOnPitch.length).map((pos, i) => {
        const id = state.awayOnPitch[i];
        const cx = pos.x;
        const cy = pos.y;
        const isActivePlayer = isActive && (lastEv?.playerId === id || lastEv?.assistId === id);
        const hasBall = isActivePlayer && lastEv?.side === 'away';
        const isGk = i === 0;

        return (
          <g key={`a-${id}`} className="fs-token" style={{ transform: `translate(${cx}px, ${cy}px)` }}>
            {hasBall && (
              <circle
                r={2.4}
                fill="none" stroke={awayColor} strokeWidth="0.3"
                className="fs-pulse"
              />
            )}
            <circle
              r={isGk ? 1.6 : 1.5}
              fill={awayColor}
              stroke={hasBall ? '#FFE566' : isGk ? '#3A7A3A' : '#1A1A1A'}
              strokeWidth={hasBall ? 0.4 : isGk ? 0.35 : 0.2}
              opacity={0.95}
            />
          </g>
        );
      })}

      {/* ── Carton (jaune/rouge) au-dessus du joueur sanctionné ── */}
      <AnimatePresence>
        {isActive && (lastEv?.type === 'yellow' || lastEv?.type === 'red') && lastEv.playerId && (() => {
          const hIdx = state.homeOnPitch.indexOf(lastEv.playerId);
          const aIdx = state.awayOnPitch.indexOf(lastEv.playerId);
          const pos = hIdx >= 0 ? homePos[hIdx] : aIdx >= 0 ? awayPos[aIdx] : null;
          if (!pos) return null;
          return (
            <motion.rect
              key={`card-${lastEv.id}`}
              x={pos.x - 0.7} y={pos.y - 4.4} width="1.4" height="2.1" rx="0.2"
              fill={lastEv.type === 'yellow' ? '#FFD34D' : '#E23D3D'}
              stroke="#1A1A1A" strokeWidth="0.1"
              initial={{ opacity: 0, y: 1.5 }}
              animate={{ opacity: [0, 1, 1, 0], y: [1.5, 0, 0, -0.5] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2, times: [0, 0.15, 0.8, 1] }}
            />
          );
        })()}
      </AnimatePresence>

      {/* ── Traînée de l'action (construction / frappe) ── */}
      {trailD && ballPath.kind !== 'move' && ballDur > 0 && (
        <motion.path
          key={`trail-${lastEv?.id ?? 'init'}`}
          d={trailD}
          fill="none"
          stroke={ballPath.kind === 'strike' ? 'rgba(255,229,102,0.55)' : 'rgba(255,255,255,0.45)'}
          strokeWidth="0.28"
          strokeDasharray="1.2 0.9"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.55 }}
          animate={{ pathLength: 1, opacity: [0.55, 0.45, 0] }}
          transition={{ duration: ballDur * 1.2, ease: 'easeOut', times: [0, 0.7, 1] }}
        />
      )}

      {/* ── Ballon (ombre + balle + coutures) animé le long du chemin ── */}
      <motion.g
        key={`ball-${lastEv?.id ?? 'init'}`}
        initial={{ x: ballPath.xs[0], y: ballPath.ys[0] }}
        animate={ballDur > 0 && ballPath.xs.length > 1
          ? { x: ballPath.xs, y: ballPath.ys }
          : { x: ballPath.xs[ballPath.xs.length - 1], y: ballPath.ys[ballPath.ys.length - 1] }}
        transition={ballDur > 0 && ballPath.xs.length > 1
          ? { duration: ballDur, times: ballPath.times, ease: 'easeInOut' }
          : { duration: 0 }}
      >
        <ellipse cx="0.3" cy="1.3" rx="1.0" ry="0.4" fill="rgba(0,0,0,0.22)" />
        <circle r="1.15" fill="white" stroke="#333" strokeWidth="0.14" />
        {PENTAGON_ANGLES.map((angle, i) => {
          const next = PENTAGON_ANGLES[(i + 1) % 5];
          return (
            <line
              key={`seam-${i}`}
              x1={Math.cos(angle) * BALL_R} y1={Math.sin(angle) * BALL_R}
              x2={Math.cos(next) * BALL_R} y2={Math.sin(next) * BALL_R}
              stroke="#444" strokeWidth="0.13" opacity="0.45"
            />
          );
        })}
      </motion.g>

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

      {/* ── Météo : pluie / orage / neige — animation CSS native (pas de rAF JS) ── */}
      {(state.weather?.kind === 'pluie' || state.weather?.kind === 'orage') && (
        <g style={{ animation: `fs-weather-fall ${state.weather?.kind === 'orage' ? 0.7 : 1.0}s linear infinite` }}>
          {[0, 1].map((copy) => (
            <g key={`rain-${copy}`} transform={`translate(0 ${copy === 0 ? -55 : -110})`} opacity={state.weather?.kind === 'orage' ? 0.4 : 0.28}>
              {Array.from({ length: 18 }, (_, i) => {
                const x = (i * 5.7 + (copy ? 2.8 : 0)) % 102 - 1;
                const y = (i * 37) % 100;
                return <line key={i} x1={x} y1={y} x2={x - 0.8} y2={y + 2.6} stroke="#9DB8D8" strokeWidth="0.18" />;
              })}
            </g>
          ))}
        </g>
      )}
      {state.weather?.kind === 'neige' && (
        <g style={{ animation: 'fs-weather-fall 5.5s linear infinite' }}>
          {[0, 1].map((copy) => (
            <g key={`snow-${copy}`} transform={`translate(0 ${copy === 0 ? -55 : -110})`} opacity={0.5}>
              {Array.from({ length: 16 }, (_, i) => {
                const x = (i * 6.4 + (copy ? 3.2 : 0)) % 102 - 1;
                const y = (i * 41) % 100;
                return <circle key={i} cx={x} cy={y} r={0.28} fill="#E8EEF5" />;
              })}
            </g>
          ))}
        </g>
      )}
      {state.weather?.kind === 'brouillard' && (
        <rect x="-2" y="-3" width="104" height="56" fill="rgba(210,218,226,0.13)" />
      )}
    </svg>
  );
}
