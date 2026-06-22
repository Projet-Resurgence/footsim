import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useCompetition } from '@/stores/competition';
import { useCredentials } from '@/stores/credentials';
import { useSession } from '@/stores/session';
import { FORMAT_LABEL } from '@/lib/competition/types';
import type { CompetitionSummary } from '@/lib/competition/types';

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
  const pat = useCredentials((s) => s.githubPat);
  const isAdmin = useSession((s) => s.isAdmin());

  useEffect(() => {
    if (pat && summaries.length === 0) refresh(pat);
  }, [pat, refresh, summaries.length]);

  if (!isAdmin) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="mb-1 font-display text-4xl">Compétitions</h1>
          <p className="text-muted">Ligues, coupes, tournois administrés par l'organisateur.</p>
        </div>
        {!pat ? (
          <p className="text-muted text-sm">Les compétitions sont gérées par l'administrateur.</p>
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : summaries.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
            Aucune compétition en cours.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summaries.map((s) => (
              <CompetitionCard key={s.id} summary={s} />
            ))}
          </div>
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

      {!pat ? (
        <p className="text-muted">
          Configure ton token GitHub dans{' '}
          <Link to="/dashboard/settings" className="text-accent underline">Réglages</Link>.
        </p>
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      ) : summaries.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
          Aucune compétition.{' '}
          <Link to="/dashboard/competitions/new" className="text-accent underline">Créer la première</Link>.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => (
            <CompetitionCard key={s.id} summary={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitionCard({ summary }: { summary: CompetitionSummary }) {
  return (
    <Link to={`/dashboard/competitions/${summary.id}`} className="block">
      <div className="rounded-lg border border-border bg-surface p-5 hover:border-accent/50 transition-colors space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-display text-xl truncate">{summary.name}</div>
          <span className={`text-xs shrink-0 ${STATUS_COLOR[summary.status]}`}>
            {STATUS_LABEL[summary.status]}
          </span>
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
