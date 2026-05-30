'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * CSS-driven tooltip (no Radix, no portal): wraps a trigger and reveals content
 * on hover/focus-within. Keyboard-accessible (focus shows it); the tooltip text
 * is exposed via `aria-describedby`. Use for terse hints only.
 */

export interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  children: React.ReactElement;
}

const sidePos: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export function Tooltip({
  content,
  side = 'top',
  className,
  children,
}: TooltipProps) {
  const id = React.useId();
  return (
    <span className="group relative inline-flex">
      {React.cloneElement(children, { 'aria-describedby': id } as Record<
        string,
        unknown
      >)}
      <span
        role="tooltip"
        id={id}
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs text-card-foreground shadow-md',
          'opacity-0 transition-opacity duration-150',
          'group-hover:opacity-100 group-focus-within:opacity-100',
          sidePos[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
