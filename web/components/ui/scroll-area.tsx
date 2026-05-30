import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight scroll container (no Radix). Uses native overflow with a styled,
 * thin scrollbar utility. `orientation` controls which axis scrolls.
 */
export interface ScrollAreaProps
  extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal' | 'both';
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, orientation = 'vertical', children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative',
        orientation === 'vertical' && 'overflow-y-auto',
        orientation === 'horizontal' && 'overflow-x-auto',
        orientation === 'both' && 'overflow-auto',
        // thin, theme-aware scrollbar
        '[scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]',
        '[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2',
        '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border',
        '[&::-webkit-scrollbar-track]:bg-transparent',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
ScrollArea.displayName = 'ScrollArea';
