import { AnimatePresence, motion } from 'framer-motion';
import type { MatchState } from '@/lib/sim/types';
import type { Team } from '@/lib/types';
import { WEATHER_LABEL } from '@/lib/sim/weather';
import { refereeTemperament } from '@/lib/sim/referees';

type Props = { state: MatchState; home: Team; away: Team; homeFormation?: string; awayFormation?: string; leg1Score?: { home: number; away: number } };

function minuteLabel(state: MatchState): string {
  if (state.status === 'pregame') return '0\'';
  if (state.status === 'halftime') return 'MT';
  if (state.status === 'extraTimeHalfTime') return 'MT Prol.';
  if (state.status === 'fulltime') return 'FT';
  if (state.status === 'penalties') return 'TAB';
  if (state.half === 1 && state.minute > 45) return `45+${state.minute - 45}'`;
  if (state.half === 2 && state.minute > 90) return `90+${state.minute - 90}'`;
  return `${state.minute}'`;
}

function periodLabel(state: MatchState): string {
  const s = state.status;
  if (s === 'extraTimeFirst' || s === 'extraTimeHalfTime') return ' · Prol. 1';
  if (s === 'extraTimeSecond') return ' · Prol. 2';
  if (s === 'penalties' || s === 'fulltime') return '';
  if (state.half === 1) return ' · 1ʳᵉ MT';
  return ' · 2ᵉ MT';
}

export function Scoreboard({ state, home, away, homeFormation, awayFormation, leg1Score }: Props) {
  const aggHome = leg1Score ? leg1Score.home + state.score.home : null;
  const aggAway = leg1Score ? leg1Score.away + state.score.away : null;

  return (
    <div className="rounded-lg border border-border bg-surface shadow-subtle-sm">
      <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-6 p-3 sm:p-5">
        <Side team={home} score={state.score.home} side="left" formation={homeFormation} />
        <div className="flex flex-col items-center shrink-0 pt-1 sm:pt-0">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={state.score.home + '-' + state.score.away}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="font-display text-3xl tabular-nums sm:text-4xl md:text-5xl whitespace-nowrap"
            >
              {state.score.home} – {state.score.away}
            </motion.div>
          </AnimatePresence>
          <div className="mt-1 text-[11px] sm:text-xs uppercase tracking-widest text-muted whitespace-nowrap">
            {minuteLabel(state)}{periodLabel(state)}
          </div>
          {leg1Score && (
            <div className="mt-2 flex flex-col items-center gap-0.5">
              <div className="text-xs text-muted">
                Aller : {leg1Score.home} – {leg1Score.away}
              </div>
              <div className="text-xs font-medium text-accent">
                Cumul : {aggHome} – {aggAway}
              </div>
            </div>
          )}
        </div>
        <Side team={away} score={state.score.away} side="right" formation={awayFormation} />
      </div>
      {/* Ligne méta pleine largeur : météo + arbitre ne compressent plus les noms d'équipes */}
      {(state.weather || state.referee) && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 border-t border-border/60 px-3 py-1.5 text-center text-[11px] text-muted">
          {state.weather && (
            <span className="whitespace-nowrap">
              {WEATHER_LABEL[state.weather.kind]} · {state.weather.tempC}°C
            </span>
          )}
          {state.referee && (
            <span
              title={`Fautes ×${state.referee.foulStrictness} · Jaunes ×${state.referee.cardStrictness} · Rouges ×${state.referee.redTendency} · Penalties ×${state.referee.penaltyTendency}`}
            >
              Arbitre : {state.referee.name} ({refereeTemperament(state.referee)})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Side({ team, score, side, formation }: { team: Team; score: number; side: 'left' | 'right'; formation?: string }) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 text-center sm:flex-none sm:flex-row sm:gap-3 ${
        side === 'right' ? 'sm:flex-row-reverse sm:text-right' : 'sm:text-left'
      }`}
    >
      {team.flag ? (
        <img src={team.flag} alt="" className="h-9 w-9 sm:h-12 sm:w-12 object-cover shrink-0" />
      ) : (
        <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-md bg-border shrink-0" />
      )}
      <div className="min-w-0 w-full sm:w-auto">
        <div className="break-words font-display text-xs leading-tight line-clamp-2 sm:truncate sm:text-lg">{team.name}</div>
        {formation && <div className="text-[10px] sm:text-xs font-mono text-accent">{formation}</div>}
        <div className="hidden sm:block text-xs text-muted">Score : {score}</div>
      </div>
    </div>
  );
}
