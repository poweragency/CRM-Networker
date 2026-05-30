import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  STAGE_LABELS,
  STAGE_ORDER,
  stageIndex,
  type ProspectStage,
} from '@/lib/types/db';

/**
 * FunnelProgress — a compact 6-step indicator of where a prospect sits in the
 * canonical funnel. Past stages are filled with a check, the current stage is
 * highlighted, future stages are muted. Server-safe (no hooks).
 */

export interface FunnelProgressProps {
  current: ProspectStage;
  className?: string;
}

export function FunnelProgress({ current, className }: FunnelProgressProps) {
  const currentIdx = stageIndex(current);

  return (
    <ol
      className={cn('flex items-center gap-1', className)}
      aria-label={`Fase corrente: ${STAGE_LABELS[current]}`}
    >
      {STAGE_ORDER.map((stage, i) => {
        const idx = i + 1;
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <li key={stage} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                  done && 'bg-success/15 text-success',
                  active && 'bg-primary text-primary-foreground',
                  !done && !active && 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {done ? <Check className="h-3.5 w-3.5" /> : idx}
              </span>
              <span
                className={cn(
                  'hidden truncate text-[10px] sm:block',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {STAGE_LABELS[stage]}
              </span>
            </div>
            {i < STAGE_ORDER.length - 1 && (
              <span
                className={cn(
                  'h-px flex-1',
                  idx < currentIdx ? 'bg-success/40' : 'bg-border',
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
