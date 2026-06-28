import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { MatchState } from '@/lib/sim/types';
import type { Player } from '@/lib/types';
import { POSITION_LABEL } from '@/lib/types';

type Props = {
  state: MatchState;
  homePlayers: Player[];
  awayPlayers: Player[];
  onSub: (side: 'home' | 'away', outId: string, inId: string) => void;
  onClose: () => void;
  allowedSides?: ('home' | 'away')[];
};

function posFamily(pos: string): string[] {
  if (['CB', 'LB', 'RB'].includes(pos)) return ['CB', 'LB', 'RB'];
  if (['DM', 'CM', 'AM', 'LM', 'RM'].includes(pos)) return ['DM', 'CM', 'AM', 'LM', 'RM'];
  if (['LW', 'RW', 'ST'].includes(pos)) return ['LW', 'RW', 'ST'];
  return [pos];
}

function SideSubs({
  side,
  label,
  onPitch,
  bench,
  players,
  subsUsed,
  maxSubs,
  onSub,
}: {
  side: 'home' | 'away';
  label: string;
  onPitch: string[];
  bench: string[];
  players: Player[];
  subsUsed: number;
  maxSubs: number;
  onSub: (side: 'home' | 'away', outId: string, inId: string) => void;
}) {
  const [outId, setOutId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const pitchPlayers = onPitch.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
  const benchPlayers = bench.map((id) => playerMap.get(id)).filter(Boolean) as Player[];

  const subsLeft = maxSubs - subsUsed;
  const outPlayer = outId ? playerMap.get(outId) : null;

  const compatibleBench = outPlayer
    ? benchPlayers.filter((p) => showAll || posFamily(outPlayer.position).includes(p.position))
    : [];

  const posFamilyBench = outPlayer
    ? benchPlayers.filter((p) => posFamily(outPlayer.position).includes(p.position))
    : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-xs ${subsLeft === 0 ? 'text-danger' : 'text-muted'}`}>
          {subsLeft === 0 ? 'Plus de remplacements' : `${subsLeft} remplacement${subsLeft > 1 ? 's' : ''} restant${subsLeft > 1 ? 's' : ''}`}
        </span>
      </div>

      {subsLeft === 0 ? null : (
        <>
          {/* Step 1: pick player to remove */}
          <div>
            <p className="text-xs text-muted mb-1.5">Sortant</p>
            <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
              {pitchPlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setOutId(p.id === outId ? null : p.id); setShowAll(false); }}
                  className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition-colors ${
                    p.id === outId
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border hover:border-accent/50 hover:bg-border/20'
                  }`}
                >
                  <span className="shrink-0 rounded bg-border/60 px-1 font-mono text-[10px]">
                    {POSITION_LABEL[p.position as keyof typeof POSITION_LABEL] ?? p.position}
                  </span>
                  <span className="truncate">{p.lastName}</span>
                  <span className="ml-auto shrink-0 text-muted">{p.overall}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: pick replacement */}
          {outId && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted">Entrant</p>
                {posFamilyBench.length !== benchPlayers.length && (
                  <button
                    onClick={() => setShowAll((v) => !v)}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {showAll ? 'Poste compatible uniquement' : 'Voir tous les remplaçants'}
                  </button>
                )}
              </div>
              {compatibleBench.length === 0 ? (
                <p className="text-xs text-muted italic">
                  {showAll || posFamilyBench.length === 0
                    ? 'Aucun remplaçant disponible.'
                    : 'Aucun remplaçant compatible — '}
                  {!showAll && posFamilyBench.length === 0 && benchPlayers.length > 0 && (
                    <button onClick={() => setShowAll(true)} className="text-accent hover:underline">voir tous</button>
                  )}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
                  {compatibleBench.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onSub(side, outId, p.id)}
                      className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-left text-xs transition-colors hover:border-accent hover:bg-accent/10"
                    >
                      <span className="shrink-0 rounded bg-border/60 px-1 font-mono text-[10px]">
                        {POSITION_LABEL[p.position as keyof typeof POSITION_LABEL] ?? p.position}
                      </span>
                      <span className="truncate">{p.lastName}</span>
                      <span className="ml-auto shrink-0 text-muted">{p.overall}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SubstitutionPanel({ state, homePlayers, awayPlayers, onSub, onClose, allowedSides }: Props) {
  const sides: ('home' | 'away')[] = allowedSides ?? ['home', 'away'];
  const [activeSide, setActiveSide] = useState<'home' | 'away'>(sides[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">Remplacements</h2>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none">✕</button>
        </div>

        {/* Side tabs — only show if multiple sides allowed */}
        {sides.length > 1 && (
          <div className="flex gap-1 border-b border-border">
            {sides.map((s) => {
              const subsUsed = s === 'home' ? state.homeSubs : state.awaySubs;
              const subsLeft = state.rules.maxSubs - subsUsed;
              return (
                <button
                  key={s}
                  onClick={() => setActiveSide(s)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeSide === s ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
                >
                  {s === 'home' ? 'Domicile' : 'Extérieur'}
                  <span className={`ml-1.5 text-xs ${subsLeft === 0 ? 'text-danger' : 'text-muted'}`}>
                    ({subsLeft}/{state.rules.maxSubs})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activeSide === 'home' ? (
          <SideSubs
            side="home"
            label="Domicile"
            onPitch={state.homeOnPitch}
            bench={state.homeAvailableBench}
            players={homePlayers}
            subsUsed={state.homeSubs}
            maxSubs={state.rules.maxSubs}
            onSub={onSub}
          />
        ) : (
          <SideSubs
            side="away"
            label="Extérieur"
            onPitch={state.awayOnPitch}
            bench={state.awayAvailableBench}
            players={awayPlayers}
            subsUsed={state.awaySubs}
            maxSubs={state.rules.maxSubs}
            onSub={onSub}
          />
        )}

        <Button variant="ghost" size="sm" onClick={onClose} className="w-full">
          Fermer
        </Button>
      </div>
    </div>
  );
}
