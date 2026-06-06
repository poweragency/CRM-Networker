'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * CountUp — animates a number from 0 to `value` on mount (and whenever `value`
 * changes), easing out so stats land like a score tally. `format` controls the
 * rendered text each frame (e.g. formatNumber / formatPercent); without it the
 * raw number is shown with `decimals`. Honors prefers-reduced-motion by jumping
 * straight to the final value. Client island — drop it inside any RSC.
 */
export interface CountUpProps {
  value: number;
  /** Animation length in ms (default 900). */
  duration?: number;
  /** Decimals when no `format` is given (default 0). */
  decimals?: number;
  /** Custom per-frame formatter; receives the in-progress number. */
  format?: (n: number) => string;
  className?: string;
}

export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  format,
  className,
}: CountUpProps) {
  const [n, setN] = React.useState(0);
  const frame = React.useRef<number | undefined>(undefined);
  const nRef = React.useRef(0);
  nRef.current = n;

  React.useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || duration <= 0) {
      setN(value);
      return;
    }
    const start = performance.now();
    const from = nRef.current; // count up from wherever we are (smooth on re-targets)
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // easeOutExpo — fast take-off, long graceful settle so the number "lands".
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(from + (value - from) * eased);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, duration]);

  const text = format ? format(n) : n.toFixed(decimals);
  return <span className={cn('tabular-nums', className)}>{text}</span>;
}
