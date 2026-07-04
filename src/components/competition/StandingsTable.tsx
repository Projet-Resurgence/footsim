import type { Standing } from '@/lib/competition/types';
import type { Team } from '@/lib/types';
import { sortStandings } from '@/lib/competition/scheduler';

type Props = {
  standings: Standing[];
  teams: Record<string, Team>;
  highlightCount?: number;
  /** Nombre de places "repêchables" (meilleurs 3es) affichées après les qualifiés directs */
  softHighlightCount?: number;
  title?: string;
};

export function StandingsTable({ standings, teams, highlightCount, softHighlightCount = 0, title }: Props) {
  const sorted = sortStandings(standings);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      {title && (
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">{title}</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted uppercase tracking-wide">
            <th className="w-8 px-2 py-2 text-left">#</th>
            <th className="px-1 py-2 text-left">Équipe</th>
            <th className="w-8 px-1 py-2 text-center">J</th>
            <th className="w-8 px-1 py-2 text-center hidden sm:table-cell">G</th>
            <th className="w-8 px-1 py-2 text-center hidden sm:table-cell">N</th>
            <th className="w-8 px-1 py-2 text-center hidden sm:table-cell">P</th>
            <th className="w-9 px-1 py-2 text-center hidden md:table-cell">BP</th>
            <th className="w-9 px-1 py-2 text-center hidden md:table-cell">BC</th>
            <th className="w-9 px-1 py-2 text-center">DB</th>
            <th className="w-10 px-1 py-2 text-center font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, idx) => {
            const team = teams[s.teamId];
            const qualified = highlightCount !== undefined && idx < highlightCount;
            const softQualified = !qualified
              && highlightCount !== undefined
              && softHighlightCount > 0
              && idx < highlightCount + softHighlightCount;
            const displayName = team?.name ?? `#${s.teamId.slice(0, 8)}`;
            const gd = s.goalsFor - s.goalsAgainst;
            return (
              <tr
                key={s.teamId}
                className={`border-b border-border/50 last:border-0 transition-colors ${
                  qualified ? 'bg-accent/5' : softQualified ? 'bg-warning/5' : 'hover:bg-border/20'
                }`}
              >
                <td className="relative px-2 py-2 text-muted text-xs tabular-nums">
                  {/* Barre de qualification façon Apple Sports */}
                  <span
                    aria-hidden
                    className={`absolute left-0 top-1 bottom-1 w-0.5 rounded-full ${
                      qualified ? 'bg-accent' : softQualified ? 'bg-warning' : 'bg-transparent'
                    }`}
                  />
                  {idx + 1}
                </td>
                <td className="px-1 py-2 min-w-0 max-w-0 w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    {team?.flag && (
                      <img src={team.flag} alt="" className="h-5 w-5 shrink-0 object-cover rounded-sm" />
                    )}
                    <span
                      className={`truncate ${qualified ? 'font-medium text-accent' : softQualified ? 'font-medium text-warning' : ''}`}
                      title={team?.name ?? s.teamId}
                    >
                      {displayName}
                    </span>
                  </div>
                </td>
                <td className="px-1 py-2 text-center text-muted tabular-nums">{s.played}</td>
                <td className="px-1 py-2 text-center tabular-nums hidden sm:table-cell">{s.won}</td>
                <td className="px-1 py-2 text-center text-muted tabular-nums hidden sm:table-cell">{s.drawn}</td>
                <td className="px-1 py-2 text-center tabular-nums hidden sm:table-cell">{s.lost}</td>
                <td className="px-1 py-2 text-center tabular-nums hidden md:table-cell">{s.goalsFor}</td>
                <td className="px-1 py-2 text-center text-muted tabular-nums hidden md:table-cell">{s.goalsAgainst}</td>
                <td className={`px-1 py-2 text-center tabular-nums ${gd > 0 ? 'text-green-500' : gd < 0 ? 'text-danger/80' : 'text-muted'}`}>
                  {gd > 0 ? `+${gd}` : gd}
                </td>
                <td className="px-1 py-2 pr-2 text-center font-bold text-accent tabular-nums">{s.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
