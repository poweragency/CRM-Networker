import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, initials } from '@/lib/utils';
import type { TopMarketerEntry } from '@/lib/data/mock/dashboard';

/**
 * TopMarketersCard — a single Dashboard category card listing the top marketers
 * of the month (podium-style). Presentational + server-renderable; each row links
 * to the member's profile (/team/[id]) and the viewer's own row is highlighted.
 */

type Accent = 'primary' | 'info' | 'success' | 'warning';

const accentChip: Record<Accent, string> = {
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/12 text-info',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning',
};

/** Position tint: gold for #1, neutral for #2/#3, muted otherwise. */
const podium = ['text-warning', 'text-foreground', 'text-muted-foreground'];

export interface TopMarketersCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  accent?: Accent;
  entries: TopMarketerEntry[];
  /** Formats a raw metric value into its display string. */
  formatValue: (value: number) => string;
  youLabel: string;
  emptyLabel: string;
}

export function TopMarketersCard({
  title,
  description,
  icon: Icon,
  accent = 'primary',
  entries,
  formatValue,
  youLabel,
  emptyLabel,
}: TopMarketersCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              accentChip[accent],
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ol className="space-y-1.5">
            {entries.map((e) => (
              <li key={e.marketer_id}>
                <Link
                  href={`/team/${e.marketer_id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border bg-background px-3 py-2 outline-none transition-colors hover:border-ring/60 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
                    e.is_self && 'border-primary/40 bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'w-5 shrink-0 text-center text-sm font-semibold tabular-nums',
                      e.position <= 3 ? podium[e.position - 1] : 'text-muted-foreground',
                    )}
                  >
                    {e.position}
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {initials(e.display_name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {e.display_name}
                    {e.is_self && (
                      <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {youLabel}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {formatValue(e.value)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
