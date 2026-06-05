import { Skeleton } from '@/components/ui/skeleton';

/** Statistiche preview: summary stat cards + roster table rows. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-4" aria-busy="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-5 w-40" />
      <div className="space-y-2 rounded-xl border p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
