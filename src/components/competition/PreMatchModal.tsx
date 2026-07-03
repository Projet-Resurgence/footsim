import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { CorruptionPanel } from '@/components/match/CorruptionPanel';
import type { CorruptionDeal } from '@/lib/sim/types';
import type { SavedTactic, Team } from '@/lib/types';
import { resolveMatchTactics } from '@/lib/localTactics';

type Props = {
  home: Team;
  away: Team;
  defaultCountForStats?: boolean;
  fetchBothTeams?: (slugs: string[]) => Promise<{ team: Team; players: unknown[] }[]>;
  onConfirm: (corruption: CorruptionDeal | null, tactics?: { homeId?: string; awayId?: string }, countForStats?: boolean, homeAdvantage?: boolean) => void;
  onCancel: () => void;
};

export function PreMatchModal({ home, away, defaultCountForStats = true, fetchBothTeams, onConfirm, onCancel }: Props) {
  const [corruption, setCorruption] = useState<CorruptionDeal | null>(null);
  const [homeTactics, setHomeTactics] = useState<SavedTactic[]>(home.savedTactics ?? []);
  const [awayTactics, setAwayTactics] = useState<SavedTactic[]>(away.savedTactics ?? []);
  const [homeTacticId, setHomeTacticId] = useState<string>('');
  const [awayTacticId, setAwayTacticId] = useState<string>('');
  const [countForStats, setCountForStats] = useState(defaultCountForStats);
  const [homeAdvantage, setHomeAdvantage] = useState(false);

  // Présélectionne la tactique qui sera réellement jouée (contre-tactique incluse)
  function preselect(hTactics: SavedTactic[], aTactics: SavedTactic[]) {
    const r = resolveMatchTactics({ ...home, savedTactics: hTactics }, { ...away, savedTactics: aTactics });
    const hId = (r.home as SavedTactic | undefined)?.id;
    const aId = (r.away as SavedTactic | undefined)?.id;
    if (hId && hTactics.some((t) => t.id === hId)) setHomeTacticId((prev) => prev || hId);
    if (aId && aTactics.some((t) => t.id === aId)) setAwayTacticId((prev) => prev || aId);
  }

  useEffect(() => {
    if (!fetchBothTeams) { preselect(home.savedTactics ?? [], away.savedTactics ?? []); return; }
    fetchBothTeams([home.slug, away.slug]).then((results) => {
      const h = results.find((r) => r.team.slug === home.slug);
      const a = results.find((r) => r.team.slug === away.slug);
      const hT = h?.team.savedTactics ?? home.savedTactics ?? [];
      const aT = a?.team.savedTactics ?? away.savedTactics ?? [];
      if (h) setHomeTactics(hT);
      if (a) setAwayTactics(aT);
      preselect(hT, aT);
    }).catch(() => preselect(home.savedTactics ?? [], away.savedTactics ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home.id, away.id]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg rounded-xl border border-border bg-bg shadow-2xl p-6 space-y-5"
        >
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1">Pré-match</div>
            <h2 className="font-display text-2xl">{home.name} <span className="text-muted">vs</span> {away.name}</h2>
          </div>

          {/* Tactic selectors */}
          <div className="grid grid-cols-2 gap-3">
            {([
              ['home', home, homeTactics, homeTacticId, setHomeTacticId],
              ['away', away, awayTactics, awayTacticId, setAwayTacticId],
            ] as const).map(([side, team, tactics, tacticId, setTacticId]) => (
              <div key={side} className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-muted">{team.name}</div>
                {tactics.length > 0 ? (
                  <select
                    value={tacticId}
                    onChange={(e) => setTacticId(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text"
                  >
                    <option value="">— Tactique active —</option>
                    {tactics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.formationLabel ?? t.formation}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-muted">
                    Tactique active
                  </div>
                )}
              </div>
            ))}
          </div>

          <CorruptionPanel
            homeTeamName={home.name}
            awayTeamName={away.name}
            deal={corruption}
            onDeal={setCorruption}
          />

          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={countForStats}
              onChange={(e) => setCountForStats(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Compter dans l'historique et le classement CMF
          </label>

          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={homeAdvantage}
              onChange={(e) => setHomeAdvantage(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Avantage du terrain pour {home.name}
          </label>

          <div className="flex gap-3">
            <Button
              size="sm"
              onClick={() => onConfirm(corruption, {
                homeId: homeTacticId || undefined,
                awayId: awayTacticId || undefined,
              }, countForStats, homeAdvantage)}
            >
              Lancer le match
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
