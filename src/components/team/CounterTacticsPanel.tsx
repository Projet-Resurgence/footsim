import { useState } from 'react';
import type { SavedTactic } from '@/lib/types';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';

type Mapping = { teamId: string; teamName: string; tacticId: string; tacticName: string; myTacticId: string; myTacticName: string };

type Props = {
  savedTactics: SavedTactic[];
  selfTeamId: string;
  /** applique la liste de tactiques mise à jour (mappings counterTactics modifiés) */
  onChange: (next: SavedTactic[]) => void;
};

/**
 * Menu dédié aux contre-tactiques : « si l'adversaire joue telle tactique,
 * activer la mienne ». Prioritaire sur la tactique active — résolu au coup
 * d'envoi par resolveMatchTactics et en plein match par findCounterTactic.
 */
export function CounterTacticsPanel({ savedTactics, selfTeamId, onChange }: Props) {
  const teams = useTeams((s) => s.teams);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const { ownerId, prApiToken } = useBackendArgs();

  const [open, setOpen] = useState(false);
  const [oppTeamId, setOppTeamId] = useState('');
  const [oppTactics, setOppTactics] = useState<{ id: string; name: string; formation: string }[] | null>(null);
  const [loadingOpp, setLoadingOpp] = useState(false);
  const [oppTacticId, setOppTacticId] = useState('');
  const [myTacticId, setMyTacticId] = useState('');

  const teamOptions = teams
    .filter((t) => t.id !== selfTeamId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const mappings: Mapping[] = savedTactics.flatMap((t) =>
    (t.counterTactics ?? []).map((c) => ({ ...c, myTacticId: t.id, myTacticName: t.name })),
  );

  async function pickOpponent(id: string) {
    setOppTeamId(id);
    setOppTacticId('');
    setOppTactics(null);
    const opp = teamOptions.find((t) => t.id === id);
    if (!opp) return;
    setLoadingOpp(true);
    try {
      const fresh = await fetchTeam(opp.slug, ownerId, null, prApiToken).catch(() => null);
      const list = (fresh?.team.savedTactics ?? opp.savedTactics ?? []).map((t) => ({ id: t.id, name: t.name, formation: t.formationLabel ?? t.formation }));
      setOppTactics(list);
    } finally {
      setLoadingOpp(false);
    }
  }

  function addMapping() {
    const oppTeam = teamOptions.find((t) => t.id === oppTeamId);
    const oppTactic = oppTactics?.find((t) => t.id === oppTacticId);
    if (!oppTeam || !oppTactic || !myTacticId) return;
    const entry = { teamId: oppTeam.id, teamName: oppTeam.name, tacticId: oppTactic.id, tacticName: oppTactic.name };
    // une tactique adverse donnée ne déclenche qu'une seule contre-tactique : retire l'ancien mapping
    const next = savedTactics.map((t) => {
      const cleaned = (t.counterTactics ?? []).filter((c) => !(c.teamId === entry.teamId && c.tacticId === entry.tacticId));
      const withNew = t.id === myTacticId ? [...cleaned, entry] : cleaned;
      return { ...t, counterTactics: withNew.length ? withNew : undefined };
    });
    onChange(next);
    setOppTacticId('');
    setMyTacticId('');
  }

  function removeMapping(m: Mapping) {
    const next = savedTactics.map((t) =>
      t.id === m.myTacticId
        ? { ...t, counterTactics: (t.counterTactics ?? []).filter((c) => !(c.teamId === m.teamId && c.tacticId === m.tacticId)) || undefined }
        : t,
    ).map((t) => ({ ...t, counterTactics: t.counterTactics?.length ? t.counterTactics : undefined }));
    onChange(next);
  }

  if (savedTactics.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-bg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-border/10 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">
          ⚔ Contre-tactiques
          {mappings.length > 0 && (
            <span className="rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{mappings.length}</span>
          )}
        </span>
        <span className="text-xs text-muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <p className="text-xs text-muted">
            Si l'adversaire aligne la tactique désignée — au coup d'envoi ou en changeant en plein
            match — ta contre-tactique est chargée automatiquement à la place de ta tactique active.
          </p>

          {/* Mappings existants */}
          {mappings.length === 0 && (
            <p className="text-xs text-muted py-1 text-center">Aucune contre-tactique définie.</p>
          )}
          <div className="space-y-1.5">
            {mappings.map((m) => (
              <div key={`${m.teamId}-${m.tacticId}-${m.myTacticId}`} className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  Si <span className="font-medium">{m.teamName}</span> joue « {m.tacticName} » → <span className="font-medium text-accent">{m.myTacticName}</span>
                </span>
                <button onClick={() => removeMapping(m)} className="shrink-0 text-muted hover:text-danger transition-colors">✕</button>
              </div>
            ))}
          </div>

          {/* Ajout */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Si</span>
            <select
              value={oppTeamId}
              onChange={(e) => pickOpponent(e.target.value)}
              className="min-w-[130px] rounded border border-border bg-surface px-2 py-1 outline-none focus:border-accent"
            >
              <option value="">— Équipe —</option>
              {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span className="text-muted">joue</span>
            <select
              value={oppTacticId}
              onChange={(e) => setOppTacticId(e.target.value)}
              disabled={!oppTeamId || loadingOpp}
              className="min-w-[130px] rounded border border-border bg-surface px-2 py-1 outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="">{loadingOpp ? 'Chargement…' : oppTactics && oppTactics.length === 0 ? 'Aucune tactique' : '— Sa tactique —'}</option>
              {(oppTactics ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.formation}</option>)}
            </select>
            <span className="text-muted">→ activer</span>
            <select
              value={myTacticId}
              onChange={(e) => setMyTacticId(e.target.value)}
              className="min-w-[130px] rounded border border-border bg-surface px-2 py-1 outline-none focus:border-accent"
            >
              <option value="">— Ma tactique —</option>
              {savedTactics.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.formationLabel ?? t.formation}</option>)}
            </select>
            <button
              onClick={addMapping}
              disabled={!oppTeamId || !oppTacticId || !myTacticId}
              className="rounded border border-accent/40 px-2 py-1 text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
            >
              + Ajouter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
