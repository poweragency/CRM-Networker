import { Skeleton } from '@/components/ui/skeleton';

/** Member profile preview: hero masthead + files + sections. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-5" aria-busy="true">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
