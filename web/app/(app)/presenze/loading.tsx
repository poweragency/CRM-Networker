import { Skeleton } from '@/components/ui/skeleton';

/** Presenze preview: day navigator + per-call grids of member cells. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-4" aria-busy="true">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="ml-auto h-9 w-40 rounded-md" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-16 rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
