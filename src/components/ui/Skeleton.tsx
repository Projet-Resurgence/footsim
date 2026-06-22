import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-border/60', className)} />
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <Skeleton className="h-4 w-2/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-1/2' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-2.5 w-1/5" />
      </div>
      <Skeleton className="h-6 w-12 shrink-0" />
    </div>
  );
}

export function SkeletonTeamCard() {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-6 w-16 shrink-0" />
    </div>
  );
}
