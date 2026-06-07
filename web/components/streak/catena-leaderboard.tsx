import Link from 'next/link';
import { Flame } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/avatar';
import { RankBadge } from '@/components/ui/rank-badge';
import { cn } from '@/lib/utils';
import { getDmoLeaderboard } from '@/lib/data/streak';

/**
 * CatenaLeaderboard — the dashboard "Top Catena d'Oro del mese" widget (RSC).
 * Ranks the caller's visible team by the number of all-done DMO days this month
 * (via `dmo_month_leaderboard`). First iteration — intentionally simple, to be
 * refined later (podium spotlight, period filter, etc.). Demo-safe.
 */

/** Medal accents for the top 3 positions. */
const MEDAL: Record<number, string> = {
  0: 'bg-warning/15 text-warning ring-warning/30',
  1: 'bg-muted text-muted-foreground ring-border',
  2: 'bg-[#cd7f32]/15 text-[#cd7f32] ring-[#cd7f32]/30',
};

export async function CatenaLeaderboard() {
  const t = await getTranslations('catena');
  const { rows } = await getDmoLeaderboard();

  return (
    <section className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-gradient-to-br from-warning/20 via-warning/[0.05] to-transparent blur-3xl"
        aria-hidden
      />
      <div className="relative p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning ring-1 ring-warning/30 shadow-glow-warning"
            aria-hidden
          >
            <Flame className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight tracking-tight text-foreground">
              {t('leaderboard_title')}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('leaderboard_subtitle')}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            {t('leaderboard_empty')}
          </p>
        ) : (
          <ol className="space-y-1.5">
            {rows.map((row, i) => (
              <li key={row.marketer_id}>
                <Link
                  href={`/team/${row.marketer_id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-border/70 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    row.is_self && 'bg-primary/[0.06] ring-1 ring-primary/20',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ring-1',
                      MEDAL[i] ?? 'bg-muted/60 text-muted-foreground ring-border/60',
                    )}
                  >
                    {i + 1}
                  </span>
                  <Avatar name={row.display_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {row.display_name}
                      {row.is_self && (
                        <span className="ml-1.5 text-[11px] font-semibold text-primary">
                          · {t('leaderboard_you')}
                        </span>
                      )}
                    </p>
                    <RankBadge rank={row.rank} variant="dot" className="mt-0.5" />
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning/12 px-2.5 py-1 text-sm font-bold tabular-nums text-warning ring-1 ring-warning/25">
                    <Flame className="h-3.5 w-3.5" aria-hidden />
                    {t('leaderboard_days', { n: row.days_done })}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
