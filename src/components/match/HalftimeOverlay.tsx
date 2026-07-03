import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import type { MatchState } from '@/lib/sim/types';
import type { SavedTactic, Team } from '@/lib/types';
import { TacticalReportModal } from '@/components/match/TacticalReportModal';
import type { ReportSide } from '@/lib/report/tacticalReport';

type Props = {
  state: MatchState;
  home: Team;
  away: Team;
  homeSavedTactics?: SavedTactic[];
  awaySavedTactics?: SavedTactic[];
  onTacticChange?: (side: 'home' | 'away', tactic: SavedTactic) => void;
  onResume: () => void;
  homeReportSide?: ReportSide;
  awayReportSide?: ReportSide;
};

export function HalftimeOverlay({ state, home, away, homeSavedTactics = [], awaySavedTactics = [], onTacticChange, onResume, homeReportSide, awayReportSide }: Props) {
  const isET = state.status === 'extraTimeHalfTime';
  const [homeTacticId, setHomeTacticId] = useState<string>('');
  const [awayTacticId, setAwayTacticId] = useState<string>('');
  const [showReport, setShowReport] = useState(false);
  const canShowReport = Boolean(homeReportSide && awayReportSide);

  function handleTacticChange(side: 'home' | 'away', id: string) {
    const tactics = side === 'home' ? homeSavedTactics : awaySavedTactics;
    const tactic = tactics.find((t) => t.id === id);
    if (!tactic) return;
    if (side === 'home') setHomeTacticId(id);
    else setAwayTacticId(id);
    onTacticChange?.(side, tactic);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-[min(92vw,560px)] space-y-6 rounded-lg border border-border bg-surface p-8 shadow-subtle-md"
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
          <Stat label="xG" h={state.xg.home.toFixed(2)} a={state.xg.away.toFixed(2)} />
          <Stat label="Fautes" h={state.fouls.home} a={state.fouls.away} />
          <Stat label="Jaunes" h={state.cards.home.yellow.length} a={state.cards.away.yellow.length} />
          <Stat label="Rouges" h={state.cards.home.red.length} a={state.cards.away.red.length} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted">
          <span>{home.name}</span>
          <span>{away.name}</span>
        </div>

        {/* Tactic selectors */}
        {(homeSavedTactics.length > 0 || awaySavedTactics.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {homeSavedTactics.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-muted">{home.name} — Tactique</div>
                <select
                  className="h-9 w-full rounded-md border border-border bg-bg px-2 text-xs"
                  value={homeTacticId}
                  onChange={(e) => handleTacticChange('home', e.target.value)}
                >
                  <option value="">— Inchangée —</option>
                  {homeSavedTactics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} · {t.formationLabel ?? t.formation}</option>
                  ))}
                </select>
              </div>
            )}
            {awaySavedTactics.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-muted">{away.name} — Tactique</div>
                <select
                  className="h-9 w-full rounded-md border border-border bg-bg px-2 text-xs"
                  value={awayTacticId}
                  onChange={(e) => handleTacticChange('away', e.target.value)}
                >
                  <option value="">— Inchangée —</option>
                  {awaySavedTactics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} · {t.formationLabel ?? t.formation}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {canShowReport && (
          <Button variant="ghost" onClick={() => setShowReport(true)} size="lg" className="w-full">
            Compte-rendu tactique
          </Button>
        )}

        <Button onClick={onResume} size="lg" className="w-full">
          {isET ? 'Reprendre la 2ᵉ prolongation' : 'Reprendre la 2ᵉ mi-temps'}
        </Button>
      </motion.div>

      {showReport && homeReportSide && awayReportSide && (
        <TacticalReportModal
          state={state}
          home={homeReportSide}
          away={awayReportSide}
          onClose={() => setShowReport(false)}
        />
      )}
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
