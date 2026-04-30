import { useMemo, useState } from 'react';
import type { Player, Position } from '@/lib/types';
import { POSITIONS } from '@/lib/types';

type SortKey = 'overall' | 'age' | 'lastName' | 'position';

export function RosterTable({ players }: { players: Player[] }) {
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortKey>('overall');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const base = filter === 'ALL' ? players : players.filter((p) => p.position === filter);
    return [...base].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [players, filter, sort, dir]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Position | 'ALL')}
        >
          <option value="ALL">Tous postes</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted">{rows.length} joueurs</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-muted">
            <tr>
              {(['lastName', 'position', 'age', 'overall'] as SortKey[]).map((k) => (
                <th
                  key={k}
                  className="cursor-pointer px-4 py-2 font-medium"
                  onClick={() => {
                    if (sort === k) setDir(dir === 'asc' ? 'desc' : 'asc');
                    else {
                      setSort(k);
                      setDir(k === 'overall' ? 'desc' : 'asc');
                    }
                  }}
                >
                  {k === 'lastName'
                    ? 'Nom'
                    : k === 'position'
                      ? 'Poste'
                      : k === 'age'
                        ? 'Âge'
                        : 'Overall'}
                  {sort === k ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th className="px-4 py-2 font-medium">Pied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2">
                  {p.firstName} {p.lastName}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded bg-border/40 px-2 py-0.5 text-xs">{p.position}</span>
                  {p.altPositions.length ? (
                    <span className="ml-2 text-xs text-muted">
                      {p.altPositions.join(', ')}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2">{p.age}</td>
                <td className="px-4 py-2 font-medium">{p.overall}</td>
                <td className="px-4 py-2 text-muted">
                  {p.preferredFoot === 'right' ? 'D' : p.preferredFoot === 'left' ? 'G' : 'D/G'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
