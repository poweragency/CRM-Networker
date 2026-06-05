import { Skeleton } from '@/components/ui/skeleton';

/** Org settings preview: title + Call/Ruoli/Tema cards. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80 max-w-[80%]" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-56 w-full rounded-xl" />
      ))}
    </div>
  );
}
