import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CompMatch } from '@/lib/competition/types';
import type { Team } from '@/lib/types';

type LPMPair = { leg1: CompMatch; leg2: CompMatch | undefined };

/** Resolve the qualifier for an LPM barrage A/R duel from aggregate score / penalties.
 *  Leg 2 always forces extra time + penalties on an aggregate draw, so this is never undecided. */
export function resolveLPMPlayoffQualifier(
  leg1: CompMatch,
  leg2: CompMatch | undefined,
): string | null {
  if (!leg2 || leg1.status !== 'completed' || leg2.status !== 'completed') return null;
  const l1h = leg1.result?.home ?? 0;
  const l1a = leg1.result?.away ?? 0;
  const l2h = leg2.result?.home ?? 0;
  const l2a = leg2.result?.away ?? 0;
  // Depuis leg1: higher=away (reçoit au retour), lower=home. Agrégat: higher = l1a + l2h, lower = l1h + l2a
  const aggHigher = l1a + l2h;
  const aggLower = l1h + l2a;
  if (aggHigher > aggLower) return leg1.awayTeamId ?? null;
  if (aggLower > aggHigher) return leg1.homeTeamId ?? null;
  if (leg2.result?.penalties) {
    return leg2.result.penalties.home > leg2.result.penalties.away
      ? (leg2.homeTeamId ?? null)
      : (leg2.awayTeamId ?? null);
  }
  return null;
}

export function LPMBracketView({
  matches,
  teams,
  onSimulate,
}: {
  matches: CompMatch[];
  teams: Record<string, Team>;
  onSimulate?: (matchId: string) => void;
}) {
  const leg1s = matches.filter((m) => m.leg === 1).sort((a, b) => {
    const ha = teams[a.homeTeamId ?? '']?.name ?? '';
    const hb = teams[b.homeTeamId ?? '']?.name ?? '';
    return ha.localeCompare(hb);
  });

  const leg2s = matches.filter((m) => m.leg === 2);

  const pairs: LPMPair[] = leg1s.map((leg1) => {
    // Try homeFromMatch first (pre-seed state), then match by teams (post-seed)
    const leg2 = leg2s.find((m) => m.homeFromMatch === leg1.id)
      ?? leg2s.find((m) =>
        m.homeTeamId && m.awayTeamId &&
        leg1.homeTeamId && leg1.awayTeamId &&
        ((m.homeTeamId === leg1.awayTeamId && m.awayTeamId === leg1.homeTeamId) ||
         (m.homeTeamId === leg1.homeTeamId && m.awayTeamId === leg1.awayTeamId))
      );
    return { leg1, leg2 };
  });

  return (
    <div className="space-y-3">
      {pairs.map(({ leg1, leg2 }, i) => (
        <LPMPairCard
          key={leg1.id}
          index={i + 1}
          leg1={leg1}
          leg2={leg2}
          teams={teams}
          onSimulate={onSimulate}
        />
      ))}
    </div>
  );
}

function LPMPairCard({
  index, leg1, leg2, teams, onSimulate,
}: {
  index: number;
  leg1: CompMatch;
  leg2: CompMatch | undefined;
  teams: Record<string, Team>;
  onSimulate?: (matchId: string) => void;
}) {
  const lower = leg1.homeTeamId ? teams[leg1.homeTeamId] : null;  // reçoit à l'aller
  const higher = leg1.awayTeamId ? teams[leg1.awayTeamId] : null; // reçoit au retour
  const tbd = !leg1.homeTeamId && !leg1.awayTeamId;

  // Agrégat
  const l1h = leg1.result?.home ?? 0;
  const l1a = leg1.result?.away ?? 0;
  const l2h = leg2?.result?.home ?? 0;
  const l2a = leg2?.result?.away ?? 0;
  const leg1Done = leg1.status === 'completed';
  const leg2Done = leg2?.status === 'completed';
  const bothDone = leg1Done && leg2Done;

  const aggHigher = l1a + l2h;
  const aggLower = l1h + l2a;

  const qualifiedId = resolveLPMPlayoffQualifier(leg1, leg2);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-bg px-4 py-2 text-xs text-muted uppercase tracking-wide">
        <span>Barrage {index}</span>
        {qualifiedId && (
          <span className="font-medium normal-case text-green-400">
            ✓ {teams[qualifiedId]?.name ?? '?'} qualifié
          </span>
        )}
      </div>

      {tbd ? (
        <div className="px-4 py-4 text-sm text-muted italic">Équipes à définir après les journées</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-border/50">
              <th className="px-4 py-1.5 text-left">Équipe</th>
              <th className="px-3 py-1.5 text-center w-16">Aller</th>
              <th className="px-3 py-1.5 text-center w-16">Retour</th>
              <th className="px-3 py-1.5 text-center w-20 font-bold text-text">Cumul</th>
              {leg2?.result?.penalties && (
                <th className="px-3 py-1.5 text-center w-16">TAB</th>
              )}
              <th className="px-3 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {/* Lower seed — leg1 home, leg2 away */}
            <LPMTeamRow
              team={lower}
              leg1Score={leg1Done ? l1h : undefined}
              leg2Score={leg2Done ? l2a : undefined}
              agg={leg1Done ? aggLower : undefined}
              penalties={leg2?.result?.penalties ? leg2.result.penalties.away : undefined}
              qualified={qualifiedId === leg1.homeTeamId}
              bothDone={bothDone}
            />
            {/* Higher seed — leg1 away, leg2 home */}
            <LPMTeamRow
              team={higher}
              leg1Score={leg1Done ? l1a : undefined}
              leg2Score={leg2Done ? l2h : undefined}
              agg={leg1Done ? aggHigher : undefined}
              penalties={leg2?.result?.penalties ? leg2.result.penalties.home : undefined}
              qualified={qualifiedId === leg1.awayTeamId}
              bothDone={bothDone}
            />
          </tbody>
        </table>
      )}

      {/* Simulate buttons */}
      {onSimulate && !tbd && (
        <div className="flex gap-3 border-t border-border/50 px-4 py-2">
          {leg1.status === 'pending' && (
            <button onClick={() => onSimulate(leg1.id)} className="text-xs text-accent hover:text-accent/70 transition-colors">
              ▶ Simuler aller
            </button>
          )}
          {leg2 && leg1Done && leg2.status === 'pending' && (
            <button onClick={() => onSimulate(leg2.id)} className="text-xs text-accent hover:text-accent/70 transition-colors">
              ▶ Simuler retour
            </button>
          )}
        </div>
      )}

    </div>
  );
}

function LPMTeamRow({
  team, leg1Score, leg2Score, agg, penalties, qualified, bothDone,
}: {
  team: Team | null;
  leg1Score?: number;
  leg2Score?: number;
  agg?: number;
  penalties?: number;
  qualified: boolean;
  bothDone: boolean;
}) {
  return (
    <tr className={`border-t border-border/30 ${qualified ? 'bg-green-500/5' : ''}`}>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {team?.flag && <img src={team.flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />}
          <span className={`truncate max-w-[140px] ${qualified ? 'font-medium text-green-400' : ''}`}>
            {team?.name ?? 'À définir'}
          </span>
          {qualified && <span className="text-[10px] rounded border border-green-500/40 bg-green-500/10 px-1 text-green-400 shrink-0">Qualifié</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-center tabular-nums text-muted">
        {leg1Score !== undefined ? leg1Score : '—'}
      </td>
      <td className="px-3 py-2 text-center tabular-nums text-muted">
        {leg2Score !== undefined ? leg2Score : '—'}
      </td>
      <td className={`px-3 py-2 text-center tabular-nums font-bold ${bothDone && qualified ? 'text-green-400' : ''}`}>
        {agg !== undefined ? agg : '—'}
      </td>
      {penalties !== undefined && (
        <td className={`px-3 py-2 text-center tabular-nums ${qualified ? 'font-bold text-green-400' : 'text-muted'}`}>
          {penalties}
        </td>
      )}
      <td className="px-3 py-2" />
    </tr>
  );
}

type Props = {
  matches: CompMatch[];
  teams: Record<string, Team>;
  onSimulate?: (matchId: string) => void;
};

const PHASE_ORDER: Record<string, number> = {
  R64: 0, R32: 1, R16: 2, QF: 3, SF: 4, F: 5, '3rd': 6,
};

const PHASE_LABEL: Record<string, string> = {
  R64: '32èmes', R32: '16èmes', R16: '8èmes', QF: 'Quarts', SF: 'Demies', F: 'Finale', '3rd': '3e place',
};

function phaseLabel(phase: string): string {
  const ko = phase.match(/^KO(\d+)$/);
  if (ko) return `Tour (${ko[1]} matchs)`;
  return PHASE_LABEL[phase] ?? phase;
}

/** Tie = leg1 (+ leg2 éventuel) d'une même confrontation. */
type Tie = { leg1: CompMatch; leg2?: CompMatch };

function buildTies(phaseMatches: CompMatch[]): Tie[] {
  const leg1s = phaseMatches.filter((m) => m.leg === 1);
  const leg2s = phaseMatches.filter((m) => m.leg === 2);
  // identifie une confrontation par ses deux "sources" (équipe ou match d'origine), ordre ignoré
  const tieKey = (m: CompMatch) =>
    [m.homeTeamId ?? `from:${m.homeFromMatch ?? '?'}`, m.awayTeamId ?? `from:${m.awayFromMatch ?? '?'}`]
      .sort()
      .join('|');
  return leg1s.map((leg1) => ({
    leg1,
    leg2: leg2s.find((m) => tieKey(m) === tieKey(leg1)),
  }));
}

/** Connecteur entre une confrontation et celle qu'elle alimente. */
type BracketEdge = {
  from: string;        // leg1.id source
  to: string;          // leg1.id cible
  /** vainqueur connu ET placé dans la cible → segment "complété" */
  active: boolean;
};

/** Arêtes du tableau : homeFromMatch/awayFromMatch → confrontation suivante. */
function buildEdges(tiesByPhase: Tie[][]): BracketEdge[] {
  const tieByLeg1 = new Map<string, Tie>();
  for (const ties of tiesByPhase) for (const t of ties) tieByLeg1.set(t.leg1.id, t);
  const edges: BracketEdge[] = [];
  for (const ties of tiesByPhase) {
    for (const tie of ties) {
      for (const src of [tie.leg1.homeFromMatch, tie.leg1.awayFromMatch]) {
        if (!src) continue;
        const srcTie = tieByLeg1.get(src);
        if (!srcTie) continue;
        const winner = tieWinnerId(srcTie.leg1, srcTie.leg2);
        const active = !!winner
          && (tie.leg1.homeTeamId === winner || tie.leg1.awayTeamId === winner);
        edges.push({ from: src, to: tie.leg1.id, active });
      }
    }
  }
  return edges;
}

/** Coude arrondi : sortie droite de la source → entrée gauche de la cible. */
function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  if (Math.abs(a.y - b.y) < 2) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const midX = (a.x + b.x) / 2;
  const r = Math.min(6, Math.abs(b.y - a.y) / 2, Math.abs(b.x - a.x) / 2);
  const dy = b.y > a.y ? 1 : -1;
  return [
    `M ${a.x} ${a.y}`,
    `L ${midX - r} ${a.y}`,
    `Q ${midX} ${a.y} ${midX} ${a.y + r * dy}`,
    `L ${midX} ${b.y - r * dy}`,
    `Q ${midX} ${b.y} ${midX + r} ${b.y}`,
    `L ${b.x} ${b.y}`,
  ].join(' ');
}

type CardAnchor = { left: { x: number; y: number }; right: { x: number; y: number } };

export function BracketView({ matches, teams, onSimulate }: Props) {
  const phases = [...new Set(matches.map((m) => m.phase))].sort(
    (a, b) => (PHASE_ORDER[a] ?? 99) - (PHASE_ORDER[b] ?? 99),
  );
  const mainPhases = phases.filter((p) => p !== '3rd');
  const thirdMatches = matches.filter((m) => m.phase === '3rd');

  const tiesByPhase = useMemo(
    () => mainPhases.map((phase) => buildTies(matches.filter((m) => m.phase === phase))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches],
  );
  const edges = useMemo(() => buildEdges(tiesByPhase), [tiesByPhase]);

  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [anchors, setAnchors] = useState<Record<string, CardAnchor>>({});

  const setCardRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  };

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    function measure() {
      if (!grid) return;
      const gRect = grid.getBoundingClientRect();
      const next: Record<string, CardAnchor> = {};
      for (const [id, el] of cardRefs.current) {
        const r = el.getBoundingClientRect();
        const y = r.top - gRect.top + r.height / 2;
        next[id] = {
          left: { x: r.left - gRect.left, y },
          right: { x: r.right - gRect.left, y },
        };
      }
      setAnchors(next);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [matches]);

  function scrollToPhase(phase: string) {
    document.getElementById(`bracket-phase-${phase}`)?.scrollIntoView({
      behavior: 'smooth', inline: 'center', block: 'nearest',
    });
  }

  return (
    <div className="space-y-3">
      {/* Phase quick-nav (mobile surtout) */}
      {mainPhases.length > 2 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:hidden">
          {phases.map((p) => (
            <button
              key={p}
              onClick={() => scrollToPhase(p)}
              className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted hover:text-text transition-colors"
            >
              {phaseLabel(p)}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto snap-x snap-mandatory sm:snap-none -mx-4 px-4 sm:mx-0 sm:px-0">
        <div ref={gridRef} className="relative flex items-stretch min-w-max pb-4">
          {/* Chemins entre les cases — gris = à jouer, accent = qualifié passé */}
          <svg aria-hidden className="absolute inset-0 h-full w-full pointer-events-none">
            {edges.map(({ from, to, active }) => {
              const a = anchors[from]?.right;
              const b = anchors[to]?.left;
              if (!a || !b) return null;
              return (
                <path
                  key={`${from}-${to}`}
                  d={edgePath(a, b)}
                  fill="none"
                  stroke={active ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={active ? 2 : 1.5}
                  strokeLinecap="round"
                  className="transition-all"
                  opacity={active ? 1 : 0.9}
                />
              );
            })}
          </svg>

          {mainPhases.map((phase, pi) => {
            const ties = tiesByPhase[pi];
            const isLast = pi === mainPhases.length - 1;
            return (
              <div
                key={phase}
                id={`bracket-phase-${phase}`}
                className="flex flex-col snap-center w-[86vw] max-w-[290px] sm:w-[250px] shrink-0"
              >
                <div className={`sticky left-0 text-xs font-semibold uppercase tracking-widest text-center pb-3 ${
                  phase === 'F' ? 'text-warning' : 'text-muted'
                }`}>
                  {phase === 'F' && '🏆 '}{phaseLabel(phase)}
                </div>
                {/* justify-around aligne mathématiquement chaque match entre les centres de ses deux matchs sources */}
                <div className="flex flex-1 flex-col justify-around gap-3 px-3.5">
                  {ties.map(({ leg1, leg2 }) => (
                    <div key={leg1.id} ref={setCardRef(leg1.id)} className="relative">
                      <BracketTie leg1={leg1} leg2={leg2} teams={teams} onSimulate={onSimulate} highlight={phase === 'F'} />
                    </div>
                  ))}
                  {/* 3e place sous la finale */}
                  {isLast && thirdMatches.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted text-center">{phaseLabel('3rd')}</div>
                      {buildTies(thirdMatches).map(({ leg1, leg2 }) => (
                        <BracketTie key={leg1.id} leg1={leg1} leg2={leg2} teams={teams} onSimulate={onSimulate} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function tieWinnerId(leg1: CompMatch, leg2?: CompMatch): string | null {
  if (leg1.status !== 'completed' || !leg1.result || !leg1.homeTeamId || !leg1.awayTeamId) return null;
  if (!leg2) {
    const r = leg1.result;
    if (r.home !== r.away) return r.home > r.away ? leg1.homeTeamId : leg1.awayTeamId;
    if (r.penalties) return r.penalties.home > r.penalties.away ? leg1.homeTeamId : leg1.awayTeamId;
    return null;
  }
  if (leg2.status !== 'completed' || !leg2.result) return null;
  // aggregate: leg1 home = leg2 away
  const aggL1Home = leg1.result.home + (leg2.result.away ?? 0);
  const aggL1Away = leg1.result.away + (leg2.result.home ?? 0);
  if (aggL1Home !== aggL1Away) return aggL1Home > aggL1Away ? leg1.homeTeamId : leg1.awayTeamId;
  if (leg2.result.penalties) {
    return leg2.result.penalties.home > leg2.result.penalties.away
      ? (leg2.homeTeamId ?? null)
      : (leg2.awayTeamId ?? null);
  }
  return null;
}

function BracketTie({
  leg1, leg2, teams, onSimulate, highlight = false,
}: {
  leg1: CompMatch;
  leg2?: CompMatch;
  teams: Record<string, Team>;
  onSimulate?: (matchId: string) => void;
  highlight?: boolean;
}) {
  const home = leg1.homeTeamId ? teams[leg1.homeTeamId] : null;
  const away = leg1.awayTeamId ? teams[leg1.awayTeamId] : null;
  const winnerId = tieWinnerId(leg1, leg2);
  const bothTbd = !leg1.homeTeamId && !leg1.awayTeamId;

  const canSimLeg1 = leg1.status === 'pending' && leg1.homeTeamId !== null && leg1.awayTeamId !== null;
  const canSimLeg2 = !!leg2 && leg1.status === 'completed' && leg2.status === 'pending';

  // scores affichés côté leg1-home / leg1-away
  const l1 = leg1.status === 'completed' ? leg1.result : undefined;
  const l2 = leg2?.status === 'completed' ? leg2.result : undefined;
  const showAgg = !!leg2 && (!!l1 || !!l2);
  const aggHome = (l1?.home ?? 0) + (l2?.away ?? 0);
  const aggAway = (l1?.away ?? 0) + (l2?.home ?? 0);
  // TAB du match décisif (finale sèche ou retour)
  const pens = leg2 ? l2?.penalties : l1?.penalties;
  const pensHome = leg2 ? pens?.away : pens?.home;
  const pensAway = leg2 ? pens?.home : pens?.away;

  return (
    <div
      className={`rounded-xl border bg-surface text-sm overflow-hidden ${
        highlight ? 'border-warning/50 shadow-lg'
        : winnerId ? 'border-border/50'
        : bothTbd ? 'border-border/40 opacity-70'
        : 'border-border'
      }`}
    >
      <BracketTeamRow
        team={home}
        tbd={leg1.homeTeamId === null}
        winner={!!winnerId && winnerId === leg1.homeTeamId}
        eliminated={!!winnerId && winnerId !== leg1.homeTeamId}
        scores={leg2 ? [l1?.home, l2?.away] : [l1?.home]}
        agg={showAgg ? aggHome : undefined}
        penalties={pensHome}
      />
      <div className="border-t border-border/40" />
      <BracketTeamRow
        team={away}
        tbd={leg1.awayTeamId === null}
        winner={!!winnerId && winnerId === leg1.awayTeamId}
        eliminated={!!winnerId && winnerId !== leg1.awayTeamId}
        scores={leg2 ? [l1?.away, l2?.home] : [l1?.away]}
        agg={showAgg ? aggAway : undefined}
        penalties={pensAway}
      />
      {onSimulate && (canSimLeg1 || canSimLeg2) && (
        <div className="flex gap-2 border-t border-border/40 px-3 py-1.5 bg-bg/40">
          {canSimLeg1 && (
            <button
              onClick={() => onSimulate(leg1.id)}
              className="text-xs font-medium text-accent hover:text-accent/70 transition-colors"
            >
              ▶ {leg2 ? 'Simuler aller' : 'Simuler'}
            </button>
          )}
          {canSimLeg2 && leg2 && (
            <button
              onClick={() => onSimulate(leg2.id)}
              className="text-xs font-medium text-accent hover:text-accent/70 transition-colors"
            >
              ▶ Simuler retour
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BracketTeamRow({
  team, tbd, winner, eliminated, scores, agg, penalties,
}: {
  team: Team | null;
  tbd: boolean;
  winner: boolean;
  eliminated: boolean;
  scores: (number | undefined)[];
  agg?: number;
  penalties?: number;
}) {
  const hasAnyScore = scores.some((s) => s !== undefined) || agg !== undefined;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 min-w-0 ${
      winner ? 'bg-accent/5' : ''
    } ${eliminated ? 'opacity-50' : ''}`}>
      {team?.flag ? (
        <img src={team.flag} alt="" className="h-5 w-5 object-cover rounded-sm shrink-0" />
      ) : (
        <div className="h-5 w-5 rounded-sm bg-border/60 shrink-0" />
      )}
      <span className={`truncate flex-1 text-[13px] ${winner ? 'font-semibold' : tbd ? 'text-muted italic' : ''}`}>
        {tbd ? 'À définir' : (team?.name ?? '?')}
      </span>
      {hasAnyScore && (
        <span className="flex items-center gap-1.5 shrink-0 tabular-nums">
          {scores.length > 1 && (
            <span className="text-[10px] text-muted">
              {scores.map((s) => s ?? '–').join(' · ')}
            </span>
          )}
          <span className={`text-sm ${winner ? 'font-bold text-accent' : 'text-muted'}`}>
            {agg !== undefined ? agg : (scores[0] ?? '–')}
          </span>
          {penalties !== undefined && (
            <span className="text-[10px] text-muted">({penalties})</span>
          )}
        </span>
      )}
    </div>
  );
}
