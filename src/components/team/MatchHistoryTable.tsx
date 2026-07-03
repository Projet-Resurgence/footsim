import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '@/components/ui/Toast';
import type { RecentMatchSummary } from '@/lib/github/matches';
import { calcCmfMatchPoints } from '@/lib/github/matches';
import { COMPETITION_IMPORTANCE_LABEL } from '@/lib/competition/types';
import { useCompetition } from '@/stores/competition';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { PrApiMatchBackend, type StoredMatch } from '@/lib/prapi/matchBackend';
import { TacticalReportModal } from '@/components/match/TacticalReportModal';

type Props = {
  recentMatches: RecentMatchSummary[];
  teamId: string;
  /** persiste les entrées enrichies (backfill compétition) — one-shot */
  onEnrich?: (next: RecentMatchSummary[]) => void;
  /** actions admin (dashboard) */
  onDelete?: (matchId: string) => void;
  onDeleteAll?: () => void;
};

/**
 * Historique complet des matchs — affichage commun My Team / dashboard.
 * Colonnes compétition (lien direct) + compte-rendu tactique (📋, restreint au
 * camp du manager par TacticalReportModal) + replay. Les vieilles entrées sans
 * competitionId sont backfillées une fois depuis les compétitions de l'équipe.
 */
export function MatchHistoryTable({ recentMatches, teamId, onEnrich, onDelete, onDeleteAll }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { prApiToken } = useBackendArgs();
  const [report, setReport] = useState<StoredMatch | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const loadComp = useCompetition((s) => s.load);
  const refreshComps = useCompetition((s) => s.refresh);
  const backfilledRef = useRef(false);

  // Backfill : les entrées d'avant l'ajout de competitionId sont résolues via les
  // compétitions auxquelles l'équipe a participé, puis persistées (one-shot).
  useEffect(() => {
    if (backfilledRef.current || !onEnrich || !prApiToken) return;
    const missing = recentMatches.some((m) => !m.competitionId && !m.matchId.startsWith('lpm-'));
    if (!missing) return;
    backfilledRef.current = true;
    (async () => {
      try {
        if (useCompetition.getState().summaries.length === 0) await refreshComps('', prApiToken);
        const candidates = useCompetition.getState().summaries.filter((s) => s.teamIds?.includes(teamId));
        const matchToComp = new Map<string, { id: string; name: string }>();
        for (const c of candidates) {
          const comp = await loadComp(c.id, '', prApiToken).catch(() => null);
          if (!comp) continue;
          for (const m of comp.matches) matchToComp.set(m.id, { id: comp.id, name: comp.name });
        }
        let changed = false;
        const next = recentMatches.map((m) => {
          if (m.competitionId) return m;
          const hit = matchToComp.get(m.matchId);
          if (!hit) return m;
          changed = true;
          return { ...m, competitionId: hit.id, competitionName: hit.name };
        });
        if (changed) onEnrich(next);
      } catch { /* backfill silencieux — retentera à la prochaine visite */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentMatches, prApiToken, teamId]);

  async function openReport(matchId: string) {
    if (!prApiToken || loadingReportId) return;
    setLoadingReportId(matchId);
    try {
      const backend = new PrApiMatchBackend(prApiToken);
      let m = await backend.loadMatch(matchId);
      // liens legacy « comp-… » : stocké sous l'id brut (dernier segment)
      if (!m && matchId.startsWith('comp-')) {
        m = await backend.loadMatch(matchId.slice(matchId.lastIndexOf('-') + 1));
      }
      if (!m || !m.input?.home?.players?.length || !m.input?.away?.players?.length) {
        toast('error', 'Compte-rendu indisponible pour ce match.');
        return;
      }
      setReport(m);
    } finally {
      setLoadingReportId(null);
    }
  }

  if (recentMatches.length === 0) {
    return (
      <div className="py-16 text-center text-muted text-sm">
        Aucun match enregistré. L'historique apparaît ici après chaque compétition.
      </div>
    );
  }

  const sorted = [...recentMatches].sort((a, b) => b.playedAt.localeCompare(a.playedAt));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted">
          Historique complet · {recentMatches.length} match{recentMatches.length > 1 ? 's' : ''} enregistré{recentMatches.length > 1 ? 's' : ''}
        </div>
        {onDeleteAll && (
          <button
            onClick={() => { if (confirm('Supprimer tout l\'historique de matchs ?')) onDeleteAll(); }}
            className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
          >
            Tout supprimer
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Adversaire</th>
              <th className="px-3 py-2 text-center">D/E</th>
              <th className="px-3 py-2 text-center">Score</th>
              <th className="px-3 py-2 text-center">Résultat</th>
              <th className="px-3 py-2 text-right">Pts CMF</th>
              <th className="px-3 py-2">Importance</th>
              <th className="px-3 py-2">Compétition</th>
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const won = m.scoreFor > m.scoreAgainst;
              const drew = m.scoreFor === m.scoreAgainst;
              const resultLabel = won ? 'V' : drew ? 'N' : 'D';
              const resultColor = won ? 'text-green-400' : drew ? 'text-warning' : 'text-danger';
              const pts = m.opponentStrength != null
                ? calcCmfMatchPoints({ scoreFor: m.scoreFor, scoreAgainst: m.scoreAgainst, opponentStrength: m.opponentStrength, compKind: m.compKind, compScope: m.compScope, compImportance: m.compImportance, participantCount: m.participantCount })
                : (m.cmfPoints ?? 0);
              const key = `${m.matchId}-${m.homeAway}`;
              const hasDetails = !!(m.scorers?.length || m.cards?.length);
              const isExpanded = expanded === key;
              const isSynthetic = m.matchId.startsWith('lpm-');
              return (
                <Fragment key={key}>
                  <tr
                    className={`border-t border-border transition-colors ${hasDetails ? 'cursor-pointer hover:bg-accent/5' : ''}`}
                    onClick={() => hasDetails && setExpanded(isExpanded ? null : key)}
                  >
                    <td className="px-3 py-2 text-xs text-muted tabular-nums whitespace-nowrap">
                      {new Date(m.playedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td className="px-3 py-2 font-medium">{m.opponentName}</td>
                    <td className="px-3 py-2 text-center text-xs text-muted">{m.homeAway === 'home' ? 'D' : 'E'}</td>
                    <td className="px-3 py-2 text-center font-mono tabular-nums">{m.scoreFor}–{m.scoreAgainst}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`font-bold text-xs ${resultColor}`}>{resultLabel}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-accent">{pts > 0 ? `+${pts}` : pts}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {m.compImportance ? COMPETITION_IMPORTANCE_LABEL[m.compImportance] : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {m.competitionId ? (
                        <Link
                          to={`/competitions/${m.competitionId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-accent hover:underline"
                          title="Voir la compétition"
                        >
                          {m.competitionName ?? 'Compétition'}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {!isSynthetic && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); openReport(m.matchId); }}
                            disabled={loadingReportId !== null}
                            className="rounded px-1.5 py-0.5 text-xs text-muted hover:text-accent transition-colors disabled:opacity-40"
                            title="Compte-rendu tactique du match"
                          >
                            {loadingReportId === m.matchId ? '…' : '📋'}
                          </button>
                          <Link
                            to={`/match/${m.matchId}/replay`}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded px-1.5 py-0.5 text-xs text-accent hover:bg-accent/10 transition-colors"
                            title="Revoir ce match"
                          >
                            ▶
                          </Link>
                        </>
                      )}
                      {onDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(m.matchId); }}
                          className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger/10 transition-colors"
                          title="Supprimer ce match de l'historique"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasDetails && (
                    <tr className="border-t border-border/30">
                      <td colSpan={9} className="px-4 py-2 bg-surface/60">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                          {(m.scorers ?? []).map((g, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <span>⚽</span>
                              <span className="font-medium text-text">{g.playerName}</span>
                              <span className="text-muted/60">{g.minute}'</span>
                              {g.assistName && <span className="text-muted/60">(p. {g.assistName})</span>}
                            </span>
                          ))}
                          {(m.cards ?? []).map((c, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <span>{c.type === 'red' ? '🟥' : '🟨'}</span>
                              <span className="font-medium text-text">{c.playerName}</span>
                              <span className="text-muted/60">{c.minute}'</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {report && (
        <TacticalReportModal
          state={report.state}
          home={report.input.home}
          away={report.input.away}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
}
