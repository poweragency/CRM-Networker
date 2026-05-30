import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Loading skeleton for the genealogy canvas (Suspense fallback + lazy-mount
 * placeholder). Mirrors the real layout: a toolbar row, the summary strip and a
 * mock binary fan of node cards so the shell doesn't reflow when data arrives.
 */
export function GenealogySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)} aria-hidden>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full sm:w-72" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>

      {/* Canvas with a faux binary fan */}
      <div className="relative h-[560px] overflow-hidden rounded-xl border bg-muted/20">
        <div className="flex flex-col items-center gap-10 pt-12">
          <Skeleton className="h-[150px] w-[248px] rounded-xl" />
          <div className="flex gap-12">
            <Skeleton className="h-[150px] w-[248px] rounded-xl" />
            <Skeleton className="h-[150px] w-[248px] rounded-xl" />
          </div>
          <div className="flex gap-8">
            <Skeleton className="h-[150px] w-[248px] rounded-xl opacity-70" />
            <Skeleton className="h-[150px] w-[248px] rounded-xl opacity-70" />
            <Skeleton className="h-[150px] w-[248px] rounded-xl opacity-70" />
            <Skeleton className="h-[150px] w-[248px] rounded-xl opacity-70" />
          </div>
        </div>
      </div>
    </div>
  );
}
