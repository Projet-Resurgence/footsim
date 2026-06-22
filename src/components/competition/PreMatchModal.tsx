import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { CorruptionPanel } from '@/components/match/CorruptionPanel';
import type { CorruptionDeal } from '@/lib/sim/types';
import type { Team, TacticStyle } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';

type Props = {
  home: Team;
  away: Team;
  onConfirm: (corruption: CorruptionDeal | null, tactics?: { home?: TacticStyle; away?: TacticStyle }) => void;
  onCancel: () => void;
};

export function PreMatchModal({ home, away, onConfirm, onCancel }: Props) {
  const [corruption, setCorruption] = useState<CorruptionDeal | null>(null);
  const [homeStyle, setHomeStyle] = useState<TacticStyle | ''>('');
  const [awayStyle, setAwayStyle] = useState<TacticStyle | ''>('');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg rounded-xl border border-border bg-bg shadow-2xl p-6 space-y-5"
        >
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1">Pré-match</div>
            <h2 className="font-display text-2xl">{home.name} <span className="text-muted">vs</span> {away.name}</h2>
          </div>

          {/* Tactic style selectors */}
          <div className="grid grid-cols-2 gap-3">
            {([['home', home, homeStyle, setHomeStyle], ['away', away, awayStyle, setAwayStyle]] as const).map(
              ([side, team, style, setStyle]) => (
                <div key={side} className="space-y-1">
                  <div className="text-[10px] uppercase tracking-widest text-muted">{team.name}</div>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as TacticStyle | '')}
                    className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text"
                  >
                    <option value="">Style par défaut</option>
                    {(Object.keys(TACTIC_STYLE_LABEL) as TacticStyle[]).map((s) => (
                      <option key={s} value={s}>{TACTIC_STYLE_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              )
            )}
          </div>

          <CorruptionPanel
            homeTeamName={home.name}
            awayTeamName={away.name}
            deal={corruption}
            onDeal={setCorruption}
          />

          <div className="flex gap-3">
            <Button
              size="sm"
              onClick={() => onConfirm(corruption, {
                home: homeStyle || undefined,
                away: awayStyle || undefined,
              })}
            >
              Lancer le match
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
