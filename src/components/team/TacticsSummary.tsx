import { useState } from 'react';
import type { Player, SavedTactic } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';

type Props = {
  savedTactics: SavedTactic[];
  activeTacticId?: string;
  players: Player[];
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename?: (id: string, name: string) => void;
};

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

      {/* Lineup */}
      {groups.length > 0 ? (
        <div className="space-y-1">
          {groups.map((g) => (
            <div key={g.label} className="flex items-start gap-1.5">
              <span className="w-7 shrink-0 text-[9px] font-bold text-muted uppercase pt-0.5">{g.label}</span>
              <div className="flex flex-wrap gap-1">
                {g.players.map((p) => (
                  <span key={p.id} className="text-[10px] bg-border/40 rounded px-1 py-0.5 leading-tight" title={`${p.firstName} ${p.lastName} · ${p.position} · ${p.overall}`}>
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
