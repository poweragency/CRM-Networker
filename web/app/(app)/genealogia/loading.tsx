import { Skeleton } from '@/components/ui/skeleton';

/** Binary Viewer preview: the full-height canvas. */
export default function Loading() {
  return (
    <div className="animate-fade-in space-y-3" aria-busy="true">
      <Skeleton className="h-[calc(100vh-8rem)] min-h-[520px] w-full rounded-xl ring-1 ring-black/5" />
    </div>
  );
}
