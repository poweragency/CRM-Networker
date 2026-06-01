import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Crown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { RankBadge } from '@/components/ui/rank-badge';
import { cn } from '@/lib/utils';
import type { TopMarketerEntry } from '@/lib/data/mock/dashboard';

/**
 * Dashboard leaderboard presenters (server components — no hooks).
 *
 * `SpotlightCard` = the hero card for a category's #1 marketer (big avatar, name,
 * rank, oversized value, accent gradient). `LeaderboardCard` = the full ranked
 * list with a 1/2/3 podium (gold/silver/bronze), avatars and a value bar relative
 * to the leader. Both are pure presentation over `TopMarketerEntry`.
 */

export type Accent = 'primary' | 'info' | 'success' | 'warning';

interface AccentTheme {
  chip: string;
  bar: string;
  gradient: string;
  ring: string;
}

const ACCENT: Record<Accent, AccentTheme> = {
  primary: {
    chip: 'bg-primary/10 text-primary',
    bar: 'bg-primary',
    gradient: 'from-primary/[0.10]',
    ring: 'ring-primary/15',
  },
  info: {
    chip: 'bg-info/12 text-info',
    bar: 'bg-info',
    gradient: 'from-info/[0.12]',
    ring: 'ring-info/15',
  },
  success: {
    chip: 'bg-success/12 text-success',
    bar: 'bg-success',
    gradient: 'from-success/[0.12]',
    ring: 'ring-success/15',
  },
  warning: {
    chip: 'bg-warning/15 text-warning',
    bar: 'bg-warning',
    gradient: 'from-warning/[0.14]',
    ring: 'ring-warning/20',
  },
};

/** Podium tone per position: gold / silver / bronze, then muted. */
const MEDAL: Record<number, string> = {
  1: 'bg-warning/15 text-warning ring-1 ring-warning/30',
  2: 'bg-muted text-foreground ring-1 ring-border',
  3: 'bg-[hsl(25_60%_45%/0.14)] text-[hsl(25_55%_42%)] ring-1 ring-[hsl(25_55%_42%/0.25)]',
};

export interface SpotlightCardProps {
  label: string;
  icon: LucideIcon;
  accent: Accent;
  entry: TopMarketerEntry | undefined;
  valueText: string;
  youLabel: string;
  emptyLabel: string;
}

export function SpotlightCard({
  label,
  icon: Icon,
  accent,
  entry,
  valueText,
  youLabel,
  emptyLabel,
}: SpotlightCardProps) {
  const a = ACCENT[accent];

  if (!entry) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
        <CategoryEyebrow icon={Icon} accent={accent} label={label} />
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <Link
      href={`/team/${entry.marketer_id}`}
      className={cn(
        'group relative flex flex-col gap-4 overflow-hidden rounded-xl border bg-card p-5 shadow-sm outline-none transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {/* Accent gradient wash */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent',
          a.gradient,
        )}
        aria-hidden
      />

      <div className="relative flex items-center justify-between">
        <CategoryEyebrow icon={Icon} accent={accent} label={label} />
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full',
            MEDAL[1],
          )}
          title="1ª posizione"
          aria-hidden
        >
          <Crown className="h-4 w-4" />
        </span>
      </div>

      <div className="relative flex items-center gap-3">
        <Avatar name={entry.display_name} size="lg" className={cn('ring-2', a.ring)} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {entry.display_name}
            {entry.is_self && (
              <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {youLabel}
              </span>
            )}
          </p>
          <div className="mt-1">
            <RankBadge rank={entry.rank} className="px-1.5 py-0 text-[10px]" />
          </div>
        </div>
      </div>

      <div className="relative">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {valueText}
        </span>
      </div>
    </Link>
  );
}

export interface LeaderboardCardProps {
  label: string;
  description: string;
  icon: LucideIcon;
  accent: Accent;
  entries: TopMarketerEntry[];
  formatValue: (value: number) => string;
  youLabel: string;
  emptyLabel: string;
}

export function LeaderboardCard({
  label,
  description,
  icon: Icon,
  accent,
  entries,
  formatValue,
  youLabel,
  emptyLabel,
}: LeaderboardCardProps) {
  const a = ACCENT[accent];
  const max = entries.length ? entries[0]!.value : 0;

  return (
    <div className="flex flex-col rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b p-5">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            a.chip,
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight tracking-tight text-foreground">
            {label}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      <div className="p-3">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ol className="space-y-0.5">
            {entries.map((e) => {
              const pct = max > 0 ? Math.max(6, Math.round((e.value / max) * 100)) : 0;
              return (
                <li key={e.marketer_id}>
                  <Link
                    href={`/team/${e.marketer_id}`}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
                      e.is_self && 'bg-primary/[0.06]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                        MEDAL[e.position] ?? 'text-muted-foreground',
                      )}
                    >
                      {e.position}
                    </span>
                    <Avatar name={e.display_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {e.display_name}
                        {e.is_self && (
                          <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {youLabel}
                          </span>
                        )}
                      </p>
                      {/* Value bar relative to the leader. */}
                      <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn('block h-full rounded-full', a.bar)}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatValue(e.value)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function CategoryEyebrow({
  icon: Icon,
  accent,
  label,
}: {
  icon: LucideIcon;
  accent: Accent;
  label: string;
}) {
  const a = ACCENT[accent];
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg',
          a.chip,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </span>
  );
}
