import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * RatingStars — a server-safe read-only 1–5 star display for a Lista contatti entry's
 * quality score. `value` of 0/null renders a muted em-dash so empty ratings stay
 * legible. The numeric value is exposed via `aria-label` (color is never the sole
 * signal). For the editable variant see {@link RatingStarsInput}.
 */
export interface RatingStarsProps {
  value: number | null | undefined;
  /** Total stars. default 5. */
  max?: number;
  size?: 'sm' | 'md';
  /** Accessible label, e.g. "3 su 5". */
  label?: string;
  className?: string;
}

const SIZE: Record<NonNullable<RatingStarsProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
};

export function RatingStars({
  value,
  max = 5,
  size = 'sm',
  label,
  className,
}: RatingStarsProps) {
  const v = value ?? 0;
  if (!v) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={label ?? `${v} su ${max}`}
    >
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < v;
        return (
          <Star
            key={i}
            className={cn(
              SIZE[size],
              filled
                ? 'fill-warning text-warning'
                : 'fill-transparent text-muted-foreground/40',
            )}
            aria-hidden
          />
        );
      })}
    </span>
  );
}
