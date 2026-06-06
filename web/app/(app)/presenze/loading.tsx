import { Skeleton } from '@/components/ui/skeleton';

/**
 * Presenze preview: page header + frosted day navigator, the full-width overview
 * gauge and per-call challenge cards with member cells.
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

      {/* full-width overview gauge */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-xl border p-5">
        <Skeleton className="h-[104px] w-[104px] rounded-full" />
        <Skeleton className="h-8 w-24" />
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Skeleton className="h-12 w-36 rounded-lg" />
          <Skeleton className="h-12 w-36 rounded-lg" />
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
