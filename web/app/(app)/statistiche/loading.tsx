import { Skeleton } from '@/components/ui/skeleton';

/** Statistiche preview: page header + KPI summary cards + roster table rows. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-5 w-40" />
      <div className="space-y-2 rounded-xl border p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
