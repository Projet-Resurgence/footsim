import { useState } from 'react';
import type { PlayerCompStats } from '@/lib/competition/types';
import type { Team } from '@/lib/types';

type Props = {
  playerStats: Record<string, PlayerCompStats>;
  teams: Record<string, Team>;
};

type StatCategory = 'goals' | 'assists' | 'cleanSheets' | 'yellowCards' | 'redCards';

const CATEGORIES: { key: StatCategory; label: string; emoji: string; min: number }[] = [
  { key: 'goals',       label: 'Meilleurs buteurs',       emoji: '⚽', min: 1 },
  { key: 'assists',     label: 'Meilleurs passeurs',      emoji: '🎯', min: 1 },
  { key: 'cleanSheets', label: 'Clean sheets (gardiens)', emoji: '🧤', min: 1 },
  { key: 'yellowCards', label: 'Cartons jaunes',          emoji: '🟨', min: 1 },
  { key: 'redCards',    label: 'Cartons rouges',          emoji: '🟥', min: 1 },
];

function ratingColor(r: number): string {
  if (r >= 8) return 'text-green-400';
  if (r >= 7) return 'text-accent';
  if (r >= 6) return 'text-text';
  return 'text-muted';
}

function PlayerPopup({ stat, team, onClose }: { stat: PlayerCompStats; team: Team | undefined; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 rounded-xl border border-border bg-surface shadow-2xl w-full max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {team?.flag && <img src={team.flag} alt="" className="h-7 w-7 object-cover rounded-sm shrink-0" />}
            <div>
              <div className="font-display text-base">{stat.playerName}</div>
              <div className="text-xs text-muted flex items-center gap-2">
                <span>{stat.position}</span>
                <span className="font-medium text-accent">Overall {stat.overall}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-4 py-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-display tabular-nums">{stat.goals}</div>
            <div className="text-[10px] text-muted">Buts</div>
          </div>
          <div>
            <div className="text-xl font-display tabular-nums">{stat.assists}</div>
            <div className="text-[10px] text-muted">Passes D.</div>
          </div>
          <div>
            <div className={`text-xl font-display tabular-nums ${ratingColor(stat.avgRating)}`}>
              {stat.avgRating > 0 ? stat.avgRating.toFixed(1) : '—'}
            </div>
            <div className="text-[10px] text-muted">Note moy.</div>
          </div>
          {stat.cleanSheets > 0 && (
            <div>
              <div className="text-xl font-display tabular-nums">{stat.cleanSheets}</div>
              <div className="text-[10px] text-muted">Clean sheets</div>
            </div>
          )}
          {stat.yellowCards > 0 && (
            <div>
              <div className="text-xl font-display tabular-nums text-yellow-400">{stat.yellowCards}</div>
              <div className="text-[10px] text-muted">Jaunes</div>
            </div>
          )}
          {stat.redCards > 0 && (
            <div>
              <div className="text-xl font-display tabular-nums text-danger">{stat.redCards}</div>
              <div className="text-[10px] text-muted">Rouges</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerName({ stat, onOpen }: { stat: PlayerCompStats; onOpen: (s: PlayerCompStats) => void }) {
  return (
    <button
      onClick={() => onOpen(stat)}
      className="flex-1 min-w-0 truncate text-left font-medium text-accent underline decoration-dotted hover:text-accent/70 transition-colors"
    >
      {stat.playerName}
    </button>
  );
}

export function CompetitionStats({ playerStats, teams }: Props) {
  const [active, setActive] = useState<PlayerCompStats | null>(null);
  const all = Object.values(playerStats);

  if (all.length === 0) {
    return <p className="text-muted text-sm">Aucune statistique — simulez des matchs pour les voir apparaître.</p>;
  }

  const topRated = [...all]
    .filter((p) => p.matchRatings.length >= 1)
    .sort((a, b) => b.avgRating - a.avgRating || b.goals - a.goals)
    .slice(0, 10);

  return (
    <>
      <div className="space-y-6">
        {topRated.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted flex items-center gap-2">
              <span>⭐</span>
              <span>Classement par note moyenne</span>
            </div>
            <ol className="space-y-1.5">
              {topRated.map((p, i) => {
                const team = teams[p.teamId];
                return (
                  <li key={p.playerId} className="flex items-center gap-2 text-sm">
                    <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}.</span>
                    {team?.flag && (
                      <img src={team.flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />
                    )}
                    <PlayerName stat={p} onOpen={setActive} />
                    <span className="shrink-0 text-xs text-muted tabular-nums mr-2">
                      {p.matchRatings.length} match{p.matchRatings.length > 1 ? 's' : ''}
                    </span>
                    <span className={`shrink-0 font-display tabular-nums font-medium w-8 text-right ${ratingColor(p.avgRating)}`}>
                      {p.avgRating.toFixed(1)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map(({ key, label, emoji, min }) => {
            const ranked = all
              .filter((p) => p[key] >= min)
              .sort((a, b) => b[key] - a[key] || b.avgRating - a.avgRating)
              .slice(0, 10);

            if (ranked.length === 0) return null;

            return (
              <div key={key} className="rounded-lg border border-border bg-surface p-4 space-y-3">
                <div className="text-xs uppercase tracking-widest text-muted flex items-center gap-2">
                  <span>{emoji}</span>
                  <span>{label}</span>
                </div>
                <ol className="space-y-1.5">
                  {ranked.map((p, i) => {
                    const team = teams[p.teamId];
                    return (
                      <li key={p.playerId} className="flex items-center gap-2 text-sm">
                        <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}.</span>
                        {team?.flag && (
                          <img src={team.flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />
                        )}
                        <PlayerName stat={p} onOpen={setActive} />
                        {p.avgRating > 0 && (
                          <span className={`shrink-0 text-xs tabular-nums mr-1 ${ratingColor(p.avgRating)}`}>
                            {p.avgRating.toFixed(1)}
                          </span>
                        )}
                        <span className="shrink-0 font-display tabular-nums text-accent font-medium">{p[key]}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </div>

      {active && (
        <PlayerPopup
          stat={active}
          team={teams[active.teamId]}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
