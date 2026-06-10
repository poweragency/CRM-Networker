import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  Phone,
  PhoneCall,
  Target,
  UserPlus,
  TrendingUp,
  Users,
  ArrowRight,
  Trophy,
  FileBarChart,
} from 'lucide-react';
import { getAnalyticsOverview } from '@/lib/data/analytics';
import {
  connectRate,
  overallConversion,
  type BranchScope,
} from '@/lib/types/db';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ActivityTrend,
  AnalyticsScopeSwitcher,
  BottleneckList,
  BranchComparison,
  ConversionTable,
  FunnelChart,
} from '@/components/analytics';
import { formatNumber, formatPercent } from '@/lib/utils';

/**
 * /analytics — the rank-adaptive analytics surface (doc 11, build seq §9). RSC.
 *
 * Reads the Global/Left/Right scope from `?scope=` and pulls the overview through
 * the demo-safe data layer (mock fallback when env is missing OR a query fails),
 * then composes the KPI band, the 30-day activity trend, the conversion funnel +
 * stage-to-stage rates, the binary branch comparison and the open bottleneck
 * findings. Fully server-rendered; builds and runs with no env.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('analytics');
  return { title: t('title') };
}

function parseScope(value: string | string[] | undefined): BranchScope {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === 'left') return 'LEFT';
  if (v === 'right') return 'RIGHT';
  return 'GLOBAL';
}

export default async function AnalyticsPage(props: {
  searchParams?: Promise<{ scope?: string | string[] }>;
}) {
  const searchParams = await props.searchParams;
  const t = await getTranslations('analytics');
  const scope = parseScope(searchParams?.scope);
  const overview = await getAnalyticsOverview(scope);
  const m = overview.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={<AnalyticsScopeSwitcher scope={scope} />}
      />

      {overview.demo && <ConfigNotice variant="inline" />}

      {/* KPI band */}
      <section
        aria-label={t('title')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <KpiCard
          label={t('kpi_calls')}
          value={formatNumber(m.calls_total)}
          hint={t('kpi_calls_hint')}
          icon={Phone}
          accent="primary"
        />
        <KpiCard
          label={t('kpi_connect_rate')}
          value={formatPercent(connectRate(m), 0)}
          hint={t('kpi_connect_rate_hint')}
          icon={PhoneCall}
          accent="info"
        />
        <KpiCard
          label={t('kpi_new_prospects')}
          value={formatNumber(m.new_prospects)}
          hint={t('kpi_new_prospects_hint')}
          icon={Target}
          accent="info"
        />
        <KpiCard
          label={t('kpi_iscrizioni')}
          value={formatNumber(m.iscrizione)}
          hint={t('kpi_iscrizioni_hint')}
          icon={UserPlus}
          accent="success"
        />
        <KpiCard
          label={t('kpi_conversion')}
          value={formatPercent(overallConversion(m), 1)}
          hint={t('kpi_conversion_hint')}
          icon={TrendingUp}
          accent="warning"
        />
        <KpiCard
          label={t('kpi_recruits')}
          value={formatNumber(m.new_recruits)}
          hint={t('kpi_recruits_hint')}
          icon={Users}
          accent="global"
        />
      </section>

      {/* Activity trend */}
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle>{t('section_trend')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('section_trend_desc')}</p>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <ActivityTrend data={overview.trend} />
        </CardContent>
      </Card>

      {/* Funnel + conversion */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle>{t('section_funnel')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('section_funnel_desc')}</p>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <FunnelChart data={overview.funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle>{t('section_conversion')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('section_conversion_desc')}
            </p>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <ConversionTable data={overview.conversion} />
          </CardContent>
        </Card>
      </div>

      {/* Branch comparison */}
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle>{t('section_branch')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('section_branch_desc')}</p>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <BranchComparison data={overview.branch} />
        </CardContent>
      </Card>

      {/* Bottlenecks */}
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle>{t('section_bottlenecks')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('section_bottlenecks_desc')}
          </p>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <BottleneckList data={overview.bottlenecks} />
        </CardContent>
      </Card>

      {/* Quick links to sibling analytics surfaces */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/classifiche"
          className="group flex items-center justify-between rounded-lg border bg-background p-4 transition-colors hover:border-ring/60 hover:bg-muted/50"
        >
          <span className="flex items-center gap-3 text-sm font-medium text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Trophy className="h-[18px] w-[18px] text-warning" aria-hidden />
            </span>
            {t('view_leaderboards')}
          </span>
          <ArrowRight
            className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
        <Link
          href="/report"
          className="group flex items-center justify-between rounded-lg border bg-background p-4 transition-colors hover:border-ring/60 hover:bg-muted/50"
        >
          <span className="flex items-center gap-3 text-sm font-medium text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <FileBarChart className="h-[18px] w-[18px] text-primary" aria-hidden />
            </span>
            {t('view_reports')}
          </span>
          <ArrowRight
            className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </div>
  );
}
