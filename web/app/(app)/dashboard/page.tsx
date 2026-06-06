import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Eye, Route, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { getCurrentClaims } from '@/lib/data/session';
import { getMonthlyTopMarketers } from '@/lib/data/dashboard';
import type { TopMarketerEntry } from '@/lib/data/mock/dashboard';
import { ConfigNotice } from '@/components/config-notice';
import {
  LeaderboardCard,
  SpotlightCard,
  type Accent,
} from '@/components/dashboard/dashboard-leaders';
import { formatNumber, formatPercent } from '@/lib/utils';

/**
 * /dashboard — "migliori marketer del mese" (RSC). A premium competition hub:
 * a hero header with the live monthly context, a Spotlight row (the #1 of each
 * category as a hero card with an animated value + floating crown) and the full
 * per-category leaderboards (champion spotlight + 2/3 podium + value bars). The
 * three categories are chi ha visto più Zoom di team, chi ha fatto più percorsi,
 * e la conversione Business Info → Closing. Rankings are mock/derived for now
 * (see `lib/data/dashboard.ts`); each entry links to the member's profile. Fully
 * server-rendered; builds and runs with no env.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return { title: t('top_title') };
}

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');

  const { demo } = await getCurrentClaims();
  const top = await getMonthlyTopMarketers(5);
  const isDemo = demo || top.demo;

  const youLabel = t('you_badge');
  const emptyLabel = t('top_empty');

  // Current month label (it-IT) for the hero subtitle — display only.
  const monthLabel = new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  // One config per category drives both the Spotlight hero and the leaderboard.
  const categories: ReadonlyArray<{
    key: string;
    label: string;
    description: string;
    icon: typeof Eye;
    accent: Accent;
    entries: TopMarketerEntry[];
    formatValue: (value: number) => string;
    spotlightValue: (value: number) => string;
  }> = [
    {
      key: 'zoom',
      label: t('cat_zoom'),
      description: t('cat_zoom_desc'),
      icon: Eye,
      accent: 'info',
      entries: top.data.zoom,
      formatValue: (n) => t('cat_zoom_unit', { count: n }),
      spotlightValue: (n) => formatNumber(n),
    },
    {
      key: 'percorsi',
      label: t('cat_percorsi'),
      description: t('cat_percorsi_desc'),
      icon: Route,
      accent: 'primary',
      entries: top.data.percorsi,
      formatValue: (n) => t('cat_percorsi_unit', { count: n }),
      spotlightValue: (n) => formatNumber(n),
    },
    {
      key: 'conversion',
      label: t('cat_conversion'),
      description: t('cat_conversion_desc'),
      icon: TrendingUp,
      accent: 'success',
      entries: top.data.conversion,
      formatValue: (n) => formatPercent(n),
      spotlightValue: (n) => formatPercent(n),
    },
  ];

  return (
    <div className="animate-fade-in space-y-8">
      {isDemo && <ConfigNotice variant="inline" />}

      {/* Hero — competition context. Layered surface with controlled gold glow. */}
      <section className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
        {/* Drifting prestige aura (gold) */}
        <div
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-gradient-to-br from-warning/25 via-warning/[0.06] to-transparent blur-3xl animate-aurora"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-20 -bottom-28 h-64 w-64 rounded-full bg-gradient-to-tr from-primary/20 via-primary/[0.05] to-transparent blur-3xl"
          aria-hidden
        />
        {/* Faint tech grid for depth */}
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.4]" aria-hidden />

        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning ring-1 ring-warning/30 shadow-glow-warning animate-float"
              aria-hidden
            >
              <Trophy className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
                {t('top_title')}
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {t('top_subtitle', { month: monthLabel })}
              </p>
            </div>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-success/12 px-3 py-1.5 text-xs font-semibold text-success ring-1 ring-success/25 sm:self-center">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-glow-pulse rounded-full bg-success/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span className="capitalize">{monthLabel}</span>
          </span>
        </div>
      </section>

      {/* Tier 1 — Spotlight: the #1 of each category */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {categories.map((c) => (
          <SpotlightCard
            key={c.key}
            label={c.label}
            icon={c.icon}
            accent={c.accent}
            entry={c.entries[0]}
            formatValue={c.spotlightValue}
            youLabel={youLabel}
            emptyLabel={emptyLabel}
          />
        ))}
      </section>

      {/* Tier 2 — Full leaderboards (champion spotlight + podium + value bars) */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {categories.map((c) => (
          <LeaderboardCard
            key={c.key}
            label={c.label}
            description={c.description}
            icon={c.icon}
            accent={c.accent}
            entries={c.entries}
            formatValue={c.formatValue}
            youLabel={youLabel}
            emptyLabel={emptyLabel}
          />
        ))}
      </section>
    </div>
  );
}
