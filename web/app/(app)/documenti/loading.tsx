import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading UI for /documenti: a header placeholder over the two-pane
 * workspace (the category-grouped library sidebar + the reader/editor pane),
 * mirroring the real layout so the transition stays stable. Server component.
 */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        {/* Library sidebar */}
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 3 }).map((_, g) => (
            <div key={g} className="space-y-2 pt-2">
              <Skeleton className="h-3.5 w-24" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>

        {/* Reader/editor pane */}
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-4"
                style={{ width: `${70 + ((i * 13) % 28)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
