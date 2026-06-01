import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Eye, Route, TrendingUp } from 'lucide-react';
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
 * /dashboard — "migliori marketer del mese" (RSC). Two tiers: a Spotlight row
 * (the #1 of each category as a hero card) and the full per-category leaderboards
 * (podium 1/2/3 + value bars). The three categories are chi ha visto più Zoom di
 * team, chi ha fatto più percorsi, e la conversione Business Info → Closing.
 * Rankings are mock/derived for now (see `lib/data/dashboard.ts`); each entry
 * links to the member's profile. Fully server-rendered; builds and runs with no
 * env.
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
    <div className="space-y-8">
      {isDemo && <ConfigNotice variant="inline" />}

      {/* Tier 1 — Spotlight: the #1 of each category */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {categories.map((c) => (
          <SpotlightCard
            key={c.key}
            label={c.label}
            icon={c.icon}
            accent={c.accent}
            entry={c.entries[0]}
            valueText={c.entries[0] ? c.spotlightValue(c.entries[0].value) : ''}
            youLabel={youLabel}
            emptyLabel={emptyLabel}
          />
        ))}
      </section>

      {/* Tier 2 — Full leaderboards (podium + value bars) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
