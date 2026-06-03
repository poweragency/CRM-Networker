'use client';

import * as React from 'react';
import { Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * RatingStarsInput — an accessible, keyboard-operable 1–5 star picker used in the
 * Lista contatti form. Controlled via `value` (0 = no rating) / `onChange`. Hover previews
 * the would-be value; a small "clear" affordance resets to 0. Implemented as a
 * radiogroup so screen readers and arrow keys work.
 */
export interface RatingStarsInputProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  /** Accessible group label. */
  'aria-label'?: string;
  className?: string;
}

export function RatingStarsInput({
  value,
  onChange,
  max = 5,
  'aria-label': ariaLabel,
  className,
}: RatingStarsInputProps) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(max, value + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(0, value - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: max }).map((_, i) => {
        const starValue = i + 1;
        const active = starValue <= shown;
        return (
          <button
            key={starValue}
            type="button"
            role="radio"
            aria-checked={value === starValue}
            aria-label={`${starValue}`}
            tabIndex={value === starValue || (value === 0 && starValue === 1) ? 0 : -1}
            onClick={() => onChange(value === starValue ? starValue - 1 : starValue)}
            onMouseEnter={() => setHover(starValue)}
            onFocus={() => setHover(starValue)}
            onBlur={() => setHover(null)}
            className="rounded-sm p-0.5 text-warning transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={cn(
                'h-6 w-6',
                active
                  ? 'fill-warning text-warning'
                  : 'fill-transparent text-muted-foreground/40',
              )}
              aria-hidden
            />
          </button>
        );
      })}
      {value > 0 && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Rimuovi valutazione"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}
