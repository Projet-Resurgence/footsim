import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Team } from '@/lib/types';

const VIDEOS = [
  '/videos/celebration-but-1.mp4',
  '/videos/celebration-but-2.mp4',
  '/videos/celebration-but-3.mp4',
  '/videos/celebration-but-4.mp4',
];

type Props = {
  goalKey: number;         // incrémenté à chaque but → force remount
  scoringTeam: Team | null;
  home: Team;
  away: Team;
  score: { home: number; away: number };
};

function GoalOverlay({ goalKey, scoringTeam, home, away, score }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Vidéo choisie une fois à la création de ce composant
  const videoSrc = useRef(VIDEOS[goalKey % VIDEOS.length === 0 && VIDEOS.length > 1
    ? Math.floor(Math.random() * VIDEOS.length)
    : Math.floor(Math.random() * VIDEOS.length)
  ]).current;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.load();
    el.play().catch(() => {});
  }, []);

  if (!scoringTeam) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.96) 100%)' }}
    >
      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 text-center px-6 w-full max-w-md"
        initial={{ scale: 0.5, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.7, y: -30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        <motion.div
          animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.3, 1.3, 1.15, 1.15, 1] }}
          transition={{ duration: 0.65, delay: 0.1 }}
          className="text-8xl select-none drop-shadow-2xl"
        >
          ⚽
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 18 }}
          className="font-display text-8xl tracking-widest text-white uppercase select-none"
          style={{ textShadow: '0 0 40px rgba(255,220,50,0.9), 0 0 80px rgba(255,180,0,0.5), 0 2px 8px rgba(0,0,0,0.8)' }}
        >
          BUT !
        </motion.div>

        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {scoringTeam.flag && (
            <img src={scoringTeam.flag} alt={scoringTeam.name} className="h-10 w-10 object-cover rounded shadow-lg" />
          )}
          <span className="font-display text-2xl text-accent tracking-wide">{scoringTeam.name}</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.38, type: 'spring', stiffness: 220 }}
          className="font-display text-6xl tabular-nums text-white drop-shadow-lg"
        >
          {score.home} – {score.away}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="text-xs text-white/50 tracking-widest uppercase"
        >
          {home.name} · {away.name}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="w-full rounded-xl overflow-hidden border border-white/10 shadow-2xl mt-2"
          style={{ aspectRatio: '16/9' }}
        >
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            playsInline
            loop
            className="w-full h-full object-cover"
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function GoalCelebration(props: Props) {
  const visible = props.goalKey > 0 && props.scoringTeam !== null;
  return (
    <AnimatePresence mode="wait">
      {visible && <GoalOverlay key={props.goalKey} {...props} />}
    </AnimatePresence>
  );
}
