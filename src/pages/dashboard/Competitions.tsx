import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useCompetition } from '@/stores/competition';
import { useSession } from '@/stores/session';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { FORMAT_LABEL, COMPETITION_KIND_LABEL } from '@/lib/competition/types';
import type { CompetitionSummary, CompetitionKind } from '@/lib/competition/types';

const STATUS_LABEL: Record<string, string> = {
  setup: 'Configuration',
  ongoing: 'En cours',
  completed: 'Terminée',
};

const STATUS_COLOR: Record<string, string> = {
  setup: 'text-muted',
  ongoing: 'text-accent',
  completed: 'text-warning',
};

export default function Competitions() {
  const summaries = useCompetition((s) => s.summaries);
  const loading = useCompetition((s) => s.loading);
  const refresh = useCompetition((s) => s.refresh);
  const { prApiToken } = useBackendArgs();
  const isAdmin = useSession((s) => s.isAdmin());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'setup' | 'ongoing' | 'completed'>('all');
  const [kindFilter, setKindFilter] = useState<'all' | CompetitionKind>('all');

  useEffect(() => {
    refresh('', prApiToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prApiToken]);

  const filtered = summaries.filter((s) => {
    const matchSearch = !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchKind = kindFilter === 'all' || (s.kind ?? 'officielle') === kindFilter;
    return matchSearch && matchStatus && matchKind;
  });

  // Separate into official vs friendly
  const officielles = filtered.filter((s) => (s.kind ?? 'officielle') === 'officielle');
  const amicales = filtered.filter((s) => s.kind === 'amicale');

  function groupByYear(list: CompetitionSummary[]) {
    const map = list.reduce<Record<string, CompetitionSummary[]>>((acc, s) => {
      const year = s.year != null ? String(s.year) : new Date(s.createdAt).getFullYear().toString();
      (acc[year] = acc[year] ?? []).push(s);
      return acc;
    }, {});
    return { byYear: map, years: Object.keys(map).sort((a, b) => Number(b) - Number(a)) };
  }

  const filtersBar = (
    <div className="flex flex-wrap gap-2 items-center">
      <Input
        className="h-8 w-48 text-xs"
        placeholder="Rechercher une compétition…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {(['all', 'ongoing', 'setup', 'completed'] as const).map((s) => (
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${statusFilter === s ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-text'}`}
        >
          {s === 'all' ? 'Tous' : STATUS_LABEL[s]}
        </button>
      ))}
      <div className="w-px h-4 bg-border mx-1" />
      {(['all', 'officielle', 'amicale'] as const).map((k) => (
        <button
          key={k}
          onClick={() => setKindFilter(k)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${kindFilter === k ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-text'}`}
        >
          {k === 'all' ? 'Officielle + Amicale' : COMPETITION_KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );

  function renderKindSection(list: CompetitionSummary[], label: string) {
    if (list.length === 0) return null;
    const { byYear, years } = groupByYear(list);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text">{label}</span>
          <div className="flex-1 border-t border-border" />
          <span className="text-xs text-muted">{list.length}</span>
        </div>
        <div className="space-y-6">
          {years.map((year) => (
            <div key={year}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold text-muted uppercase tracking-widest">{year}</span>
                <div className="flex-1 border-t border-border/50" />
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {byYear[year].map((s) => (
                  <CompetitionCard key={s.id} summary={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const groupedGrid = filtered.length === 0 ? (
    <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
      Aucune compétition trouvée.
    </div>
  ) : (
    <div className="space-y-10">
      {renderKindSection(officielles, 'Compétitions officielles')}
      {renderKindSection(amicales, 'Compétitions amicales')}
    </div>
  );

  if (!isAdmin) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="mb-1 font-display text-4xl">Compétitions</h1>
          <p className="text-muted">Ligues, coupes, tournois administrés par l'organisateur.</p>
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : summaries.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
            Aucune compétition en cours.
          </div>
        ) : (
          <>
            {filtersBar}
            {groupedGrid}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-1 font-display text-4xl">Compétitions</h1>
          <p className="text-muted">Ligues, coupes, tournois à groupes.</p>
        </div>
        <Link to="/dashboard/competitions/new">
          <Button>Créer une compétition</Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      ) : summaries.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
          Aucune compétition.{' '}
          <Link to="/dashboard/competitions/new" className="text-accent underline">Créer la première</Link>.
        </div>
      ) : (
        <>
          {filtersBar}
          {groupedGrid}
        </>
      )}
    </div>
  );
}

function CompetitionCard({ summary }: { summary: CompetitionSummary }) {
  const isAmicale = summary.kind === 'amicale';
  return (
    <Link to={`/dashboard/competitions/${summary.id}`} className="block">
      <div className="rounded-lg border border-border bg-surface p-5 hover:border-accent/50 transition-colors space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-display text-xl truncate">{summary.name}</div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-xs ${STATUS_COLOR[summary.status]}`}>
              {STATUS_LABEL[summary.status]}
            </span>
            {isAmicale && (
              <span className="text-xs text-muted border border-border rounded px-1.5 py-0.5">Amicale</span>
            )}
          </div>
        </div>
        <div className="text-sm text-muted">{FORMAT_LABEL[summary.format]}</div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{summary.teamCount} équipes</span>
          <span>{new Date(summary.createdAt).toLocaleDateString('fr-FR')}</span>
        </div>
        {summary.winner && (
          <div className="text-xs text-accent">🏆 Vainqueur enregistré</div>
        )}
      </div>
    </Link>
  );
}
