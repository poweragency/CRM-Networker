import { Skeleton } from '@/components/ui/skeleton';

/**
 * Presenze preview: page header + frosted day navigator, the overview hero row
 * (aggregate gauge + leaderboard) and per-call challenge cards with member cells.
 */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-5" aria-busy="true">
      {/* header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-6 w-44" />
        </div>
        <Skeleton className="h-4 w-80" />
      </div>

      {/* day navigator */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5">
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="ml-auto h-9 w-40 rounded-md" />
      </div>

      {/* overview hero row */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex items-center gap-5 rounded-xl border p-5">
          <Skeleton className="h-[104px] w-[104px] rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-24" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="space-y-2 rounded-xl border p-4">
          <Skeleton className="h-6 w-20" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* per-call cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-xl border">
          <div className="flex items-center gap-4 border-b p-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-2 w-full max-w-md rounded-full" />
            </div>
            <Skeleton className="h-16 w-16 rounded-full" />
          </div>
          <div className="grid gap-2 p-4 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-[72px] rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
