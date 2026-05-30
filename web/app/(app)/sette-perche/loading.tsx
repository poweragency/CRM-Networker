import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading UI for /sette-perche: a header placeholder, the hero
 * "my whys" card and a grid of roster-card skeletons, mirroring the real layout
 * so the transition stays stable. Server component (no hooks).
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Hero card */}
      <Skeleton className="h-28 w-full rounded-xl" />

      {/* Team grid */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
