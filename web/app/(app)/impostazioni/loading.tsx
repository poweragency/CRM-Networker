import { Skeleton } from '@/components/ui/skeleton';

/** Profile preview: hero masthead + files + sections. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-5" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mx-auto h-10 w-60 rounded-md" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
