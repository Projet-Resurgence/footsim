import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import type { MatchState } from '@/lib/sim/types';
import type { Team } from '@/lib/types';

type Props = { state: MatchState; home: Team; away: Team; onResume: () => void };

export function HalftimeOverlay({ state, home, away, onResume }: Props) {
  const isET = state.status === 'extraTimeHalfTime';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-[min(92vw,520px)] space-y-6 rounded-lg border border-border bg-surface p-8 shadow-subtle-md"
      >
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-muted">
            {isET ? 'Prolongations · Mi-temps' : 'Mi-temps'}
          </div>
          <div className="mt-2 font-display text-5xl">
            {state.score.home} – {state.score.away}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Possession" h={`${state.possession.home}%`} a={`${state.possession.away}%`} />
          <Stat label="Tirs" h={state.shots.home} a={state.shots.away} />
          <Stat label="Cadrés" h={state.shotsOnTarget.home} a={state.shotsOnTarget.away} />
          <Stat label="Fautes" h={state.fouls.home} a={state.fouls.away} />
          <Stat label="Jaunes" h={state.cards.home.yellow.length} a={state.cards.away.yellow.length} />
          <Stat label="Rouges" h={state.cards.home.red.length} a={state.cards.away.red.length} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted">
          <span>{home.name}</span>
          <span>{away.name}</span>
        </div>

        <Button onClick={onResume} size="lg" className="w-full">
          {isET ? 'Reprendre la 2ᵉ prolongation' : 'Reprendre la 2ᵉ mi-temps'}
        </Button>
      </motion.div>
    </motion.div>
  );
}

function Stat({ label, h, a }: { label: string; h: number | string; a: number | string }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <div className="text-xs uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 font-medium tabular-nums">{h} · {a}</div>
    </div>
  );
}
