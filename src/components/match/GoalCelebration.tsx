import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { Team } from '@/lib/types';

const VIDEOS = [
  '/videos/celebration-but-1.mp4',
  '/videos/celebration-but-2.mp4',
  '/videos/celebration-but-3.mp4',
  '/videos/celebration-but-4.mp4',
  '/videos/celebration-goat-5.mp4',
  '/videos/celebration-goal-6.mp4',
  '/videos/celebration-goal-7.mp4',
];

type Props = {
  visible: boolean;
  scoringTeam: Team | null;
  home: Team;
  away: Team;
  score: { home: number; away: number };
  scorerName?: string | null;
  scorerMinute?: number | null;
};

function pickNext(last: string): string {
  const pool = VIDEOS.filter((v) => v !== last);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function GoalCelebration({ visible, scoringTeam, home, away, score, scorerName, scorerMinute }: Props) {
  // Track whether we're actually showing (not just exit-animating) to block pointer events
  const isShowing = visible && !!scoringTeam;
  const videoRef = useRef<HTMLVideoElement>(null);
  const preloadRef = useRef<HTMLVideoElement>(null);
  // La vidéo du PROCHAIN but est choisie et préchargée à l'avance (pendant le jeu) —
  // au moment du but, elle sort du cache HTTP : plus de fetch réseau qui fait laguer
  // l'animation du tir juste avant l'apparition de l'overlay.
  const [videoSrc, setVideoSrc] = useState(() => pickNext(''));
  // bump chaque but pour re-trigger les animations framer
  const [animKey, setAnimKey] = useState(0);

  const totalGoals = score.home + score.away;

  useEffect(() => {
    if (!visible) {
      videoRef.current?.pause();
      // pendant l'accalmie : choisir + précharger la vidéo du prochain but
      setVideoSrc((cur) => pickNext(cur));
      return;
    }
    setAnimKey((k) => k + 1);
    requestAnimationFrame(() => {
      videoRef.current?.play().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, totalGoals]);

  return (
    // Outer wrapper always in DOM — pointer-events disabled when not showing (incl. exit animation)
    <div className={isShowing ? undefined : 'pointer-events-none'} style={{ position: 'fixed', inset: 0, zIndex: isShowing ? 50 : -1 }}>
    {/* Précharge silencieuse de la vidéo du prochain but (jamais visible) */}
    {!visible && (
      <video
        ref={preloadRef}
        src={videoSrc}
        preload="auto"
        muted
        playsInline
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    )}
    <AnimatePresence>
      {visible && scoringTeam && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.96) 100%)' }}
        >
          {/* Re-anime le contenu à chaque but grâce à animKey */}
          <motion.div
            key={animKey}
            className="relative z-10 flex flex-col items-center gap-4 text-center px-6 w-full max-w-md"
            initial={{ scale: 0.5, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.7, y: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            <motion.div
              animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.3, 1.3, 1.15, 1.15, 1] }}
              transition={{ duration: 0.65, delay: 0.1 }}
              className="text-6xl sm:text-8xl select-none drop-shadow-2xl"
            >
              ⚽
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 18 }}
              className="font-display text-6xl sm:text-8xl tracking-widest text-white uppercase select-none"
              style={{ textShadow: '0 0 40px rgba(255,220,50,0.9), 0 0 80px rgba(255,180,0,0.5), 0 2px 8px rgba(0,0,0,0.8)' }}
            >
              BUT !
            </motion.div>

            <motion.div
              className="flex flex-col items-center gap-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center gap-3">
                {scoringTeam.flag && (
                  <img src={scoringTeam.flag} alt={scoringTeam.name} className="h-10 w-10 object-cover rounded shadow-lg" />
                )}
                <span className="font-display text-2xl text-accent tracking-wide">{scoringTeam.name}</span>
              </div>
              {scorerName && (
                <div className="flex items-center gap-1.5 text-white/80 text-base font-medium tracking-wide">
                  <span>⚽</span>
                  <span>{scorerName}</span>
                  {scorerMinute != null && (
                    <span className="text-white/40 text-sm">{scorerMinute}'</span>
                  )}
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.38, type: 'spring', stiffness: 220 }}
              className="font-display text-5xl sm:text-6xl tabular-nums text-white drop-shadow-lg"
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
                preload="auto"
                muted
                playsInline
                loop
                className="w-full h-full object-cover"
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
