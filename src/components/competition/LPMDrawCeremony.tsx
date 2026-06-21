import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import type { Team } from '@/lib/types';

export type LPMPair = { home: string; away: string };

type Props = {
  pairs: LPMPair[];
  teams: Team[];
  title: string;
  subtitle?: string;
  pairLabels?: (i: number) => string; // e.g. "Match A", "Journée 1 · Match 1"
  onConfirm: () => void;
};

export function LPMDrawCeremony({ pairs, teams, title, subtitle, pairLabels, onConfirm }: Props) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const total = pairs.length;

  // Each pair is revealed in 2 steps: home first, then away
  // revealedCount = how many teams have been revealed (0..total*2)
  const [revealedCount, setRevealedCount] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const homeRevealed = (i: number) => revealedCount > i * 2;
  const awayRevealed = (i: number) => revealedCount > i * 2 + 1;
  const currentPairIdx = Math.floor(revealedCount / 2);
  const currentIsAway = revealedCount % 2 === 1;

  function stepReveal(count: number, delay: number, onDone?: () => void) {
    if (count >= total * 2) {
      setDone(true);
      setCurrentId(null);
      onDone?.();
      return;
    }
    const pairIdx = Math.floor(count / 2);
    const isAway = count % 2 === 1;
    const id = isAway ? pairs[pairIdx].away : pairs[pairIdx].home;
    setCurrentId(id);
    timerRef.current = setTimeout(() => {
      setRevealedCount(count + 1);
      setCurrentId(null);
      timerRef.current = setTimeout(() => stepReveal(count + 1, delay, onDone), delay * 0.3);
    }, delay);
  }

  function revealNext() {
    if (done || currentId) return;
    stepReveal(revealedCount, 2000);
  }

  function revealAll() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrentId(null);
    let count = revealedCount;
    function step() {
      if (count >= total * 2) {
        setRevealedCount(total * 2);
        setDone(true);
        setCurrentId(null);
        return;
      }
      const pairIdx = Math.floor(count / 2);
      const isAway = count % 2 === 1;
      const id = isAway ? pairs[pairIdx].away : pairs[pairIdx].home;
      count++;
      setRevealedCount(count);
      setCurrentId(id);
      timerRef.current = setTimeout(() => {
        setCurrentId(null);
        timerRef.current = setTimeout(step, 120);
      }, 600);
    }
    step();
  }

  function skipAll() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRevealedCount(total * 2);
    setCurrentId(null);
    setDone(true);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const currentTeam = currentId ? teamMap.get(currentId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>

      {/* Spotlight : équipe en cours de tirage */}
      <div className="min-h-[80px]">
        <AnimatePresence mode="wait">
          {currentId && currentTeam && (
            <motion.div
              key={currentId}
              initial={{ scale: 0.5, opacity: 0, y: -16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="flex items-center gap-4 rounded-xl border border-accent/40 bg-accent/5 p-4 shadow-lg"
            >
              {currentTeam.flag && (
                <img src={currentTeam.flag} alt="" className="h-14 w-14 rounded object-cover shrink-0" />
              )}
              <div>
                <div className="font-display text-2xl">{currentTeam.name}</div>
                <div className="text-sm text-muted mt-0.5">
                  Force {currentTeam.globalStrength} ·{' '}
                  {!currentIsAway ? (
                    <span className="text-accent">Domicile</span>
                  ) : (
                    <span className="text-warning">Extérieur</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
          {!currentId && !done && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-[80px] items-center justify-center rounded-xl border border-dashed border-border text-muted text-sm"
            >
              {revealedCount === 0 ? 'Appuie sur "Tirer" pour commencer' : 'Prêt pour le prochain tirage…'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Grille des paires */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
        {pairs.map((pair, i) => {
          const home = teamMap.get(pair.home);
          const away = teamMap.get(pair.away);
          const pairDone = awayRevealed(i);
          const pairActive = currentPairIdx === i && !done;
          return (
            <motion.div
              key={i}
              layout
              className={`rounded-lg border p-3 transition-colors ${
                pairActive ? 'border-accent/50 bg-accent/5' : pairDone ? 'border-border bg-surface' : 'border-border/40 bg-surface/50'
              }`}
            >
              <div className="text-[10px] uppercase tracking-widest text-muted mb-2">
                {pairLabels ? pairLabels(i) : `Duel ${i + 1}`}
              </div>
              <div className="flex items-center gap-2">
                {/* Home */}
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  {homeRevealed(i) && home?.flag ? (
                    <img src={home.flag} alt="" className="h-6 w-6 rounded-sm object-cover shrink-0" />
                  ) : (
                    <div className="h-6 w-6 rounded-sm bg-border/40 shrink-0" />
                  )}
                  <span className={`text-sm truncate ${homeRevealed(i) ? '' : 'text-muted italic'}`}>
                    {homeRevealed(i) ? (home?.name ?? pair.home) : '—'}
                  </span>
                </div>
                <span className="text-xs text-muted shrink-0 px-1">vs</span>
                {/* Away */}
                <div className="flex flex-1 items-center gap-2 min-w-0 flex-row-reverse text-right">
                  {awayRevealed(i) && away?.flag ? (
                    <img src={away.flag} alt="" className="h-6 w-6 rounded-sm object-cover shrink-0" />
                  ) : (
                    <div className="h-6 w-6 rounded-sm bg-border/40 shrink-0" />
                  )}
                  <span className={`text-sm truncate ${awayRevealed(i) ? '' : 'text-muted italic'}`}>
                    {awayRevealed(i) ? (away?.name ?? pair.away) : '—'}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        {!done && (
          <>
            <Button onClick={revealNext} disabled={!!currentId} size="lg">
              {revealedCount === 0
                ? 'Commencer le tirage'
                : `Tirer (${Math.floor(revealedCount / 2)}/${total})`}
            </Button>
            <Button onClick={revealAll} variant="ghost" size="lg" disabled={!!currentId}>
              ⚡ Tirage automatique
            </Button>
            <Button onClick={skipAll} variant="ghost" size="lg">
              Passer
            </Button>
          </>
        )}
        {done && (
          <Button onClick={onConfirm} size="lg">
            Confirmer le tirage
          </Button>
        )}
      </div>
    </div>
  );
}
