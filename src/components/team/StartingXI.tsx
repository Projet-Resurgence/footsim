import { useMemo, useState } from 'react';
import { pickXI } from '@/lib/sim/lineup';
import { POSITION_LABEL } from '@/lib/types';
import type { Formation, Player } from '@/lib/types';

const FOOT: Record<string, string> = { right: 'D', left: 'G', both: 'D/G' };

type Props = {
  players: Player[];
  formation: Formation;
  /** IDs du lineup custom (tactics.lineup) — si absent ou invalide → meilleur XI auto */
  lineup?: string[];
  /** Position overrides from free editor: playerId → assigned Position */
  positionMap?: Record<string, import('@/lib/types').Position>;
  /** If provided, shows a button to save the current auto XI as the active tactic */
  onSaveAutoXI?: (lineupIds: string[]) => Promise<void>;
  /** Click on a player row to view their stats */
  onPlayerClick?: (player: Player) => void;
  /** Affiche un ✏️ à côté de chaque nom pour renommer le joueur */
  onRenamePlayer?: (player: Player) => void;
};

const PAGE_SIZE = 50;

export function StartingXI({ players, formation, lineup, positionMap, onSaveAutoXI, onPlayerClick, onRenamePlayer }: Props) {
  const [saving, setSaving] = useState(false);
  const [restPage, setRestPage] = useState(1);
  const hasCustom = !!(lineup && lineup.length === 11);

  const { starters, bench, rest, isAuto } = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p]));
    let starters: Player[];
    let isAuto = false;

    if (lineup && lineup.length === 11) {
      const resolved = lineup.map((id) => byId.get(id)).filter(Boolean) as Player[];
      if (resolved.length === 11) {
        starters = resolved;
      } else {
        ({ lineup: starters } = pickXI(players, formation));
        isAuto = true;
      }
    } else {
      ({ lineup: starters } = pickXI(players, formation));
      isAuto = true;
    }

    // Build smart bench: 1 GK max, then fill by position family gaps in starter lineup
    const starterIds = new Set(starters.map((p) => p.id));
    const nonStarters = players.filter((p) => !starterIds.has(p.id));

    // Count position families in starters (excl GK)
    const starterDef = starters.filter((p) => ['CB', 'LB', 'RB'].includes(p.position)).length;
    const starterMid = starters.filter((p) => ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.position)).length;
    const starterAtt = starters.filter((p) => ['LW', 'RW', 'ST'].includes(p.position)).length;

    // Bench: max 12 slots
    const total = Math.min(12, nonStarters.length);
    const gkSlots = 1;
    const outfieldSlots = total - gkSlots;
    const familyTotal = starterDef + starterMid + starterAtt || 10;
    const defSlots = Math.max(1, Math.round((starterDef / familyTotal) * outfieldSlots));
    const midSlots = Math.max(1, Math.round((starterMid / familyTotal) * outfieldSlots));
    const attSlots = Math.max(1, outfieldSlots - defSlots - midSlots);

    function bestN(pool: Player[], n: number) {
      return [...pool].sort((a, b) => b.overall - a.overall).slice(0, n);
    }

    const gkPool = nonStarters.filter((p) => p.position === 'GK');
    const defPool = nonStarters.filter((p) => ['CB', 'LB', 'RB'].includes(p.position));
    const midPool = nonStarters.filter((p) => ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.position));
    const attPool = nonStarters.filter((p) => ['LW', 'RW', 'ST'].includes(p.position));

    const benchGk = bestN(gkPool, gkSlots);
    const benchDef = bestN(defPool, defSlots);
    const benchMid = bestN(midPool, midSlots);
    const benchAtt = bestN(attPool, attSlots);

    const pickedIds = new Set([
      ...benchGk, ...benchDef, ...benchMid, ...benchAtt,
    ].map((p) => p.id));

    const remaining = nonStarters
      .filter((p) => !pickedIds.has(p.id))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, total - pickedIds.size);

    const bench = [...benchGk, ...benchDef, ...benchMid, ...benchAtt, ...remaining];

    const benchIds = new Set(bench.map((p) => p.id));
    const rest = nonStarters
      .filter((p) => !benchIds.has(p.id))
      .sort((a, b) => b.overall - a.overall);

    return { starters, bench, rest, isAuto };
  }, [players, formation, lineup]);

  const colHead = 'px-3 py-2 font-medium text-right';
  const colCell = 'px-3 py-2 text-right tabular-nums text-muted';

  return (
    <div className="space-y-4">
      {/* Source indicator + save button */}
      <div className="flex items-center gap-2">
        {(!hasCustom || isAuto) && (
          <span className="text-xs text-muted">⚡ Meilleur XI auto (par poste)</span>
        )}
        {isAuto && onSaveAutoXI && (
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try { await onSaveAutoXI(starters.map((p) => p.id)); }
              finally { setSaving(false); }
            }}
            className="px-2 py-0.5 rounded text-xs border border-border bg-surface hover:bg-border/40 transition-colors disabled:opacity-50"
          >
            {saving ? '…' : '↑ Figer & publier ce XI'}
          </button>
        )}
      </div>

      {/* XI titulaires */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div className="bg-bg px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted flex items-center justify-between">
          <span>XI titulaires · {formation}</span>
          <span className="text-accent font-mono">{starters.length}/11</span>
        </div>
        <table className="w-full min-w-[430px] text-sm">
          <thead className="bg-bg text-left text-muted text-xs border-t border-border">
            <tr>
              <th className="w-8 px-3 py-1.5"></th>
              <th className="px-3 py-1.5 font-medium">Poste</th>
              <th className="px-3 py-1.5 font-medium">Nom</th>
              <th className={colHead}>Âge</th>
              <th className={colHead}>Pied</th>
              <th className={colHead}>Ovr</th>
            </tr>
          </thead>
          <tbody>
            {starters.map((p, i) => (
              <tr key={p.id} className="border-t border-border hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer" onClick={() => onPlayerClick?.(p)}>
                <td className="w-8 px-3 py-2 text-center text-xs text-muted tabular-nums">{i + 1}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-border/40 px-1.5 py-0.5 font-mono text-xs">
                    {POSITION_LABEL[positionMap?.[p.id] ?? p.position]}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium">{p.firstName} {p.lastName}{onRenamePlayer && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRenamePlayer(p); }}
                        className="ml-1.5 text-muted/50 hover:text-accent transition-colors"
                        title="Renommer ce joueur"
                      >✏️</button>
                    )}</td>
                <td className={colCell}>{p.age}</td>
                <td className={colCell}>{FOOT[p.preferredFoot] ?? 'D'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-accent">{p.overall}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Banc */}
      {bench.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <div className="bg-bg px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            Banc ({bench.length})
          </div>
          <table className="w-full min-w-[430px] text-sm">
            <thead className="bg-bg text-left text-muted text-xs border-t border-border">
              <tr>
                <th className="px-3 py-1.5 font-medium">Poste</th>
                <th className="px-3 py-1.5 font-medium">Nom</th>
                <th className={colHead}>Âge</th>
                <th className={colHead}>Pied</th>
                <th className={colHead}>Ovr</th>
              </tr>
            </thead>
            <tbody>
              {bench.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer" onClick={() => onPlayerClick?.(p)}>
                  <td className="px-3 py-2">
                    <span className="rounded bg-border/40 px-1.5 py-0.5 font-mono text-xs">
                      {POSITION_LABEL[p.position]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text/80">{p.firstName} {p.lastName}{onRenamePlayer && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRenamePlayer(p); }}
                        className="ml-1.5 text-muted/50 hover:text-accent transition-colors"
                        title="Renommer ce joueur"
                      >✏️</button>
                    )}</td>
                  <td className={colCell}>{p.age}</td>
                  <td className={colCell}>{FOOT[p.preferredFoot] ?? 'D'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{p.overall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reste de l'effectif */}
      {rest.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <div className="bg-bg px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted flex items-center justify-between">
            <span>Reste de l'effectif ({rest.length})</span>
            <span className="text-muted/60">{Math.min(restPage * PAGE_SIZE, rest.length)}/{rest.length}</span>
          </div>
          <table className="w-full min-w-[430px] text-sm">
            <thead className="bg-bg text-left text-muted text-xs border-t border-border">
              <tr>
                <th className="px-3 py-1.5 font-medium">Poste</th>
                <th className="px-3 py-1.5 font-medium">Nom</th>
                <th className={colHead}>Âge</th>
                <th className={colHead}>Pied</th>
                <th className={colHead}>Ovr</th>
              </tr>
            </thead>
            <tbody>
              {rest.slice(0, restPage * PAGE_SIZE).map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer" onClick={() => onPlayerClick?.(p)}>
                  <td className="px-3 py-2">
                    <span className="rounded bg-border/40 px-1.5 py-0.5 font-mono text-xs">
                      {POSITION_LABEL[p.position]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text/80">{p.firstName} {p.lastName}{onRenamePlayer && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRenamePlayer(p); }}
                        className="ml-1.5 text-muted/50 hover:text-accent transition-colors"
                        title="Renommer ce joueur"
                      >✏️</button>
                    )}</td>
                  <td className={colCell}>{p.age}</td>
                  <td className={colCell}>{FOOT[p.preferredFoot] ?? 'D'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{p.overall}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {restPage * PAGE_SIZE < rest.length && (
            <div className="border-t border-border px-4 py-2 text-center">
              <button
                onClick={() => setRestPage((p) => p + 1)}
                className="text-xs text-muted hover:text-text transition-colors"
              >
                Afficher 50 de plus ({rest.length - restPage * PAGE_SIZE} restants)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
