import * as React from 'react';
import { cn } from '@/lib/utils';

/** Loading placeholder. Use to size-match the content it stands in for. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
