import { useState } from 'react';
import type { SavedTactic, Team } from '@/lib/types';

type Props = {
  home: Team;
  away: Team;
  homeSavedTactics?: SavedTactic[];
  awaySavedTactics?: SavedTactic[];
  onTacticChange?: (side: 'home' | 'away', tactic: SavedTactic) => void;
};

export function PauseTacticPanel({ home, away, homeSavedTactics = [], awaySavedTactics = [], onTacticChange }: Props) {
  const [homeTacticId, setHomeTacticId] = useState<string>('');
  const [awayTacticId, setAwayTacticId] = useState<string>('');

  if (homeSavedTactics.length === 0 && awaySavedTactics.length === 0) return null;

  function handleChange(side: 'home' | 'away', id: string) {
    const tactics = side === 'home' ? homeSavedTactics : awaySavedTactics;
    const tactic = tactics.find((t) => t.id === id);
    if (!tactic) return;
    if (side === 'home') setHomeTacticId(id);
    else setAwayTacticId(id);
    onTacticChange?.(side, tactic);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-subtle-sm">
      <div className="mb-2 text-xs uppercase tracking-widest text-muted">Tactique (pause)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {homeSavedTactics.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-muted">{home.name}</div>
            <select
              className="h-9 w-full rounded-md border border-border bg-bg px-2 text-xs"
              value={homeTacticId}
              onChange={(e) => handleChange('home', e.target.value)}
            >
              <option value="">— Inchangée —</option>
              {homeSavedTactics.map((t) => (
                <option key={t.id} value={t.id}>{t.name} · {t.formationLabel ?? t.formation}</option>
              ))}
            </select>
          </div>
        )}
        {awaySavedTactics.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-muted">{away.name}</div>
            <select
              className="h-9 w-full rounded-md border border-border bg-bg px-2 text-xs"
              value={awayTacticId}
              onChange={(e) => handleChange('away', e.target.value)}
            >
              <option value="">— Inchangée —</option>
              {awaySavedTactics.map((t) => (
                <option key={t.id} value={t.id}>{t.name} · {t.formationLabel ?? t.formation}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
