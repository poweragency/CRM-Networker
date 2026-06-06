import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Loading placeholder with a premium left-to-right shimmer sweep. Size-match the
 * content it stands in for. The shimmer overlay is purely decorative; falls back
 * to a static muted block under prefers-reduced-motion (animation is disabled).
 */
export function Skeleton({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-md bg-muted/70',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full animate-sheen bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
      />
      {children}
    </div>
  );
}
