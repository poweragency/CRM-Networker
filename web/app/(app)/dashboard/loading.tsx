import { Skeleton } from '@/components/ui/skeleton';

/** Dashboard preview: hero banner + spotlight row + leaderboard cards. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-8" aria-busy="true">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.4]" aria-hidden />
        <div className="relative flex items-center justify-between gap-4 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-64 rounded-lg" />
              <Skeleton className="h-4 w-80 rounded-md" />
            </div>
          </div>
          <Skeleton className="hidden h-8 w-28 rounded-full sm:block" />
        </div>
      </div>

      {/* Tier 1 — Spotlight */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-card"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-32 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Tier 2 — Leaderboards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col rounded-xl border border-border/80 bg-card shadow-card"
          >
            <div className="flex items-start gap-3 border-b border-border/70 p-5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-3 w-40 rounded-md" />
              </div>
            </div>
            <div className="flex flex-col gap-3 p-3">
              {/* Champion row */}
              <Skeleton className="h-16 w-full rounded-lg" />
              {/* Challenger rows */}
              <div className="space-y-2 px-2">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="flex items-center gap-3 py-1">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                    <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                    <Skeleton className="h-3 flex-1 rounded-md" />
                    <Skeleton className="h-4 w-10 shrink-0 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
