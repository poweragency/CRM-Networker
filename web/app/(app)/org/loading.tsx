import { Skeleton } from '@/components/ui/skeleton';

/** Org settings preview: title + Call/Ruoli/Tema cards. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-6" aria-busy="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-[80%]" />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-56 w-full rounded-xl" />
      ))}
    </div>
  );
}
