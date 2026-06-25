import { useCallback, useEffect, useRef, useState } from 'react';
import type { Formation, Player, Position } from '@/lib/types';
import { POSITION_LABEL } from '@/lib/types';

// ── position zones ────────────────────────────────────────────────────────────
//
// Terrain: y=0 (haut=attaque), y=100 (bas=GK), x=0 (gauche), x=100 (droite)
// Chaque zone rectangulaire → 1 poste exact.
// Attribution: zone contenant le token. Si hors zone → zone la plus proche (dist² centre).

type PosZone = {
  pos: Position;
  x1: number; x2: number; // x range %
  y1: number; y2: number; // y range %
  cx: number; cy: number; // center (precomputed)
  color: string;          // bg fill rgba
  border: string;         // border color rgba
};

const POS_ZONES: PosZone[] = [
  // GK
  { pos: 'GK', x1: 30, x2: 70, y1: 84, y2: 98, cx: 50, cy: 91, color: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.5)'    },
  // DEF
  { pos: 'LB', x1:  2, x2: 32, y1: 68, y2: 84, cx: 17, cy: 76, color: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.45)'  },
  { pos: 'CB', x1: 28, x2: 72, y1: 68, y2: 84, cx: 50, cy: 76, color: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.45)'  },
  { pos: 'RB', x1: 68, x2: 98, y1: 68, y2: 84, cx: 83, cy: 76, color: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.45)'  },
  // DM
  { pos: 'DM', x1: 22, x2: 78, y1: 54, y2: 68, cx: 50, cy: 61, color: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.45)'  },
  // CM row
  { pos: 'LM', x1:  2, x2: 32, y1: 38, y2: 54, cx: 17, cy: 46, color: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.45)'   },
  { pos: 'CM', x1: 28, x2: 72, y1: 38, y2: 54, cx: 50, cy: 46, color: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.45)'   },
  { pos: 'RM', x1: 68, x2: 98, y1: 38, y2: 54, cx: 83, cy: 46, color: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.45)'   },
  // AM
  { pos: 'AM', x1: 22, x2: 78, y1: 25, y2: 38, cx: 50, cy: 31, color: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.45)'  },
  // ATT row
  { pos: 'LW', x1:  2, x2: 32, y1:  4, y2: 25, cx: 17, cy: 14, color: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.45)'   },
  { pos: 'ST', x1: 28, x2: 72, y1:  4, y2: 25, cx: 50, cy: 14, color: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.45)'   },
  { pos: 'RW', x1: 68, x2: 98, y1:  4, y2: 25, cx: 83, cy: 14, color: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.45)'   },
];

const POS_ZONE_COLORS: Record<Position, string> = {
  GK: 'border-yellow-400 bg-yellow-400/20 text-yellow-200',
  LB: 'border-blue-400 bg-blue-400/20 text-blue-100',
  CB: 'border-blue-400 bg-blue-400/20 text-blue-100',
  RB: 'border-blue-400 bg-blue-400/20 text-blue-100',
  DM: 'border-teal-400 bg-teal-400/20 text-teal-100',
  LM: 'border-green-400 bg-green-400/20 text-green-100',
  CM: 'border-green-400 bg-green-400/20 text-green-100',
  RM: 'border-green-400 bg-green-400/20 text-green-100',
  AM: 'border-orange-400 bg-orange-400/20 text-orange-100',
  LW: 'border-red-400 bg-red-400/20 text-red-100',
  ST: 'border-red-400 bg-red-400/20 text-red-100',
  RW: 'border-red-400 bg-red-400/20 text-red-100',
};

function posFromCoords(x: number, y: number): Position {
  // Find zone containing the point
  const hit = POS_ZONES.find((z) => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2);
  if (hit) return hit.pos;
  // Fallback: closest zone center
  let best = POS_ZONES[0];
  let bestD = Infinity;
  for (const z of POS_ZONES) {
    const d = (x - z.cx) ** 2 + (y - z.cy) ** 2;
    if (d < bestD) { bestD = d; best = z; }
  }
  return best.pos;
}

function deriveFormation(tokens: TokenState[]): string {
  const positions = tokens.map((t) => posFromCoords(t.x, t.y));
  const def = positions.filter((p) => ['LB', 'CB', 'RB'].includes(p)).length;
  const dm  = positions.filter((p) => p === 'DM').length;
  const mid = positions.filter((p) => ['LM', 'CM', 'RM'].includes(p)).length;
  const am  = positions.filter((p) => p === 'AM').length;
  const att = positions.filter((p) => ['LW', 'ST', 'RW'].includes(p)).length;

  // Build layers: only include non-zero groups
  const layers = [
    ...(dm  > 0 ? [dm]  : []),
    ...(mid > 0 ? [mid] : []),
    ...(am  > 0 ? [am]  : []),
  ];
  // If all mid-tier is zero, fall back to single mid count
  if (layers.length === 0) return `${def}-0-${att}`;
  return `${def}-${layers.join('-')}-${att}`;
}

function derivePositions(tokens: TokenState[]): Position[] {
  return tokens.map((t) => posFromCoords(t.x, t.y));
}

// ── types ─────────────────────────────────────────────────────────────────────

type TokenState = {
  id: string; // player id or 'gk'
  x: number;  // percent
  y: number;  // percent
};

const PREDEFINED_FORMATIONS: Formation[] = [
  '4-3-3','4-4-2','3-5-2','4-2-3-1','5-3-2','4-1-4-1','3-4-3','4-3-2-1',
  '4-5-1','4-4-1-1','3-4-1-2','5-4-1','3-6-1',
];

/** Find the closest predefined formation by matching def/mid/att counts */
export function closestFormation(label: string): Formation {
  const parts = label.split('-').map(Number);
  if (parts.length < 2) return '4-3-3';
  const [def, ...rest] = parts;
  const att = rest[rest.length - 1] ?? 0;
  const mid = rest.slice(0, -1).reduce((a, b) => a + b, 0);
  let best: Formation = '4-3-3';
  let bestDist = Infinity;
  for (const f of PREDEFINED_FORMATIONS) {
    const fp = f.split('-').map(Number);
    const fd = fp[0];
    const fa = fp[fp.length - 1];
    const fm = fp.slice(1, -1).reduce((a, b) => a + b, 0);
    const dist = Math.abs(fd - def) + Math.abs(fm - mid) + Math.abs(fa - att);
    if (dist < bestDist) { bestDist = dist; best = f; }
  }
  return best;
}

export type FormationEditorResult = {
  formation: string;   // display label e.g. "5-2-3"
  closestPredefined: Formation;
  lineup: string[]; // ordered player ids [gk, ...outfield]
  positionMap: Record<string, Position>;
  tokenPositions: Record<string, { x: number; y: number }>;
};

type Props = {
  players: Player[];
  initialLineup?: string[];
  /** Outfield slot positions from current formation (10 slots, GK excluded) */
  initialSlots?: { x: number; y: number }[];
  onSave: (result: FormationEditorResult) => void;
  onCancel: () => void;
};

// default positions for outfield players
function defaultOutfieldPositions(players: Player[], slots?: { x: number; y: number }[]): TokenState[] {
  const outfield = players.filter((p) => p.position !== 'GK').slice(0, 10);
  const fallback = [
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 22, y: 50 }, { x: 50, y: 47 }, { x: 78, y: 50 },
    { x: 12, y: 23 }, { x: 50, y: 18 }, { x: 88, y: 23 },
  ];
  const coords = slots ?? fallback;
  return outfield.map((p, i) => ({
    id: p.id,
    x: coords[i]?.x ?? 50,
    y: coords[i]?.y ?? 50,
  }));
}

export function FormationEditor({ players, initialLineup, initialSlots, onSave, onCancel }: Props) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [tokens, setTokens] = useState<TokenState[]>(() => {
    const gk = players.find((p) => p.position === 'GK');
    const outfield = players.filter((p) => p.position !== 'GK');

    if (initialLineup && initialLineup.length === 11) {
      const playerMap = new Map(players.map((p) => [p.id, p]));
      const lineupPlayers = initialLineup.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
      const gkPlayer = lineupPlayers.find((p) => p.position === 'GK');
      const outfieldPlayers = lineupPlayers.filter((p) => p.position !== 'GK');
      const gkToken: TokenState = { id: gkPlayer?.id ?? gk?.id ?? '', x: 50, y: 88 };
      const outfieldTokens = defaultOutfieldPositions(outfieldPlayers.length > 0 ? outfieldPlayers : outfield, initialSlots);
      return [gkToken, ...outfieldTokens];
    }

    const gkToken: TokenState = { id: gk?.id ?? '', x: 50, y: 88 };
    const outfieldTokens = defaultOutfieldPositions(outfield, initialSlots);
    return [gkToken, ...outfieldTokens];
  });

  const [dragging, setDragging] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<string | null>(null); // player to swap with dragging token
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const playerMap = new Map(players.map((p) => [p.id, p]));

  // outfield tokens only (GK fixed)
  const outfieldTokens = tokens.slice(1);
  const formation = deriveFormation(outfieldTokens);
  const positions = derivePositions(outfieldTokens);
  const positionMap: Record<string, Position> = {};
  outfieldTokens.forEach((t, i) => { positionMap[t.id] = positions[i]; });
  const gkId = tokens[0]?.id;
  if (gkId) positionMap[gkId] = 'GK';

  function getPitchRect() {
    return pitchRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
  }

  const onMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    if (id === tokens[0]?.id) return; // GK not draggable
    e.preventDefault();
    const token = tokens.find((t) => t.id === id)!;
    const rect = getPitchRect();
    dragOffset.current = {
      dx: e.clientX - rect.left - (token.x / 100) * rect.width,
      dy: e.clientY - rect.top - (token.y / 100) * rect.height,
    };
    setDragging(id);
  }, [tokens]);

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: MouseEvent) {
      const rect = getPitchRect();
      const rawX = e.clientX - rect.left - dragOffset.current.dx;
      const rawY = e.clientY - rect.top - dragOffset.current.dy;
      const x = Math.max(3, Math.min(97, (rawX / rect.width) * 100));
      const y = Math.max(3, Math.min(97, (rawY / rect.height) * 100));

      // Check if hovering over another token (for swap highlight)
      const SNAP = 10; // percent radius
      const hover = tokens.find((t) => t.id !== dragging && t.id !== tokens[0]?.id &&
        Math.abs(t.x - x) < SNAP && Math.abs(t.y - y) < SNAP);
      setSwapTarget(hover?.id ?? null);

      setTokens((prev) => prev.map((t) => t.id === dragging ? { ...t, x, y } : t));
    }

    function onUp() {
      // If hovering over another token, swap positions
      if (swapTarget) {
        setTokens((prev) => {
          const dragToken = prev.find((t) => t.id === dragging)!;
          const swapToken = prev.find((t) => t.id === swapTarget)!;
          return prev.map((t) => {
            if (t.id === dragging) return { ...t, x: swapToken.x, y: swapToken.y };
            if (t.id === swapTarget) return { ...t, x: dragToken.x, y: dragToken.y };
            return t;
          });
        });
      }
      setDragging(null);
      setSwapTarget(null);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, swapTarget, tokens]);

  // Touch support
  useEffect(() => {
    if (!dragging) return;

    function onTouch(e: TouchEvent) {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = getPitchRect();
      const rawX = touch.clientX - rect.left - dragOffset.current.dx;
      const rawY = touch.clientY - rect.top - dragOffset.current.dy;
      const x = Math.max(3, Math.min(97, (rawX / rect.width) * 100));
      const y = Math.max(3, Math.min(97, (rawY / rect.height) * 100));
      setTokens((prev) => prev.map((t) => t.id === dragging ? { ...t, x, y } : t));
    }

    function onTouchEnd() {
      setDragging(null);
      setSwapTarget(null);
    }

    window.addEventListener('touchmove', onTouch, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [dragging]);

  function handleSave() {
    const lineup = tokens.map((t) => t.id);
    const tokenPositions: Record<string, { x: number; y: number }> = {};
    tokens.forEach((t) => { tokenPositions[t.id] = { x: t.x, y: t.y }; });
    onSave({ formation, closestPredefined: closestFormation(formation), lineup, positionMap, tokenPositions });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-muted">Formation détectée : </span>
          <span className="font-bold text-accent text-lg">{formation}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-border text-muted hover:text-text transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/90 transition-colors font-medium"
          >
            Valider cette formation
          </button>
        </div>
      </div>

      <p className="text-xs text-muted">
        Glisse les joueurs dans les zones. Chaque zone correspond à un poste précis.
      </p>

      {/* Pitch */}
      <div
        ref={pitchRef}
        className="relative select-none"
        style={{
          width: '100%',
          aspectRatio: '7/10',
          maxWidth: 420,
          background: 'var(--pitch)',
          borderRadius: 8,
          border: '2px solid var(--pitch-line)',
          userSelect: 'none',
        }}
      >
        {/* Position zones */}
        {POS_ZONES.map((z) => (
          <div
            key={z.pos}
            style={{
              position: 'absolute',
              left: `${z.x1}%`,
              top: `${z.y1}%`,
              width: `${z.x2 - z.x1}%`,
              height: `${z.y2 - z.y1}%`,
              background: z.color,
              border: `1px dashed ${z.border}`,
              borderRadius: 4,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 9, color: z.border, fontWeight: 700, letterSpacing: 1, opacity: 0.9, pointerEvents: 'none' }}>
              {POSITION_LABEL[z.pos]}
            </span>
          </div>
        ))}

        {/* Midfield line */}
        <div style={{ position: 'absolute', top: '50%', left: '8%', right: '8%', height: 1, background: 'var(--pitch-line)', opacity: 0.4 }} />
        {/* Centre circle */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '18%', paddingBottom: '18%', transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '1px solid var(--pitch-line)', opacity: 0.4 }} />
        {/* Top penalty box */}
        <div style={{ position: 'absolute', top: '4%', left: '25%', right: '25%', height: '14%', border: '1px solid var(--pitch-line)', opacity: 0.35 }} />
        {/* Bottom penalty box */}
        <div style={{ position: 'absolute', bottom: '4%', left: '25%', right: '25%', height: '14%', border: '1px solid var(--pitch-line)', opacity: 0.35 }} />

        {tokens.map((token) => {
          const player = playerMap.get(token.id);
          if (!player) return null;
          const isGK = token.id === tokens[0]?.id;
          const isDragging = token.id === dragging;
          const isSwapTarget = token.id === swapTarget;
          const pos = positionMap[token.id] ?? 'CM';

          return (
            <div
              key={token.id}
              onMouseDown={(e) => onMouseDown(token.id, e)}
              onTouchStart={(e) => {
                if (isGK) return;
                e.preventDefault();
                const touch = e.touches[0];
                const rect = getPitchRect();
                dragOffset.current = {
                  dx: touch.clientX - rect.left - (token.x / 100) * rect.width,
                  dy: touch.clientY - rect.top - (token.y / 100) * rect.height,
                };
                setDragging(token.id);
              }}
              style={{
                position: 'absolute',
                left: `${token.x}%`,
                top: `${token.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: isDragging ? 20 : 10,
                cursor: isGK ? 'default' : isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'box-shadow 0.1s',
              }}
              className="flex flex-col items-center gap-0.5"
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-md
                  ${isSwapTarget ? 'ring-2 ring-white scale-110' : ''}
                  ${isDragging ? 'opacity-90 scale-110' : ''}
                  ${POS_ZONE_COLORS[pos]}
                `}
              >
                {player.firstName[0]}{player.lastName[0]}
              </div>
              <span className="max-w-[64px] truncate rounded bg-black/50 px-0.5 text-center text-[9px] leading-tight text-white/90 whitespace-nowrap">
                {pos ? POSITION_LABEL[pos] : '?'} · {player.lastName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Player list below pitch */}
      <div className="text-xs text-muted space-y-0.5 max-h-36 overflow-y-auto rounded border border-border p-2">
        {tokens.map((token) => {
          const player = playerMap.get(token.id);
          if (!player) return null;
          const pos = positionMap[token.id];
          return (
            <div key={token.id} className="flex justify-between">
              <span>{player.firstName} {player.lastName}</span>
              <span className="text-accent">{pos ? POSITION_LABEL[pos] : '?'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
