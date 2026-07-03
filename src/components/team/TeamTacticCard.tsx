import { useEffect, useState } from 'react';
import { POSITION_LABEL, TACTIC_STYLE_LABEL } from '@/lib/types';
import type { Formation, Player, SavedTactic, Team } from '@/lib/types';
import { pickXI } from '@/lib/sim/lineup';
import { loadTeam } from '@/lib/github/store';

// ── Pitch layout (same coords as TacticsPanel) ────────────────────────────────

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
  '4-5-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'LM', x: 8, y: 48 }, { pos: 'CM', x: 28, y: 46 }, { pos: 'DM', x: 50, y: 50 }, { pos: 'CM', x: 72, y: 46 }, { pos: 'RM', x: 92, y: 48 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '4-4-1-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'LM', x: 8, y: 51 }, { pos: 'CM', x: 34, y: 50 }, { pos: 'CM', x: 66, y: 50 }, { pos: 'RM', x: 92, y: 51 },
    { pos: 'AM', x: 50, y: 30 },
    { pos: 'ST', x: 50, y: 16 },
  ],
  '3-4-1-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 8, y: 52 }, { pos: 'CM', x: 34, y: 50 }, { pos: 'CM', x: 66, y: 50 }, { pos: 'RM', x: 92, y: 52 },
    { pos: 'AM', x: 50, y: 34 },
    { pos: 'ST', x: 34, y: 18 }, { pos: 'ST', x: 66, y: 18 },
  ],
  '5-4-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 6, y: 70 }, { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 }, { pos: 'RB', x: 94, y: 70 },
    { pos: 'LM', x: 8, y: 48 }, { pos: 'CM', x: 34, y: 46 }, { pos: 'CM', x: 66, y: 46 }, { pos: 'RM', x: 92, y: 48 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '3-6-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 6, y: 50 }, { pos: 'DM', x: 24, y: 52 }, { pos: 'CM', x: 38, y: 47 }, { pos: 'CM', x: 62, y: 47 }, { pos: 'DM', x: 76, y: 52 }, { pos: 'RM', x: 94, y: 50 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '4-1-2-1-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 50, y: 60 },
    { pos: 'CM', x: 28, y: 47 }, { pos: 'CM', x: 72, y: 47 },
    { pos: 'AM', x: 50, y: 33 },
    { pos: 'ST', x: 34, y: 18 }, { pos: 'ST', x: 66, y: 18 },
  ],
  '3-4-2-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 8, y: 52 }, { pos: 'CM', x: 34, y: 54 }, { pos: 'CM', x: 66, y: 54 }, { pos: 'RM', x: 92, y: 52 },
    { pos: 'AM', x: 34, y: 32 }, { pos: 'AM', x: 66, y: 32 },
    { pos: 'ST', x: 50, y: 16 },
  ],
  '4-2-2-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 34, y: 58 }, { pos: 'DM', x: 66, y: 58 },
    { pos: 'AM', x: 28, y: 36 }, { pos: 'AM', x: 72, y: 36 },
    { pos: 'ST', x: 34, y: 18 }, { pos: 'ST', x: 66, y: 18 },
  ],
  '4-2-4': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'CM', x: 34, y: 50 }, { pos: 'CM', x: 66, y: 50 },
    { pos: 'LW', x: 10, y: 22 }, { pos: 'ST', x: 36, y: 16 }, { pos: 'ST', x: 64, y: 16 }, { pos: 'RW', x: 90, y: 22 },
  ],
};

// ── Pitch visual ──────────────────────────────────────────────────────────────

export function TacticPitch({ formation, lineup, players, tokenPositions }: { formation: Formation; lineup: string[]; players: Player[]; tokenPositions?: Record<string, { x: number; y: number }> }) {
  const layout = FORMATION_LAYOUT[formation] ?? FORMATION_LAYOUT['4-3-3'];
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Build slots: use tokenPositions when available, fall back to layout
  const slots: { x: number; y: number; pos: string; playerId: string | undefined }[] = lineup.map((id, i) => {
    const tok = tokenPositions?.[id];
    const fallback = layout[i] ?? layout[0];
    return { x: tok ? tok.x : fallback.x, y: tok ? tok.y : fallback.y, pos: fallback.pos, playerId: id };
  });
  // If lineup shorter than layout (shouldn't happen), pad with layout slots
  if (slots.length === 0) {
    layout.forEach((s) => slots.push({ ...s, playerId: undefined }));
  }

  return (
    <div
      className="relative select-none mx-auto"
      style={{ width: '100%', maxWidth: 280, aspectRatio: '7/10', background: 'var(--pitch)', borderRadius: 8, border: '2px solid var(--pitch-line)' }}
    >
      <div style={{ position: 'absolute', top: '50%', left: '8%', right: '8%', height: 1, background: 'var(--pitch-line)', opacity: 0.4 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', width: 56, height: 56, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '1px solid var(--pitch-line)', opacity: 0.4 }} />
      <div style={{ position: 'absolute', top: '4%', left: '25%', right: '25%', height: '14%', border: '1px solid var(--pitch-line)', opacity: 0.35 }} />
      <div style={{ position: 'absolute', bottom: '4%', left: '25%', right: '25%', height: '14%', border: '1px solid var(--pitch-line)', opacity: 0.35 }} />

      {slots.map((slot, i) => {
        const player = slot.playerId ? playerMap.get(slot.playerId) : null;
        return (
          <div
            key={i}
            style={{ position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)', zIndex: 1 }}
            className="flex flex-col items-center gap-0.5"
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-[9px] font-bold ${player ? 'border-white bg-white/20 text-white shadow-md' : 'border-white/30 bg-black/20 text-white/40'}`}>
              {POSITION_LABEL[slot.pos as keyof typeof POSITION_LABEL] ?? slot.pos}
            </div>
            <span className="max-w-[52px] truncate rounded bg-black/50 px-0.5 text-center text-[8px] leading-tight text-white/90">
              {player ? player.lastName : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = {
  team: Team;
  token: string | null;
  onClose: () => void;
};

export function TeamTacticCard({ team, token, onClose }: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeam(team.slug, token)
      .then((d) => { if (d) setPlayers(d.players); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [team.slug, token]);

  // Resolve active tactic
  const activeTactic: SavedTactic | undefined =
    team.savedTactics?.find((t) => t.id === team.activeTacticId) ??
    team.savedTactics?.[0];

  const tactics = activeTactic ?? team.tactics;
  const formation: Formation = (tactics?.formation ?? team.formation) as Formation;
  const formationLabel = tactics?.formationLabel ?? formation;
  const style = tactics?.style ?? 'possession';

  // Resolve lineup
  const lineup: string[] = (() => {
    if (tactics?.lineup?.length === 11 && players.length > 0) {
      const byId = new Map(players.map((p) => [p.id, p]));
      const resolved = tactics.lineup.filter((id) => byId.has(id));
      if (resolved.length === 11) return resolved;
    }
    if (players.length > 0) {
      return pickXI(players, formation).lineup.map((p) => p.id);
    }
    return [];
  })();

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const starters = lineup.map((id) => playerMap.get(id)).filter(Boolean) as Player[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-bg">
          {team.flag && <img src={team.flag} alt="" className="h-10 w-10 rounded-sm object-cover shrink-0" />}
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl truncate">{team.name}</h2>
            <div className="text-xs text-muted mt-0.5">
              Force {team.globalStrength} · {formationLabel} · {TACTIC_STYLE_LABEL[style] ?? style}
              {activeTactic && <span className="ml-2 text-accent">"{activeTactic.name}"</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none shrink-0">✕</button>
        </div>

        {/* Body */}
        <div className="flex gap-4 p-4 flex-col sm:flex-row">
          {/* Pitch */}
          <div className="shrink-0 w-full sm:w-[220px]">
            {loading ? (
              <div className="flex items-center justify-center" style={{ aspectRatio: '7/10', maxWidth: 220, background: 'var(--pitch)', borderRadius: 8 }}>
                <span className="text-white/50 text-xs">Chargement…</span>
              </div>
            ) : (
              <TacticPitch formation={formation} lineup={lineup} players={players} tokenPositions={tactics?.tokenPositions} />
            )}
          </div>

          {/* XI list */}
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted mb-2">XI titulaires</div>
            {loading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 11 }).map((_, i) => (
                  <div key={i} className="h-6 rounded bg-border/30 animate-pulse" />
                ))}
              </div>
            ) : starters.length === 0 ? (
              <p className="text-xs text-muted py-4">Aucun XI défini.</p>
            ) : (
              <div className="space-y-1">
                {starters.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-center text-muted tabular-nums">{i + 1}</span>
                    <span className="rounded bg-border/40 px-1.5 py-0.5 font-mono text-[10px] shrink-0">
                      {POSITION_LABEL[p.position]}
                    </span>
                    <span className="flex-1 truncate font-medium">{p.firstName} {p.lastName}</span>
                    <span className="tabular-nums text-accent font-bold">{p.overall}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trigger button / link ─────────────────────────────────────────────────────

type TriggerProps = {
  team: Team;
  token: string | null;
  children: React.ReactNode;
  className?: string;
};

export function TeamTacticLink({ team, token, children, className }: TriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={className ?? 'hover:text-accent hover:underline transition-colors cursor-pointer'}
      >
        {children}
      </button>
      {open && <TeamTacticCard team={team} token={token} onClose={() => setOpen(false)} />}
    </>
  );
}
