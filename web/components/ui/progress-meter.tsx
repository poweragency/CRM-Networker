import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * ProgressMeter — an "XP bar": a gradient fill with a sweeping sheen, so a
 * progress value reads like a game meter rather than a flat bar. Presentational
 * (no hooks) — usable from RSC or client. `value` is clamped to 0..100.
 */
export interface ProgressMeterProps {
  /** 0..100. */
  value: number;
  /** Gradient classes for the fill (default primary → info). */
  gradient?: string;
  /** Track height utility (default h-2). */
  heightClass?: string;
  className?: string;
}

export function ProgressMeter({
  value,
  gradient = 'from-primary to-info',
  heightClass = 'h-2',
  className,
}: ProgressMeterProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className={cn(
        'relative block w-full overflow-hidden rounded-full bg-muted',
        heightClass,
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        className={cn(
          'relative block h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-emphasized',
          gradient,
        )}
        style={{ width: `${pct}%` }}
      >
        {/* sweeping sheen — reads as "active/charging" */}
        {pct > 0 && (
          <span className="absolute inset-0 -skew-x-12 animate-sheen bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        )}
      </span>
    </span>
  );
}
