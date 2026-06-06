import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * CompletionRing — a premium SVG donut that reads the attendance rate of a single
 * Zoom call as a "challenge gauge". The arc fills with completion and its tone
 * ramps cold → primary → success → GOLD, so a fully-attended (100%) call turns
 * gold and glows. The center stacks the live `present/total` count over the percentage.
 *
 * Server-safe (no hooks); token-only strokes so it tracks light & dark.
 */
export interface CompletionRingProps {
  /** People present on the call. */
  present: number;
  /** Team size for this call. */
  total: number;
  /** Outer diameter in px (default 72). */
  size?: number;
  /** Stroke width in px (default 7). */
  stroke?: number;
  className?: string;
}

/** Tone ramp mirroring the gamified palette: cold → accent → success → GOLD (100%). */
function toneFor(ratio: number): { arc: string; text: string } {
  if (ratio >= 1) return { arc: 'text-warning', text: 'text-warning' };
  if (ratio >= 0.75) return { arc: 'text-success', text: 'text-success' };
  if (ratio >= 0.4) return { arc: 'text-primary', text: 'text-foreground' };
  if (ratio > 0) return { arc: 'text-info', text: 'text-foreground' };
  return { arc: 'text-muted-foreground/40', text: 'text-muted-foreground' };
}

export function CompletionRing({
  present,
  total,
  size = 72,
  stroke = 7,
  className,
}: CompletionRingProps) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, present / total)) : 0;
  const pct = Math.round(ratio * 100);
  const tone = toneFor(ratio);
  const full = ratio >= 1 && total > 0;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * ratio;

  return (
    <div
      className={cn('relative shrink-0', tone.arc, className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${present} di ${total} presenti — ${pct}%`}
    >
      {/* Soft completion halo when the whole team shows up. */}
      {full && (
        <span
          className="absolute inset-0 rounded-full bg-warning/15 blur-md animate-glow-pulse"
          aria-hidden
        />
      )}
      <svg width={size} height={size} className="relative -rotate-90" aria-hidden>
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
          className="stroke-current transition-[stroke-dasharray] duration-700 ease-emphasized"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn('text-base font-bold tabular-nums tracking-tight', tone.text)}>
          {pct}
          <span className="text-[10px] font-semibold">%</span>
        </span>
        <span className="mt-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {present}/{total}
        </span>
      </span>
    </div>
  );
}
