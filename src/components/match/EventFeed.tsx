import { memo } from 'react';
import type { MatchEvent } from '@/lib/sim/types';

const IMPORTANT_TYPES = new Set<MatchEvent['type']>(['goal', 'yellow', 'red', 'penalty', 'penalty_saved', 'penalty_miss']);

const BORDER_BY_TYPE: Partial<Record<MatchEvent['type'], string>> = {
  goal:          'border-l-accent',
  yellow:        'border-l-warning',
  red:           'border-l-danger',
  penalty:       'border-l-accent/80',
  penalty_saved: 'border-l-accent/60',
  penalty_miss:  'border-l-danger/60',
  save:          'border-l-accent/40',
  halftime:      'border-l-muted',
  fulltime:      'border-l-muted',
  extraTime:     'border-l-warning/60',
  injury:        'border-l-warning/80',
  coachRed:      'border-l-danger/70',
};

const BG_BY_TYPE: Partial<Record<MatchEvent['type'], string>> = {
  goal:    'bg-accent/8',
  yellow:  'bg-warning/6',
  red:     'bg-danger/8',
  injury:  'bg-warning/5',
};

// Ligne memoïsée + entrée animée en pur CSS (fs-event-in, globals.css) :
// l'ancien framer `layout` re-mesurait TOUTES les lignes à chaque tick (FLIP)
// et faisait saccader le direct — surtout au moment d'un but (ligne épinglée).
const EventRow = memo(function EventRow({ ev }: { ev: MatchEvent }) {
  const border = BORDER_BY_TYPE[ev.type] ?? 'border-l-border';
  const bg = BG_BY_TYPE[ev.type] ?? '';
  const isImportant = IMPORTANT_TYPES.has(ev.type);

  return (
    <div
      className={`fs-event-in border-l-2 ${border} ${bg} pl-3 py-1 rounded-r text-sm leading-snug ${isImportant ? 'font-medium' : 'text-muted/90'}`}
    >
      {ev.text}
    </div>
  );
});

function EventFeedInner({ events, full = false }: { events: MatchEvent[]; full?: boolean }) {
  const pinned = [...events].filter((ev) => IMPORTANT_TYPES.has(ev.type)).reverse();
  const others = [...events].filter((ev) => !IMPORTANT_TYPES.has(ev.type));
  // Mode complet (replay) : tout l'historique sans coupe ni limite de hauteur
  const recent = (full ? others : others.slice(-25)).reverse();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-subtle-sm">
      <h3 className="font-display text-sm uppercase tracking-widest text-muted">Événements</h3>

      {/* Épinglés : buts & cartons */}
      {pinned.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted/60">Moments clés</span>
          {pinned.map((ev) => <EventRow key={ev.id} ev={ev} />)}
        </div>
      )}

      {/* Séparateur si les deux sections présentes */}
      {pinned.length > 0 && recent.length > 0 && (
        <div className="border-t border-border/40" />
      )}

      {/* Flux normal — limité en live, intégral en replay */}
      <div className={`${full ? '' : 'max-h-64 overflow-y-auto'} flex flex-col gap-1.5`}>
        {recent.map((ev) => <EventRow key={ev.id} ev={ev} />)}
      </div>
    </div>
  );
}

// Re-render seulement quand un événement est ajouté (le flux est append-only).
export const EventFeed = memo(EventFeedInner, (prev, next) =>
  prev.full === next.full
  && prev.events.length === next.events.length
  && prev.events[prev.events.length - 1]?.id === next.events[next.events.length - 1]?.id,
);
