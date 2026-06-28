import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MatchEvent, MatchState } from '@/lib/sim/types';
import type { Team } from '@/lib/types';

type Kick = {
  side: 'home' | 'away';
  scored: boolean;
  text: string;
  homeTotal: number;
  awayTotal: number;
};

type Props = {
  state: MatchState;
  home: Team;
  away: Team;
  onDone: () => void;
};

function parsePenaltyEvents(events: MatchEvent[]): Kick[] {
  const kicks: Kick[] = [];
  for (const ev of events) {
    if (ev.type !== 'penalty') continue;
    const scored = ev.text.includes('marque');
    const match = ev.text.match(/\((\d+)-(\d+)\)/);
    if (!match) continue;
    kicks.push({
      side: ev.side as 'home' | 'away',
      scored,
      text: ev.text,
      homeTotal: parseInt(match[1]),
      awayTotal: parseInt(match[2]),
    });
  }
  return kicks;
}

export function PenaltyShootout({ state, home, away, onDone }: Props) {
  const kicks = parsePenaltyEvents(state.events);
  const [revealed, setRevealed] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (revealed >= kicks.length) {
      const t = setTimeout(() => { setDone(true); setTimeout(onDone, 1200); }, 1200);
      return () => clearTimeout(t);
    }
    const delay = revealed === 0 ? 800 : 1600;
    const t = setTimeout(() => setRevealed((r) => r + 1), delay);
    return () => clearTimeout(t);
  }, [revealed, kicks.length, onDone]);

  const current = kicks[revealed - 1] ?? null;
  const homeScore = current?.homeTotal ?? 0;
  const awayScore = current?.awayTotal ?? 0;

  const homeKicks = kicks.slice(0, revealed).filter((k) => k.side === 'home');
  const awayKicks = kicks.slice(0, revealed).filter((k) => k.side === 'away');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm px-4"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-8 space-y-6 text-center shadow-lg"
      >
        {/* Title */}
        <div className="text-xs uppercase tracking-widest text-muted">Tirs au but</div>

        {/* Score */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`${homeScore}-${awayScore}`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-display text-5xl tabular-nums"
          >
            {homeScore} – {awayScore}
          </motion.div>
        </AnimatePresence>

        {/* Teams */}
        <div className="flex items-center justify-between px-4">
          <TeamSide team={home} kicks={homeKicks} />
          <TeamSide team={away} kicks={awayKicks} flip />
        </div>

        {/* Current kick */}
        <div className="min-h-[3rem] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={revealed}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-sm font-medium ${current.scored ? 'text-accent' : 'text-danger'}`}
              >
                {current.scored ? '⚽' : '🧤'} {current.text.replace(/^[⚽🧤]\s/, '')}
              </motion.div>
            )}
            {!current && revealed === 0 && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-muted text-sm"
              >
                Début de la séance…
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Ball animation */}
        {!done && revealed < kicks.length && (
          <motion.div
            animate={{ x: [0, -8, 8, -4, 4, 0] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            className="text-3xl"
          >
            ⚽
          </motion.div>
        )}

        {done && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="font-display text-xl text-accent"
          >
            {homeScore > awayScore ? home.name : away.name} remporte la séance !
          </motion.div>
        )}

        {!done && (
          <button
            onClick={onDone}
            className="text-xs text-muted hover:text-text transition-colors underline underline-offset-2"
          >
            Passer
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

function TeamSide({ team, kicks, flip }: { team: Team; kicks: Kick[]; flip?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${flip ? '' : ''}`}>
      {team.flag && <img src={team.flag} alt="" className="h-10 w-10 object-cover rounded" />}
      <div className="text-xs font-medium truncate max-w-[100px]">{team.name}</div>
      <div className="flex gap-1 flex-wrap justify-center max-w-[120px]">
        {kicks.map((k, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`text-lg ${k.scored ? 'text-accent' : 'text-danger'}`}
          >
            {k.scored ? '●' : '×'}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
