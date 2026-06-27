import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { Team } from '@/lib/types';

const VIDEOS = [
  '/footsim/videos/celebration-but-1.mp4',
  '/footsim/videos/celebration-but-2.mp4',
];

type Props = {
  visible: boolean;
  scoringTeam: Team | null;
  home: Team;
  away: Team;
  score: { home: number; away: number };
};

export function GoalCelebration({ visible, scoringTeam, home, away, score }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState(VIDEOS[0]);

  useEffect(() => {
    if (visible) {
      setVideoSrc(VIDEOS[Math.floor(Math.random() * VIDEOS.length)]);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    } else if (!visible && videoRef.current) {
      videoRef.current.pause();
    }
  }, [visible, videoSrc]);

  return (
    <AnimatePresence>
      {visible && scoringTeam && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Vidéo en fond */}
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            playsInline
            loop={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: 'brightness(0.45) saturate(1.2)' }}
          />

          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.75) 100%)' }}
          />

          {/* Contenu */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-5 text-center px-6"
            initial={{ scale: 0.5, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.7, y: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            {/* Ballon animé */}
            <motion.div
              animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.3, 1.3, 1.15, 1.15, 1] }}
              transition={{ duration: 0.65, delay: 0.1 }}
              className="text-8xl select-none drop-shadow-2xl"
            >
              ⚽
            </motion.div>

            {/* BUT! avec glow */}
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 18 }}
              className="font-display text-8xl tracking-widest text-white uppercase select-none"
              style={{
                textShadow: '0 0 40px rgba(255,220,50,0.9), 0 0 80px rgba(255,180,0,0.5), 0 2px 8px rgba(0,0,0,0.8)',
              }}
            >
              BUT !
            </motion.div>

            {/* Drapeau + nom équipe */}
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {scoringTeam.flag && (
                <img
                  src={scoringTeam.flag}
                  alt={scoringTeam.name}
                  className="h-10 w-10 object-cover rounded shadow-lg"
                />
              )}
              <span className="font-display text-2xl text-accent tracking-wide">
                {scoringTeam.name}
              </span>
            </motion.div>

            {/* Score */}
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.38, type: 'spring', stiffness: 220 }}
              className="font-display text-6xl tabular-nums text-white drop-shadow-lg"
            >
              {score.home} – {score.away}
            </motion.div>

            {/* Teams label */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-xs text-white/50 tracking-widest uppercase"
            >
              {home.name} · {away.name}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
