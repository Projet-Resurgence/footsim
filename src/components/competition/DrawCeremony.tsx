import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { CONTINENT_LABEL } from '@/lib/types';
import type { Team } from '@/lib/types';
import type { DrawResult, Pot, PotMethod, KnockoutDrawMethod } from '@/lib/competition/draw';
import {
  POT_COLORS, POT_METHOD_LABEL, POT_METHOD_DESC,
  KNOCKOUT_METHOD_LABEL, KNOCKOUT_METHOD_DESC, teamContinentsOf,
} from '@/lib/competition/draw';

type Props = {
  teams: Team[];
  groupCount: number;
  pots: Pot[];
  /** Conduct the draw from the (possibly edited) pots. Called when the ceremony starts. */
  conduct: (pots: Pot[]) => DrawResult;
  onConfirm: (groups: Record<string, string[]>) => void;
  knockoutMode?: boolean;
  /** Enables drag & drop between pots */
  onPotsChange?: (pots: Pot[]) => void;
  potMethod?: PotMethod;
  onPotMethodChange?: (m: PotMethod) => void;
  cmfLoading?: boolean;
  avoidSameContinent?: boolean;
  onAvoidSameContinentChange?: (v: boolean) => void;
  koMethod?: KnockoutDrawMethod;
  onKoMethodChange?: (m: KnockoutDrawMethod) => void;
  /** Custom pot titles (knockout: 1ers, 2es, meilleurs 3es…) */
  potLabel?: (potNumber: number) => string;
};

const GROUP_NAMES = 'ABCDEFGHIJKLMNOP'.split('');

export function DrawCeremony({
  teams, pots, conduct, onConfirm, knockoutMode = false,
  onPotsChange, potMethod, onPotMethodChange, cmfLoading,
  avoidSameContinent, onAvoidSameContinentChange,
  koMethod, onKoMethodChange, potLabel,
}: Props) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const [phase, setPhase] = useState<'pots' | 'draw'>('pots');
  const [result, setResult] = useState<DrawResult | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [dragOverPot, setDragOverPot] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const editable = !!onPotsChange;
  const labelOfPot = (n: number) => potLabel?.(n) ?? `Chapeau ${n}`;

  function moveTeam(teamId: string, toPot: number) {
    if (!onPotsChange) return;
    const next = pots.map((p) => ({ ...p, teamIds: p.teamIds.filter((t) => t !== teamId) }));
    const target = next.find((p) => p.number === toPot);
    if (target) target.teamIds.push(teamId);
    setSelectedTeam(null);
    onPotsChange(next);
  }

  function startDraw() {
    setResult(conduct(pots));
    setRevealed(new Set());
    setIdx(0);
    setDone(false);
    setCurrent(null);
    setPhase('draw');
  }

  function revealNext() {
    if (!result) return;
    if (idx >= result.order.length) {
      setDone(true);
      setCurrent(null);
      return;
    }
    const teamId = result.order[idx];
    setCurrent(teamId);
    setIdx((i) => i + 1);
    timerRef.current = setTimeout(() => {
      setRevealed((prev) => new Set([...prev, teamId]));
      setCurrent(null);
    }, 1400);
  }

  function revealAll() {
    if (!result) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    let i = idx;
    function step() {
      if (!result) return;
      if (i >= result.order.length) {
        setDone(true);
        setCurrent(null);
        return;
      }
      const teamId = result.order[i];
      i++;
      setCurrent(teamId);
      setIdx(i);
      timerRef.current = setTimeout(() => {
        setRevealed((prev) => new Set([...prev, teamId]));
        setCurrent(null);
        timerRef.current = setTimeout(step, 300);
      }, 900);
    }
    step();
  }

  const potOfTeam = (teamId: string): Pot | undefined =>
    (result?.pots ?? pots).find((p) => p.teamIds.includes(teamId));

  // ─── Phase 1 : chapeaux ───────────────────────────────────────────────────
  if (phase === 'pots') {
    const sizes = pots.map((p) => p.teamIds.length);
    const uneven = !knockoutMode && Math.max(...sizes) - Math.min(...sizes) > 1;

    return (
      <div className="space-y-5">
        {/* Options */}
        <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
          <div className="text-xs uppercase tracking-widest text-muted">Options du tirage</div>

          {onPotMethodChange && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(POT_METHOD_LABEL) as PotMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onPotMethodChange(m)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      potMethod === m
                        ? 'border-accent bg-accent/10 text-accent font-medium'
                        : 'border-border text-muted hover:text-text'
                    }`}
                  >
                    {POT_METHOD_LABEL[m]}
                    {m === 'cmf' && cmfLoading && <Spinner className="ml-1.5 inline-block h-3 w-3" />}
                  </button>
                ))}
              </div>
              {potMethod && <p className="text-xs text-muted">{POT_METHOD_DESC[potMethod]}</p>}
            </div>
          )}

          {onKoMethodChange && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(KNOCKOUT_METHOD_LABEL) as KnockoutDrawMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onKoMethodChange(m)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      koMethod === m
                        ? 'border-accent bg-accent/10 text-accent font-medium'
                        : 'border-border text-muted hover:text-text'
                    }`}
                  >
                    {KNOCKOUT_METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              {koMethod && <p className="text-xs text-muted">{KNOCKOUT_METHOD_DESC[koMethod]}</p>}
            </div>
          )}

          {onAvoidSameContinentChange && (
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!avoidSameContinent}
                onChange={(e) => onAvoidSameContinentChange(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span>
                Éviter deux équipes du même continent par groupe
                <span className="block text-xs text-muted">Contrainte appliquée au mieux pendant le tirage.</span>
              </span>
            </label>
          )}

          {editable && (
            <p className="text-xs text-muted border-t border-border/50 pt-3">
              ✋ Glisse-dépose une équipe d'un chapeau à l'autre — ou touche une équipe puis
              « Déplacer ici » sur le chapeau de destination.
            </p>
          )}
        </div>

        {uneven && (
          <p className="text-xs text-warning">
            ⚠ Les chapeaux sont déséquilibrés ({sizes.join(' / ')}) — certains groupes recevront
            plusieurs équipes du même chapeau.
          </p>
        )}

        {/* Pots */}
        <div className="grid gap-4 sm:grid-cols-2">
          {pots.map((p) => (
            <div
              key={p.number}
              onDragOver={editable ? (e) => { e.preventDefault(); setDragOverPot(p.number); } : undefined}
              onDragLeave={editable ? () => setDragOverPot((v) => (v === p.number ? null : v)) : undefined}
              onDrop={editable ? (e) => {
                e.preventDefault();
                setDragOverPot(null);
                const tid = e.dataTransfer.getData('text/footsim-team');
                if (tid) moveTeam(tid, p.number);
              } : undefined}
              className={`rounded-lg border bg-surface p-4 space-y-3 transition-colors ${
                dragOverPot === p.number ? 'border-accent bg-accent/5' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: POT_COLORS[p.number] }} />
                <span className="font-semibold text-sm">{labelOfPot(p.number)}</span>
                <span className="ml-auto text-xs text-muted tabular-nums">{p.teamIds.length}</span>
              </div>
              <div className="space-y-1">
                {p.teamIds.map((tid) => {
                  const t = teamMap.get(tid);
                  const conts = teamContinentsOf(t);
                  const isSelected = selectedTeam === tid;
                  return (
                    <div
                      key={tid}
                      draggable={editable}
                      onDragStart={editable ? (e) => {
                        e.dataTransfer.setData('text/footsim-team', tid);
                        e.dataTransfer.effectAllowed = 'move';
                      } : undefined}
                      onClick={editable ? () => setSelectedTeam(isSelected ? null : tid) : undefined}
                      className={`flex items-center gap-2 text-sm rounded px-1.5 py-1 -mx-1.5 transition-colors ${
                        editable ? 'cursor-grab active:cursor-grabbing touch-manipulation' : ''
                      } ${isSelected ? 'ring-1 ring-accent bg-accent/10' : editable ? 'hover:bg-border/20' : ''}`}
                    >
                      {t?.flag && <img src={t.flag} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0 pointer-events-none" />}
                      <span className="truncate">{t?.name ?? tid}</span>
                      {conts[0] && (
                        <span className="hidden sm:inline text-[9px] uppercase tracking-wide text-muted/70 border border-border rounded px-1 shrink-0">
                          {CONTINENT_LABEL[conts[0]]}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted tabular-nums shrink-0">{t?.globalStrength}</span>
                    </div>
                  );
                })}
                {selectedTeam && !p.teamIds.includes(selectedTeam) && (
                  <button
                    type="button"
                    onClick={() => moveTeam(selectedTeam, p.number)}
                    className="w-full rounded border border-dashed border-accent/50 bg-accent/5 px-2 py-1.5 text-xs text-accent hover:bg-accent/10 transition-colors"
                  >
                    ↳ Déplacer {teamMap.get(selectedTeam)?.name ?? ''} ici
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={startDraw} size="lg" disabled={cmfLoading}>Lancer le tirage au sort</Button>
      </div>
    );
  }

  // ─── Phase 2 : tirage ─────────────────────────────────────────────────────
  if (!result) return null;
  const groupKeys = Object.keys(result.groups).sort();
  const groupOfTeam = (teamId: string): number =>
    groupKeys.findIndex((k) => result.groups[k].includes(teamId));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => { if (timerRef.current) clearTimeout(timerRef.current); setPhase('pots'); }}
          className="text-xs text-muted hover:text-text transition-colors"
        >
          ← Chapeaux
        </button>
        {/* Pot legend */}
        {result.pots.map((p) => (
          <div key={p.number} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: POT_COLORS[p.number] }}
            />
            {labelOfPot(p.number)}
          </div>
        ))}
      </div>

      {/* Suspense reveal ball */}
      <AnimatePresence>
        {current && (
          <motion.div
            key={current}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-lg"
          >
            {(() => {
              const t = teamMap.get(current);
              const pot = potOfTeam(current);
              const gIdx = groupOfTeam(current);
              return (
                <>
                  {t?.flag && <img src={t.flag} alt="" className="h-12 w-12 rounded object-cover" />}
                  <div className="min-w-0">
                    <div className="font-display text-xl sm:text-2xl truncate">{t?.name ?? current}</div>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      {pot && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: POT_COLORS[pot.number] }}
                        />
                      )}
                      {pot && labelOfPot(pot.number)}
                      {gIdx >= 0 && ` → ${knockoutMode ? `Match ${gIdx + 1}` : `Groupe ${GROUP_NAMES[gIdx]}`}`}
                    </div>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Groups / pairs grid */}
      <div className={`grid gap-3 sm:gap-4 ${
        knockoutMode
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      }`}>
        {groupKeys.map((gKey, gi) => {
          const isBye = knockoutMode && result.groups[gKey].length === 1;
          return (
            <div key={gKey} className="rounded-lg border border-border bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted">
                <span>{knockoutMode ? `Match ${gi + 1}` : `Groupe ${GROUP_NAMES[gi]}`}</span>
                {isBye && <span className="text-[9px] rounded border border-border px-1 normal-case tracking-normal">Exempt</span>}
              </div>
              <div className="space-y-1">
                {result.groups[gKey].map((tid) => {
                  const t = teamMap.get(tid);
                  const pot = potOfTeam(tid);
                  const isRevealed = revealed.has(tid);
                  const isCurrent = current === tid;
                  return (
                    <div
                      key={tid}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                        isCurrent ? 'ring-1 ring-accent bg-accent/10' : ''
                      }`}
                    >
                      <span
                        className="shrink-0 h-2 w-2 rounded-full"
                        style={{ background: pot ? POT_COLORS[pot.number] : 'transparent' }}
                      />
                      {isRevealed ? (
                        <>
                          {t?.flag && (
                            <img src={t.flag} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" />
                          )}
                          <span className="truncate">{t?.name ?? tid}</span>
                          <span className="ml-auto text-xs text-muted tabular-nums">{t?.globalStrength}</span>
                        </>
                      ) : (
                        <span className="text-muted italic">
                          {isCurrent ? '…' : '—'}
                        </span>
                      )}
                    </div>
                  );
                })}
                {isBye && revealed.has(result.groups[gKey][0]) && (
                  <div className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted italic">
                    <span className="shrink-0 h-2 w-2 rounded-full" />
                    Qualifié d'office
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap sticky bottom-3 z-10">
        {!done && (
          <>
            <Button onClick={revealNext} disabled={!!current} size="lg" className="shadow-lg">
              {idx === 0 ? 'Commencer le tirage' : `Tirer (${idx}/${result.order.length})`}
            </Button>
            <Button onClick={revealAll} variant="ghost" size="lg" disabled={!!current} className="bg-surface shadow-lg">
              ⚡ Tirage automatique
            </Button>
          </>
        )}
        {done && (
          <Button onClick={() => onConfirm(result.groups)} size="lg" className="shadow-lg">
            {knockoutMode ? 'Confirmer le tirage' : 'Confirmer et créer la compétition'}
          </Button>
        )}
      </div>

      {/* Pots reference */}
      <div className="border-t border-border pt-4 space-y-3">
        <div className="text-xs uppercase tracking-widest text-muted">Chapeaux</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {result.pots.map((p) => (
            <div key={p.number} className="rounded-lg border border-border bg-surface p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: POT_COLORS[p.number] }} />
                <span className="text-xs font-semibold">{labelOfPot(p.number)}</span>
              </div>
              <div className="space-y-1">
                {p.teamIds.map((tid) => {
                  const t = teamMap.get(tid);
                  const isRevealed = revealed.has(tid);
                  return (
                    <div key={tid} className={`flex items-center gap-2 text-xs ${isRevealed ? 'opacity-40' : ''}`}>
                      {t?.flag && <img src={t.flag} alt="" className="h-4 w-4 rounded-sm object-cover shrink-0" />}
                      <span className="truncate">{t?.name ?? tid}</span>
                      <span className="ml-auto text-muted tabular-nums">{t?.globalStrength}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
