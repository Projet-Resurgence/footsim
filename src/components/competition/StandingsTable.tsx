import type { Standing } from '@/lib/competition/types';
import type { Team } from '@/lib/types';
import { sortStandings } from '@/lib/competition/scheduler';

type Props = {
  standings: Standing[];
  teams: Record<string, Team>;
  highlightCount?: number;
  title?: string;
};

export function StandingsTable({ standings, teams, highlightCount, title }: Props) {
  const sorted = sortStandings(standings);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {title && (
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">{title}</div>
      )}
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-7" />
          <col />
          <col className="w-8" />
          <col className="w-8" />
          <col className="w-8" />
          <col className="w-8" />
          <col className="w-9" />
          <col className="w-9" />
          <col className="w-9" />
          <col className="w-10" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-xs text-muted uppercase tracking-wide">
            <th className="px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Équipe</th>
            <th className="px-1 py-2 text-center">J</th>
            <th className="px-1 py-2 text-center">G</th>
            <th className="px-1 py-2 text-center">N</th>
            <th className="px-1 py-2 text-center">P</th>
            <th className="px-1 py-2 text-center">BP</th>
            <th className="px-1 py-2 text-center">BC</th>
            <th className="px-1 py-2 text-center">DB</th>
            <th className="px-1 py-2 text-center font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, idx) => {
            const team = teams[s.teamId];
            const qualified = highlightCount !== undefined && idx < highlightCount;
            const displayName = team?.name ?? `#${s.teamId.slice(0, 8)}`;
            return (
              <tr
                key={s.teamId}
                className={`border-b border-border/50 last:border-0 transition-colors ${
                  qualified ? 'bg-accent/5' : 'hover:bg-border/20'
                }`}
              >
                <td className="px-2 py-2 text-muted text-xs tabular-nums">{idx + 1}</td>
                <td className="px-2 py-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {team?.flag && (
                      <img src={team.flag} alt="" className="h-5 w-5 shrink-0 object-cover rounded-sm" />
                    )}
                    <span
                      className={`truncate ${qualified ? 'font-medium text-accent' : ''}`}
                      title={team?.name ?? s.teamId}
                    >
                      {displayName}
                    </span>
                  </div>
                </td>
                <td className="px-1 py-2 text-center text-muted tabular-nums">{s.played}</td>
                <td className="px-1 py-2 text-center tabular-nums">{s.won}</td>
                <td className="px-1 py-2 text-center text-muted tabular-nums">{s.drawn}</td>
                <td className="px-1 py-2 text-center tabular-nums">{s.lost}</td>
                <td className="px-1 py-2 text-center tabular-nums">{s.goalsFor}</td>
                <td className="px-1 py-2 text-center text-muted tabular-nums">{s.goalsAgainst}</td>
                <td className="px-1 py-2 text-center tabular-nums">{s.goalsFor - s.goalsAgainst}</td>
                <td className="px-1 py-2 text-center font-bold text-accent tabular-nums">{s.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
