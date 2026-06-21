import { useCallback, useEffect, useRef, useState } from 'react';
import type { Formation, Player, Position } from '@/lib/types';
import { POSITION_LABEL } from '@/lib/types';

// ── position inference from pitch coords ─────────────────────────────────────

// Y zones (percent, 0=top=attack, 100=bottom=GK)
const Y_GK = 85;    // >= this → GK zone
const Y_DEF = 65;   // >= this → DEF zone
const Y_MID = 35;   // >= this → MID zone
// < Y_MID → ATT zone

type Zone = 'GK' | 'DEF' | 'MID' | 'ATT';

function yZone(y: number): Zone {
  if (y >= Y_GK) return 'GK';
  if (y >= Y_DEF) return 'DEF';
  if (y >= Y_MID) return 'MID';
  return 'ATT';
}

function inferPosition(x: number, y: number, sameZone: { x: number; y: number }[]): Position {
  const zone = yZone(y);
  if (zone === 'GK') return 'GK';

  // Sort players in zone by X to assign left/center/right roles
  const sorted = [...sameZone].sort((a, b) => a.x - b.x);
  const rank = sorted.findIndex((p) => p.x === x && p.y === y);
  const n = sorted.length;

  if (zone === 'DEF') {
    if (n === 2) return rank === 0 ? 'LB' : 'RB';
    if (n === 3) return rank === 0 ? 'LB' : rank === 2 ? 'RB' : 'CB';
    if (n === 4) return rank === 0 ? 'LB' : rank === 3 ? 'RB' : 'CB';
    if (n === 5) return rank === 0 ? 'LB' : rank === 4 ? 'RB' : 'CB';
    if (n >= 6) return rank === 0 ? 'LB' : rank === n - 1 ? 'RB' : 'CB';
    return 'CB';
  }

  if (zone === 'MID') {
    if (n === 1) return 'CM';
    if (n === 2) return rank === 0 ? 'LM' : 'RM';
    if (n === 3) return rank === 0 ? 'LM' : rank === 2 ? 'RM' : 'CM';
    if (n === 4) return rank === 0 ? 'LM' : rank === 3 ? 'RM' : 'CM';
    if (n === 5) return rank === 0 ? 'LM' : rank === 4 ? 'RM' : rank === 2 ? 'DM' : 'CM';
    if (n >= 6) return rank === 0 ? 'LM' : rank === n - 1 ? 'RM' : rank === Math.floor(n / 2) ? 'DM' : 'CM';
    return 'CM';
  }

  // ATT zone
  if (n === 1) return 'ST';
  if (n === 2) return rank === 0 ? 'LW' : 'RW';
  if (n === 3) return rank === 0 ? 'LW' : rank === 2 ? 'RW' : 'ST';
  if (n >= 4) return rank === 0 ? 'LW' : rank === n - 1 ? 'RW' : rank <= 1 ? 'AM' : 'ST';
  return 'ST';
}

function deriveFormation(tokens: TokenState[]): string {
  const zones = tokens.map((t) => yZone(t.y));
  const def = zones.filter((z) => z === 'DEF').length;
  const mid = zones.filter((z) => z === 'MID').length;
  const att = zones.filter((z) => z === 'ATT').length;
  return `${def}-${mid}-${att}`;
}

function derivePositions(tokens: TokenState[]): Position[] {
  return tokens.map((token) => {
    const zone = yZone(token.y);
    const sameZone = tokens.filter((t) => yZone(t.y) === zone);
    return inferPosition(token.x, token.y, sameZone);
  });
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
};

type Props = {
  players: Player[];
  initialLineup?: string[];
  onSave: (result: FormationEditorResult) => void;
  onCancel: () => void;
};

// default positions for outfield players on a blank pitch
function defaultOutfieldPositions(players: Player[]): TokenState[] {
  const outfield = players.filter((p) => p.position !== 'GK').slice(0, 10);
  // spread them across a 4-3-3-like default
  const defaults = [
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 22, y: 50 }, { x: 50, y: 47 }, { x: 78, y: 50 },
    { x: 12, y: 23 }, { x: 50, y: 18 }, { x: 88, y: 23 },
  ];
  return outfield.map((p, i) => ({
    id: p.id,
    x: defaults[i]?.x ?? 50,
    y: defaults[i]?.y ?? 50,
  }));
}

export function FormationEditor({ players, initialLineup, onSave, onCancel }: Props) {
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
      const outfieldTokens = defaultOutfieldPositions(outfieldPlayers.length > 0 ? outfieldPlayers : outfield);
      return [gkToken, ...outfieldTokens];
    }

    const gkToken: TokenState = { id: gk?.id ?? '', x: 50, y: 88 };
    const outfieldTokens = defaultOutfieldPositions(outfield);
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
    onSave({ formation, closestPredefined: closestFormation(formation), lineup, positionMap });
  }

  const ZONE_COLORS: Record<Zone, string> = {
    GK: 'border-yellow-400 bg-yellow-400/20 text-yellow-200',
    DEF: 'border-blue-400 bg-blue-400/20 text-blue-100',
    MID: 'border-green-400 bg-green-400/20 text-green-100',
    ATT: 'border-red-400 bg-red-400/20 text-red-100',
  };

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
        Glisse les joueurs sur le terrain. La formation se calcule automatiquement. Le gardien est fixe.
      </p>

      {/* Zone legend */}
      <div className="flex gap-3 text-xs">
        {(['ATT', 'MID', 'DEF', 'GK'] as Zone[]).map((z) => (
          <span key={z} className={`rounded px-2 py-0.5 border ${ZONE_COLORS[z]}`}>{z}</span>
        ))}
      </div>

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
        {/* Zone bands (visual) */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${Y_MID}%`, background: 'rgba(239,68,68,0.04)', borderBottom: '1px dashed rgba(239,68,68,0.2)' }} />
        <div style={{ position: 'absolute', top: `${Y_MID}%`, left: 0, right: 0, height: `${Y_DEF - Y_MID}%`, background: 'rgba(34,197,94,0.04)', borderBottom: '1px dashed rgba(34,197,94,0.2)' }} />
        <div style={{ position: 'absolute', top: `${Y_DEF}%`, left: 0, right: 0, height: `${Y_GK - Y_DEF}%`, background: 'rgba(59,130,246,0.04)', borderBottom: '1px dashed rgba(59,130,246,0.2)' }} />

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
          const zone = isGK ? 'GK' : yZone(token.y);
          const pos = positionMap[token.id];

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
                  ${ZONE_COLORS[zone]}
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
