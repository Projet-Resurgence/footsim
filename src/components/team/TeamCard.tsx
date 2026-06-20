import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Team } from '@/lib/types';
import { CULTURE_LABEL, CONTINENT_LABEL } from '@/lib/types';

export function TeamCard({ team }: { team: Team }) {
  const cultureDisplay = team.cultures && team.cultures.length > 1
    ? team.cultures.map((cw) => CULTURE_LABEL[cw.culture]).join(', ')
    : CULTURE_LABEL[team.culture];

  const unpublished = !team.publishedAt;

  return (
    <Link to={`/dashboard/teams/${team.slug}`}>
      <motion.div
        whileHover={{ y: -4 }}
        className="group relative flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-subtle-sm transition-shadow hover:shadow-subtle-md"
      >
        {unpublished && (
          <span className="absolute right-3 top-3 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
            Non publié
          </span>
        )}

        <div className="flex items-center gap-4">
          {team.flag ? (
            <img src={team.flag} alt="" className="h-16 w-16 object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-md bg-border" />
          )}
          <div className="min-w-0">
            <div className="truncate font-display text-xl">{team.name}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted">{cultureDisplay}</div>
            {(team.continents ?? (team.continent ? [team.continent] : [])).length > 0 && (
              <div className="mt-1 text-xs text-muted/60">
                {(team.continents ?? [team.continent!]).map((c) => CONTINENT_LABEL[c]).join(' · ')}
              </div>
            )}
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
