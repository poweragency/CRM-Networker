import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * KPI summary tile used on the dashboard. Token-driven accent ring + icon chip,
 * a large tabular value, a label and an optional hint/trend line. Purely
 * presentational and server-renderable.
 */

type Accent = 'primary' | 'info' | 'success' | 'warning' | 'global' | 'left' | 'right';

const accentChip: Record<Accent, string> = {
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/12 text-info',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning',
  global: 'bg-branch-global/12 text-branch-global',
  left: 'bg-branch-left/12 text-branch-left',
  right: 'bg-branch-right/12 text-branch-right',
};

export interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: Accent;
  className?: string;
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'primary',
  className,
}: KpiCardProps) {
  return (
    <Card
      className={cn(
        'flex flex-col gap-3 p-4 shadow-sm transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-md sm:p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            accentChip[accent],
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}
