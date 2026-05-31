import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Eye, Route, TrendingUp } from 'lucide-react';
import { getCurrentClaims } from '@/lib/data/session';
import { getMonthlyTopMarketers } from '@/lib/data/dashboard';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { TopMarketersCard } from '@/components/dashboard/top-marketers-card';
import { formatPercent } from '@/lib/utils';

/**
 * /dashboard — "migliori marketer del mese" (RSC). Ranks the team across three
 * categories: chi ha visto più Zoom di team, chi ha fatto più percorsi, e chi ha
 * il tasso di conversione più alto da Business Info a Closing. Rankings are
 * mock/derived for now (see `lib/data/dashboard.ts`); each entry links to the
 * member's profile. Fully server-rendered; builds and runs with no env.
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

  const month = new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const youLabel = t('you_badge');
  const emptyLabel = t('top_empty');

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Dashboard" title={t('top_title')} description={t('top_subtitle', { month })} />

      {isDemo && <ConfigNotice variant="inline" />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <TopMarketersCard
          title={t('cat_zoom')}
          description={t('cat_zoom_desc')}
          icon={Eye}
          accent="info"
          entries={top.data.zoom}
          formatValue={(n) => t('cat_zoom_unit', { count: n })}
          youLabel={youLabel}
          emptyLabel={emptyLabel}
        />
        <TopMarketersCard
          title={t('cat_percorsi')}
          description={t('cat_percorsi_desc')}
          icon={Route}
          accent="primary"
          entries={top.data.percorsi}
          formatValue={(n) => t('cat_percorsi_unit', { count: n })}
          youLabel={youLabel}
          emptyLabel={emptyLabel}
        />
        <TopMarketersCard
          title={t('cat_conversion')}
          description={t('cat_conversion_desc')}
          icon={TrendingUp}
          accent="success"
          entries={top.data.conversion}
          formatValue={(n) => formatPercent(n)}
          youLabel={youLabel}
          emptyLabel={emptyLabel}
        />
      </div>
    </div>
  );
}
