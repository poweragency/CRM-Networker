import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * WhyProgress — a compact "X of 7" indicator. Two shapes:
 *  - `ring` (default): an SVG donut whose arc fills with completion, with the
 *    count centered — used on roster cards / headers.
 *  - `bar`: a thin segmented track of 7 ticks — used in dense rows.
 *
 * Server-safe (no hooks). Tone shifts cold → warm → complete as the record
 * fills, mirroring the genealogy activity palette via design tokens.
 */
export interface WhyProgressProps {
  /** 0..7 filled slots. */
  filled: number;
  total?: number;
  variant?: 'ring' | 'bar';
  size?: number;
  className?: string;
}

function toneFor(ratio: number): string {
  if (ratio >= 1) return 'text-success';
  if (ratio >= 0.5) return 'text-primary';
  if (ratio > 0) return 'text-warning';
  return 'text-muted-foreground';
}

export function WhyProgress({
  filled,
  total = 7,
  variant = 'ring',
  size = 44,
  className,
}: WhyProgressProps) {
  const clamped = Math.max(0, Math.min(filled, total));
  const ratio = total > 0 ? clamped / total : 0;
  const tone = toneFor(ratio);

  if (variant === 'bar') {
    return (
      <div
        className={cn('flex items-center gap-2', className)}
        role="img"
        aria-label={`${clamped} di ${total} compilati`}
      >
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-4 rounded-full transition-colors',
                i < clamped ? cn('bg-current', tone) : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {clamped}/{total}
        </span>
      </div>
    );
  }

  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * ratio;

  return (
    <div
      className={cn('relative shrink-0', tone, className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped} di ${total} compilati`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="stroke-current transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-foreground">
        {clamped}
        <span className="text-[10px] font-normal text-muted-foreground">
          /{total}
        </span>
      </span>
    </div>
  );
}
