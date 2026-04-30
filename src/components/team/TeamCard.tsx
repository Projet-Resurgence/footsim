import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Team } from '@/lib/types';
import { CULTURE_LABEL } from '@/lib/types';

export function TeamCard({ team }: { team: Team }) {
  return (
    <Link to={`/dashboard/teams/${team.slug}`}>
      <motion.div
        whileHover={{ y: -4 }}
        className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-subtle-sm transition-shadow hover:shadow-subtle-md"
      >
        <div className="flex items-center gap-4">
          {team.flag ? (
            <img
              src={team.flag}
              alt=""
              className="h-16 w-16 object-cover"
            />
          ) : (
            <div className="h-16 w-16 rounded-md bg-border" />
          )}
          <div className="min-w-0">
            <div className="truncate font-display text-xl">{team.name}</div>
            <div className="text-xs text-muted">{CULTURE_LABEL[team.culture]}</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Force</span>
          <span className="font-medium text-accent">{team.globalStrength}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Joueurs</span>
          <span className="font-medium">{team.playerCount}</span>
        </div>
      </motion.div>
    </Link>
  );
}
