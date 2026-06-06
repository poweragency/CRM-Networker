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

      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="flex gap-4 overflow-hidden">
        {STAGE_ORDER.filter((s) => s !== 'iscrizione').map((stage, i) => (
          <div key={stage} className="w-72 shrink-0 space-y-2.5 sm:w-[19rem]">
            <Skeleton className="h-12 w-full rounded-xl" />
            <div className="space-y-2.5 rounded-xl bg-muted/25 p-2">
              {Array.from({ length: ((i % 3) + 1) }).map((_, j) => (
                <Skeleton key={j} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
