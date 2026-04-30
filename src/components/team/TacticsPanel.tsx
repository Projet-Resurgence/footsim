import { useState } from 'react';
import type { Formation, Player, TacticStyle, Team, TeamTactics } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { pickXI } from '@/lib/sim/lineup';

const FORMATIONS: Formation[] = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2', '4-1-4-1', '3-4-3', '4-3-2-1'];
const TACTIC_STYLES: TacticStyle[] = ['possession', 'contre-attaque', 'direct', 'pressing'];

type SlotDef = { pos: string; x: number; y: number };

const FORMATION_LAYOUT: Record<Formation, SlotDef[]> = {
  '4-3-3': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'CM', x: 22, y: 50 }, { pos: 'CM', x: 50, y: 47 }, { pos: 'CM', x: 78, y: 50 },
    { pos: 'LW', x: 12, y: 23 }, { pos: 'ST', x: 50, y: 18 }, { pos: 'RW', x: 88, y: 23 },
  ],
  '4-4-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'LM', x: 8, y: 50 }, { pos: 'CM', x: 34, y: 49 }, { pos: 'CM', x: 66, y: 49 }, { pos: 'RM', x: 92, y: 50 },
    { pos: 'ST', x: 34, y: 20 }, { pos: 'ST', x: 66, y: 20 },
  ],
  '3-5-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 8, y: 52 }, { pos: 'DM', x: 30, y: 53 }, { pos: 'CM', x: 50, y: 49 }, { pos: 'CM', x: 70, y: 53 }, { pos: 'RM', x: 92, y: 52 },
    { pos: 'ST', x: 34, y: 20 }, { pos: 'ST', x: 66, y: 20 },
  ],
  '4-2-3-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 34, y: 58 }, { pos: 'DM', x: 66, y: 58 },
    { pos: 'LW', x: 12, y: 40 }, { pos: 'AM', x: 50, y: 38 }, { pos: 'RW', x: 88, y: 40 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '5-3-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 6, y: 70 }, { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 }, { pos: 'RB', x: 94, y: 70 },
    { pos: 'CM', x: 24, y: 50 }, { pos: 'DM', x: 50, y: 50 }, { pos: 'CM', x: 76, y: 50 },
    { pos: 'ST', x: 34, y: 20 }, { pos: 'ST', x: 66, y: 20 },
  ],
  '4-1-4-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 50, y: 60 },
    { pos: 'LM', x: 8, y: 46 }, { pos: 'CM', x: 34, y: 45 }, { pos: 'CM', x: 66, y: 45 }, { pos: 'RM', x: 92, y: 46 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '3-4-3': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 8, y: 51 }, { pos: 'CM', x: 34, y: 49 }, { pos: 'CM', x: 66, y: 49 }, { pos: 'RM', x: 92, y: 51 },
    { pos: 'LW', x: 12, y: 23 }, { pos: 'ST', x: 50, y: 18 }, { pos: 'RW', x: 88, y: 23 },
  ],
  '4-3-2-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'CM', x: 22, y: 57 }, { pos: 'CM', x: 50, y: 55 }, { pos: 'CM', x: 78, y: 57 },
    { pos: 'AM', x: 34, y: 38 }, { pos: 'AM', x: 66, y: 38 },
    { pos: 'ST', x: 50, y: 18 },
  ],
};

type Props = {
  team: Team;
  players: Player[];
  onSave: (tactics: TeamTactics) => Promise<void>;
};

export function TacticsPanel({ team, players, onSave }: Props) {
  const [formation, setFormation] = useState<Formation>(team.tactics?.formation ?? team.formation);
  const [style, setStyle] = useState<TacticStyle>(team.tactics?.style ?? 'possession');
  const [lineup, setLineup] = useState<(string | null)[]>(
    team.tactics?.lineup?.length === 11 ? [...team.tactics.lineup] : Array(11).fill(null),
  );
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function changeFormation(f: Formation) {
    setFormation(f);
    setLineup(Array(11).fill(null));
  }

  function fillBestXI() {
    const { lineup: auto } = pickXI(players, formation);
    setLineup(auto.map((p) => p.id));
  }

  function assignPlayer(slotIdx: number, playerId: string) {
    const next = [...lineup];
    const existing = next.indexOf(playerId);
    if (existing !== -1) next[existing] = null;
    next[slotIdx] = playerId;
    setLineup(next);
    setPickingSlot(null);
  }

  function clearSlot(slotIdx: number) {
    const next = [...lineup];
    next[slotIdx] = null;
    setLineup(next);
    setPickingSlot(null);
  }

  async function save() {
    const filled = lineup.filter(Boolean) as string[];
    if (filled.length < 11) return;
    setSaving(true);
    try {
      await onSave({ style, formation, lineup: filled });
    } finally {
      setSaving(false);
    }
  }

  const layout = FORMATION_LAYOUT[formation];
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const filledCount = lineup.filter(Boolean).length;
  const filledSet = new Set(lineup.filter(Boolean) as string[]);
  const bench = players.filter((p) => !filledSet.has(p.id)).sort((a, b) => b.overall - a.overall);

  return (
    <div className="space-y-6">
      {/* Formation selector */}
      <div>
        <span className="mb-2 block text-sm text-muted">Formation</span>
        <div className="flex flex-wrap gap-2">
          {FORMATIONS.map((f) => (
            <Button key={f} size="sm" variant={formation === f ? 'primary' : 'ghost'} onClick={() => changeFormation(f)}>
              {f}
            </Button>
          ))}
        </div>
      </div>

      {/* Pitch + controls row */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Pitch */}
        <div
          className="relative shrink-0"
          style={{ width: 280, height: 400, background: 'var(--pitch)', borderRadius: 8, border: '2px solid var(--pitch-line)' }}
        >
          {/* Midfield line */}
          <div style={{ position: 'absolute', top: '50%', left: '8%', right: '8%', height: 1, background: 'var(--pitch-line)', opacity: 0.5 }} />
          {/* Centre circle */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 60, height: 60, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '1px solid var(--pitch-line)', opacity: 0.5 }} />
          {/* Top penalty box */}
          <div style={{ position: 'absolute', top: '4%', left: '25%', right: '25%', height: '14%', border: '1px solid var(--pitch-line)', opacity: 0.4 }} />
          {/* Bottom penalty box */}
          <div style={{ position: 'absolute', bottom: '4%', left: '25%', right: '25%', height: '14%', border: '1px solid var(--pitch-line)', opacity: 0.4 }} />

          {layout.map((slot, i) => {
            const playerId = lineup[i];
            const player = playerId ? playerMap.get(playerId) : null;
            const filled = !!player;
            return (
              <button
                key={i}
                onClick={() => setPickingSlot(i)}
                style={{ position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)', zIndex: 1 }}
                className="flex flex-col items-center gap-0.5 group"
                title={filled ? `${player.firstName} ${player.lastName}` : slot.pos}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-all ${filled ? 'border-white bg-white/20 text-white shadow-md' : 'border-white/40 bg-black/20 text-white/60 group-hover:border-white group-hover:bg-black/40'}`}>
                  {filled ? `${player.firstName[0]}${player.lastName[0]}` : '+'}
                </div>
                <span className="max-w-[56px] truncate rounded bg-black/40 px-0.5 text-center text-[9px] leading-tight text-white/90">
                  {filled ? player.lastName : slot.pos}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right panel */}
        <div className="flex flex-1 flex-col gap-5">
          <Button variant="ghost" size="sm" onClick={fillBestXI} className="self-start">
            ⚡ Meilleure XI
          </Button>

          <div>
            <span className="mb-2 block text-sm text-muted">Style de jeu</span>
            <div className="flex flex-wrap gap-2">
              {TACTIC_STYLES.map((s) => (
                <Button key={s} size="sm" variant={style === s ? 'primary' : 'ghost'} onClick={() => setStyle(s)}>
                  {TACTIC_STYLE_LABEL[s]}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {style === 'possession' && 'Milieu renforcé (+12%), fréquence de tirs réduite.'}
              {style === 'contre-attaque' && 'Attaque boostée (+10%), moins de possession.'}
              {style === 'direct' && 'Fréquence de tirs maximale (+18%).'}
              {style === 'pressing' && 'Pressing intense — milieu (+15%), fautes adverses.'}
            </p>
          </div>

          <Button onClick={save} disabled={saving || filledCount < 11}>
            {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {filledCount < 11 ? `Sauvegarder (${filledCount}/11)` : 'Sauvegarder la tactique'}
          </Button>
        </div>
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm text-muted">Banc des remplaçants ({bench.length})</span>
          <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-border">
            {bench.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-border/40 transition-colors">
                <span>{p.firstName} {p.lastName}</span>
                <span className="text-xs text-muted">{p.position} · {p.overall}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player picker modal */}
      {pickingSlot !== null && (
        <PlayerPicker
          slotDef={layout[pickingSlot]}
          players={players}
          currentId={lineup[pickingSlot]}
          takenIds={lineup.filter(Boolean) as string[]}
          onPick={(id) => assignPlayer(pickingSlot, id)}
          onClear={() => clearSlot(pickingSlot)}
          onClose={() => setPickingSlot(null)}
        />
      )}
    </div>
  );
}

type PickerProps = {
  slotDef: SlotDef;
  players: Player[];
  currentId: string | null;
  takenIds: string[];
  onPick: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
};

function posMatchScore(player: Player, slotPos: string): number {
  if (player.position === slotPos) return 3;
  if (player.altPositions.includes(slotPos as Player['position'])) return 2;
  return 0;
}

function PlayerPicker({ slotDef, players, currentId, takenIds, onPick, onClear, onClose }: PickerProps) {
  const [search, setSearch] = useState('');

  const sorted = [...players]
    .sort((a, b) => {
      const diff = posMatchScore(b, slotDef.pos) - posMatchScore(a, slotDef.pos);
      return diff !== 0 ? diff : b.overall - a.overall;
    })
    .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Poste : {slotDef.pos}</span>
          <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">✕</button>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          autoFocus
        />
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {sorted.map((p) => {
            const isCurrent = p.id === currentId;
            const isTaken = takenIds.includes(p.id) && !isCurrent;
            const matchScore = posMatchScore(p, slotDef.pos);
            return (
              <button
                key={p.id}
                onClick={() => !isTaken && onPick(p.id)}
                disabled={isTaken}
                className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${isCurrent ? 'bg-accent/20 text-accent' : isTaken ? 'cursor-not-allowed opacity-35' : 'hover:bg-border'}`}
              >
                <span className="flex items-center gap-2">
                  {matchScore === 3 && <span className="text-accent text-xs">●</span>}
                  {matchScore === 2 && <span className="text-warning text-xs">◐</span>}
                  {matchScore === 0 && <span className="text-xs opacity-0">●</span>}
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-xs text-muted">{p.position} · {p.overall}</span>
              </button>
            );
          })}
        </div>
        {currentId && (
          <Button variant="ghost" size="sm" onClick={onClear} className="w-full">
            Retirer du poste
          </Button>
        )}
      </div>
    </div>
  );
}
