import { Skeleton } from '@/components/ui/skeleton';
import { STAGE_ORDER } from '@/lib/types/db';

/**
 * Route-level loading UI for the prospect board: a header placeholder plus six
 * column skeletons that mirror the kanban layout, so the transition into
 * /percorso-prospect stays stable. Server component (no hooks).
 */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="flex gap-3 overflow-hidden">
        {STAGE_ORDER.map((stage, i) => (
          <div key={stage} className="w-72 shrink-0 space-y-2 sm:w-[19rem]">
            <Skeleton className="h-14 w-full rounded-lg" />
            <div className="space-y-2 rounded-lg bg-muted/20 p-1.5">
              {Array.from({ length: ((i % 3) + 1) }).map((_, j) => (
                <Skeleton key={j} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
