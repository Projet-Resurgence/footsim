import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';

import { useBackendArgs } from '@/hooks/useBackendArgs';
import { listTeams, loadTeam } from '@/lib/github/store';
import { POSITION_LABEL, CULTURE_LABEL } from '@/lib/types';
import type { Team, Position } from '@/lib/types';

type PlayerEntry = {
  player: { id: string; firstName: string; lastName: string; position: string; overall: number };
  team: Team;
};

export default function MeilleursJoueurs() {
  
  const { prApiToken: effectivePat } = useBackendArgs();
  const token = effectivePat ?? effectivePat ?? null;

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<PlayerEntry[]>([]);
  const [posFilter, setPosFilter] = useState<string>('all');
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    async function load() {
      try {
        const teams = await listTeams(token);
        const all: PlayerEntry[] = [];
        await Promise.all(
          teams.map(async (team) => {
            const data = await loadTeam(team.slug, token);
            if (!data) return;
            for (const p of data.players) {
              all.push({ player: p, team });
            }
          }),
        );
        all.sort((a, b) => b.player.overall - a.player.overall);
        setEntries(all);
      } catch (err) {
        toast('error', String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positions = ['all', ...Array.from(new Set(entries.map((e) => e.player.position)))];
  const filtered = posFilter === 'all'
    ? entries
    : entries.filter((e) => e.player.position === posFilter);
  const shown = filtered.slice(0, limit);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Meilleurs joueurs</h1>
        <p className="mt-1 text-muted text-sm">{entries.length} joueurs chargés depuis toutes les équipes.</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
        >
          <option value="all">Tous les postes</option>
          {positions.filter((p) => p !== 'all').map((p) => (
            <option key={p} value={p}>{POSITION_LABEL[p as keyof typeof POSITION_LABEL] ?? p}</option>
          ))}
        </select>
        <span className="text-xs text-muted">{filtered.length} joueurs</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 w-10 text-center">#</th>
              <th className="px-4 py-2">Joueur</th>
              <th className="px-4 py-2">Poste</th>
              <th className="px-4 py-2">Nationalité</th>
              <th className="px-4 py-2">Culture</th>
              <th className="px-3 py-2 text-right font-bold">OVR</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const { player, team } = e;
              const rank = filtered.indexOf(e) + 1;
              const rankColor =
                rank === 1 ? 'text-yellow-500 font-bold' :
                rank === 2 ? 'text-zinc-400 font-bold' :
                rank === 3 ? 'text-orange-500 font-bold' :
                'text-muted';
              return (
                <tr key={player.id} className="border-t border-border hover:bg-border/10 transition-colors">
                  <td className={`px-3 py-2.5 text-center tabular-nums text-sm ${rankColor}`}>{rank}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{player.firstName} {player.lastName}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs">
                      {POSITION_LABEL[player.position as Position]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {team.flag && (
                        <img src={team.flag} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" />
                      )}
                      <span className="truncate max-w-[120px] text-sm">{team.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted text-xs">
                    {CULTURE_LABEL[team.culture] ?? team.culture}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-accent">{player.overall}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <div className="text-center">
          <button
            onClick={() => setLimit((l) => l + 50)}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:text-text transition-colors"
          >
            Afficher plus ({filtered.length - limit} restants)
          </button>
        </div>
      )}
    </div>
  );
}
