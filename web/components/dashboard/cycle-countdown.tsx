'use client';

import * as React from 'react';
import { Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * CycleCountdown — the dashboard hero pill: time left until the company cycle ends.
 * Colour by days remaining (28–15 green · 14–8 orange · 7–1 red); in the LAST 24h it
 * flips to a live HH:MM:SS countdown that ticks every second. Client-only (uses the
 * wall clock) with a neutral first paint to avoid a hydration mismatch.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type Tier = 'green' | 'orange' | 'red';

function tierForDays(days: number): Tier {
  if (days >= 15) return 'green';
  if (days >= 8) return 'orange';
  return 'red';
}

const TIER_PILL: Record<Tier, string> = {
  green: 'bg-success/12 text-success ring-success/25',
  orange: 'bg-warning/15 text-warning ring-warning/30',
  red: 'bg-danger/12 text-danger ring-danger/30',
};
const TIER_DOT: Record<Tier, string> = {
  green: 'bg-success',
  orange: 'bg-warning',
  red: 'bg-danger',
};

const pad = (n: number) => String(n).padStart(2, '0');

export function CycleCountdown({ endIso }: { endIso: string }) {
  const end = React.useMemo(() => new Date(endIso).getTime(), [endIso]);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // First paint (SSR + pre-hydration): neutral placeholder, no clock read.
  if (now == null) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-border sm:self-center">
        <Hourglass className="h-3.5 w-3.5" aria-hidden />
        Ciclo in corso
      </span>
    );
  }

  const remaining = Math.max(0, end - now);
  const underDay = remaining > 0 && remaining < DAY_MS;
  const days = Math.ceil(remaining / DAY_MS);
  const tier: Tier = underDay ? 'red' : tierForDays(days);

  let label: string;
  if (remaining <= 0) {
    label = 'Nuovo ciclo';
  } else if (underDay) {
    const totalSec = Math.floor(remaining / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    label = `${pad(h)}:${pad(m)}:${pad(s)} rimanenti`;
  } else {
    label = `${days} ${days === 1 ? 'giorno' : 'giorni'} rimanenti`;
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums ring-1 transition-colors sm:self-center',
        TIER_PILL[tier],
      )}
      title="Tempo rimanente alla fine del ciclo aziendale"
      aria-live="off"
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-glow-pulse rounded-full opacity-70',
            TIER_DOT[tier],
          )}
        />
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', TIER_DOT[tier])} />
      </span>
      <Hourglass className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}
