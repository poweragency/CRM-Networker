import { Skeleton } from '@/components/ui/skeleton';

/**
 * Instant navigation preview (Next.js loading UI). Shown in the content area —
 * the shell (sidebar/topbar) stays mounted — while the real RSC page streams in,
 * so a click feels immediate even if the page's data fetch takes a moment.
 */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-6" aria-busy="true" aria-live="polite">
      {/* Title block */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-[80%]" />
      </div>

      {/* Stat / card row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>

      {/* Main content block */}
      <Skeleton className="h-[22rem] w-full rounded-xl" />
    </div>
  );
}
