'use client';

import { CountUp } from '@/components/ui/count-up';
import { cn, formatNumber, formatPercent } from '@/lib/utils';

/**
 * SpotlightValue — animated hero metric for the dashboard Spotlight cards.
 *
 * This is a CLIENT island on purpose: the per-frame formatter (formatNumber /
 * formatPercent) is BUILT HERE, on the client, from a serializable `kind`
 * discriminator. That keeps the RSC boundary clean — the Server Components in
 * `dashboard-leaders.tsx` pass only plain values (number + 'count' | 'percent'),
 * never a function, so nothing crosses server → client that can't be serialized.
 */
export interface SpotlightValueProps {
  value: number;
  /** 'count' → it-IT integer; 'percent' → 0..1 ratio rendered as a percentage. */
  kind: 'count' | 'percent';
  className?: string;
}

export function SpotlightValue({ value, kind, className }: SpotlightValueProps) {
  const format =
    kind === 'percent'
      ? (n: number) => formatPercent(n)
      : (n: number) => formatNumber(Math.round(n));

  return (
    <CountUp
      value={value}
      format={format}
      className={cn('tabular-nums', className)}
    />
  );
}
