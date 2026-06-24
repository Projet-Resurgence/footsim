import { useState } from 'react';
import type { Formation, Player, SavedTactic } from '@/lib/types';
import { POSITION_LABEL, TACTIC_STYLE_LABEL } from '@/lib/types';

type Props = {
  savedTactics: SavedTactic[];
  activeTacticId?: string;
  players: Player[];
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename?: (id: string, name: string) => void;
};

// Minimal slot layout for minimap — x/y in % of pitch
const MINIMAP_LAYOUT: Record<Formation, { x: number; y: number }[]> = {
  '4-3-3': [
    { x: 50, y: 88 },
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 22, y: 50 }, { x: 50, y: 47 }, { x: 78, y: 50 },
    { x: 12, y: 23 }, { x: 50, y: 18 }, { x: 88, y: 23 },
  ],
  '4-4-2': [
    { x: 50, y: 88 },
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 8, y: 50 }, { x: 34, y: 49 }, { x: 66, y: 49 }, { x: 92, y: 50 },
    { x: 34, y: 20 }, { x: 66, y: 20 },
  ],
  '3-5-2': [
    { x: 50, y: 88 },
    { x: 24, y: 72 }, { x: 50, y: 73 }, { x: 76, y: 72 },
    { x: 8, y: 52 }, { x: 30, y: 53 }, { x: 50, y: 49 }, { x: 70, y: 53 }, { x: 92, y: 52 },
    { x: 34, y: 20 }, { x: 66, y: 20 },
  ],
  '4-2-3-1': [
    { x: 50, y: 88 },
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 34, y: 58 }, { x: 66, y: 58 },
    { x: 12, y: 40 }, { x: 50, y: 38 }, { x: 88, y: 40 },
    { x: 50, y: 18 },
  ],
  '5-3-2': [
    { x: 50, y: 88 },
    { x: 6, y: 70 }, { x: 24, y: 72 }, { x: 50, y: 73 }, { x: 76, y: 72 }, { x: 94, y: 70 },
    { x: 24, y: 50 }, { x: 50, y: 50 }, { x: 76, y: 50 },
    { x: 34, y: 20 }, { x: 66, y: 20 },
  ],
  '4-1-4-1': [
    { x: 50, y: 88 },
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 50, y: 60 },
    { x: 8, y: 46 }, { x: 34, y: 45 }, { x: 66, y: 45 }, { x: 92, y: 46 },
    { x: 50, y: 18 },
  ],
  '3-4-3': [
    { x: 50, y: 88 },
    { x: 24, y: 72 }, { x: 50, y: 73 }, { x: 76, y: 72 },
    { x: 8, y: 51 }, { x: 34, y: 49 }, { x: 66, y: 49 }, { x: 92, y: 51 },
    { x: 12, y: 23 }, { x: 50, y: 18 }, { x: 88, y: 23 },
  ],
  '4-3-2-1': [
    { x: 50, y: 88 },
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 22, y: 57 }, { x: 50, y: 55 }, { x: 78, y: 57 },
    { x: 34, y: 38 }, { x: 66, y: 38 },
    { x: 50, y: 18 },
  ],
  '4-5-1': [
    { x: 50, y: 88 },
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 8, y: 48 }, { x: 28, y: 46 }, { x: 50, y: 50 }, { x: 72, y: 46 }, { x: 92, y: 48 },
    { x: 50, y: 18 },
  ],
  '4-4-1-1': [
    { x: 50, y: 88 },
    { x: 12, y: 70 }, { x: 34, y: 72 }, { x: 66, y: 72 }, { x: 88, y: 70 },
    { x: 8, y: 51 }, { x: 34, y: 50 }, { x: 66, y: 50 }, { x: 92, y: 51 },
    { x: 50, y: 30 },
    { x: 50, y: 16 },
  ],
  '3-4-1-2': [
    { x: 50, y: 88 },
    { x: 24, y: 72 }, { x: 50, y: 73 }, { x: 76, y: 72 },
    { x: 8, y: 52 }, { x: 34, y: 50 }, { x: 66, y: 50 }, { x: 92, y: 52 },
    { x: 50, y: 34 },
    { x: 34, y: 18 }, { x: 66, y: 18 },
  ],
  '5-4-1': [
    { x: 50, y: 88 },
    { x: 6, y: 70 }, { x: 24, y: 72 }, { x: 50, y: 73 }, { x: 76, y: 72 }, { x: 94, y: 70 },
    { x: 8, y: 48 }, { x: 34, y: 46 }, { x: 66, y: 46 }, { x: 92, y: 48 },
    { x: 50, y: 18 },
  ],
  '3-6-1': [
    { x: 50, y: 88 },
    { x: 24, y: 72 }, { x: 50, y: 73 }, { x: 76, y: 72 },
    { x: 6, y: 50 }, { x: 24, y: 52 }, { x: 38, y: 47 }, { x: 62, y: 47 }, { x: 76, y: 52 }, { x: 94, y: 50 },
    { x: 50, y: 18 },
  ],
};

function TacticMinimap({ formation, lineup, players, tokenPositions }: { formation: Formation; lineup: string[]; players: Player[]; tokenPositions?: Record<string, { x: number; y: number }> }) {
  const slots = MINIMAP_LAYOUT[formation];
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Build dots: if tokenPositions available use them (one dot per lineup player), else fall back to formation layout
  const dots: { cx: number; cy: number; filled: boolean }[] = [];
  if (tokenPositions && lineup.length > 0) {
    for (const id of lineup) {
      const tok = tokenPositions[id];
      if (tok) {
        dots.push({ cx: tok.x, cy: (tok.y / 100) * 140, filled: !!playerMap.get(id) });
      }
    }
    // If some lineup players had no token, fall back to layout for those
    if (dots.length < lineup.length && slots) {
      const covered = new Set(lineup.filter((id) => tokenPositions[id]));
      lineup.forEach((id, i) => {
        if (!covered.has(id) && slots[i]) {
          dots.push({ cx: slots[i].x, cy: (slots[i].y / 100) * 140, filled: !!playerMap.get(id) });
        }
      });
    }
  } else if (slots) {
    slots.forEach((slot, i) => {
      const id = lineup[i];
      dots.push({ cx: slot.x, cy: (slot.y / 100) * 140, filled: !!(id && playerMap.get(id)) });
    });
  }

  if (dots.length === 0) return null;

  return (
    <svg viewBox="0 0 100 140" width="80" height="112" className="shrink-0 rounded overflow-hidden">
      <rect width="100" height="140" fill="var(--pitch)" />
      <line x1="5" y1="70" x2="95" y2="70" stroke="var(--pitch-line)" strokeWidth="0.8" opacity="0.5" />
      <circle cx="50" cy="70" r="12" stroke="var(--pitch-line)" strokeWidth="0.8" fill="none" opacity="0.4" />
      <rect x="25" y="5" width="50" height="20" stroke="var(--pitch-line)" strokeWidth="0.8" fill="none" opacity="0.4" />
      <rect x="25" y="115" width="50" height="20" stroke="var(--pitch-line)" strokeWidth="0.8" fill="none" opacity="0.4" />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.cx} cy={d.cy} r={4.5}
          fill={d.filled ? 'white' : 'rgba(255,255,255,0.25)'}
          stroke={d.filled ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)'}
          strokeWidth="0.8"
        />
      ))}
    </svg>
  );
}

function TacticCard({
  tactic,
  players,
  isActive,
  onActivate,
  onDelete,
  onRename,
}: {
  tactic: SavedTactic;
  players: Player[];
  isActive: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onRename?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(tactic.name);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const lineup = tactic.lineup.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
  const activeCustomStyle = tactic.activeCustomStyleId
    ? tactic.customStyles?.find((s) => s.id === tactic.activeCustomStyleId)
    : undefined;
  const formationDisplay = tactic.formationLabel ?? tactic.formation;
  const styleDisplay = activeCustomStyle
    ? `🎨 ${activeCustomStyle.name}`
    : TACTIC_STYLE_LABEL[tactic.style] ?? tactic.style;

  const gk = lineup.filter((p) => p.position === 'GK');
  const def = lineup.filter((p) => ['CB', 'LB', 'RB'].includes(p.position));
  const mid = lineup.filter((p) => ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.position));
  const att = lineup.filter((p) => ['LW', 'RW', 'ST'].includes(p.position));
  const groups = [
    { label: 'ATT', players: att },
    { label: 'MID', players: mid },
    { label: 'DEF', players: def },
    { label: 'GK', players: gk },
  ].filter((g) => g.players.length > 0);

  return (
    <div className={`rounded-lg border p-3 space-y-2 transition-colors flex-shrink-0 w-64 ${isActive ? 'border-accent bg-accent/5' : 'border-border bg-bg'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); onRename?.(nameVal); setEditing(false); }} className="flex gap-1">
              <input
                autoFocus
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                className="flex-1 min-w-0 rounded border border-accent bg-bg px-1.5 py-0.5 text-xs"
                onBlur={() => { onRename?.(nameVal); setEditing(false); }}
              />
            </form>
          ) : (
            <button
              className={`font-medium text-sm truncate block w-full text-left hover:underline ${isActive ? 'text-accent' : ''}`}
              onClick={() => onRename && setEditing(true)}
              title="Cliquer pour renommer"
            >
              {tactic.name}
            </button>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-bold text-base">{formationDisplay}</span>
            <span className="text-xs text-muted truncate">{styleDisplay}</span>
          </div>
        </div>
        <button onClick={onDelete} className="text-muted hover:text-danger text-xs shrink-0 transition-colors mt-0.5">✕</button>
      </div>

      {/* Minimap + Lineup */}
      <div className="flex gap-2">
        <TacticMinimap formation={tactic.formation} lineup={tactic.lineup} players={players} tokenPositions={tactic.tokenPositions} />
        <div className="flex-1 min-w-0">
          {groups.length > 0 ? (
            <div className="space-y-1">
              {groups.map((g) => (
                <div key={g.label} className="flex items-start gap-1.5">
                  <span className="w-7 shrink-0 text-[9px] font-bold text-muted uppercase pt-0.5">{g.label}</span>
                  <div className="flex flex-wrap gap-1">
                    {g.players.map((p) => (
                      <span key={p.id} className="text-[10px] bg-border/40 rounded px-1 py-0.5 leading-tight" title={`${p.firstName} ${p.lastName} · ${POSITION_LABEL[p.position]} · ${p.overall}`}>
                        {p.lastName}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted">Aucun joueur assigné.</p>
          )}
        </div>
      </div>

      {/* Activate button */}
      <button
        onClick={onActivate}
        className={`w-full rounded border px-2 py-1 text-xs font-medium transition-colors ${
          isActive
            ? 'border-accent text-accent cursor-default'
            : 'border-border text-muted hover:border-accent hover:text-accent'
        }`}
      >
        {isActive ? '✓ Active' : 'Activer'}
      </button>
    </div>
  );
}

export function TacticsSummary({ savedTactics, activeTacticId, players, onActivate, onDelete, onRename }: Props) {
  if (savedTactics.length === 0) return null;

  return (
    <div className="space-y-2">
      <span className="text-sm text-muted">{savedTactics.length} tactique(s) sauvegardée(s)</span>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {savedTactics.map((t) => (
          <TacticCard
            key={t.id}
            tactic={t}
            players={players}
            isActive={t.id === activeTacticId}
            onActivate={() => onActivate(t.id)}
            onDelete={() => onDelete(t.id)}
            onRename={onRename ? (name) => onRename(t.id, name) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
