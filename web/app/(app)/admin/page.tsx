import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  Users,
  UserCheck,
  KeyRound,
  UserPlus,
  ArrowRight,
  Medal,
  ScrollText,
  BarChart3,
  UserPlus2,
} from 'lucide-react';
import { getAnalyticsOverview } from '@/lib/data/analytics';
import { listMarketers } from '@/lib/data/admin';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityTrend, BottleneckList } from '@/components/analytics';
import { formatNumber } from '@/lib/utils';

/**
 * /admin — the Direzione (CEO) dashboard (ADR-008, build seq §11). RSC.
 *
 * Org-wide snapshot for admins/owners: network + account counts, the 30-day
 * activity trend, open bottlenecks and quick links into the admin surfaces. All
 * data flows through the demo-safe layer (mock fallback when env is missing OR a
 * query fails); the whole /admin section is gated to admin/owner by the nav, and
 * the data layer's RLS widens to org-wide only for those roles.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('title') };
}

export default async function AdminPage() {
  const t = await getTranslations('admin');
  const [overview, marketersRes] = await Promise.all([
    getAnalyticsOverview('GLOBAL'),
    listMarketers(),
  ]);

  const rows = marketersRes.data;
  const total = rows.length;
  const activeProfiles = rows.filter((r) => r.status === 'active').length;
  const crmAccounts = rows.filter((r) => r.account_status === 'active').length;
  const demo = overview.demo || marketersRes.demo;

  const quick = [
    { href: '/admin/marketer/nuovo', icon: UserPlus, titleKey: 'quick_pre_register', descKey: 'quick_pre_register_desc', accent: 'text-info' },
    { href: '/admin/ranghi', icon: Medal, titleKey: 'quick_ranks', descKey: 'quick_ranks_desc', accent: 'text-warning' },
    { href: '/admin/audit', icon: ScrollText, titleKey: 'quick_audit', descKey: 'quick_audit_desc', accent: 'text-muted-foreground' },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {demo && <ConfigNotice variant="inline" />}

      <section
        aria-label={t('title')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard label={t('kpi_marketers')} value={formatNumber(total)} hint={t('kpi_marketers_hint')} icon={Users} accent="primary" />
        <KpiCard label={t('kpi_active')} value={formatNumber(activeProfiles)} hint={t('kpi_active_hint')} icon={UserCheck} accent="success" />
        <KpiCard label={t('kpi_accounts')} value={formatNumber(crmAccounts)} hint={t('kpi_accounts_hint')} icon={KeyRound} accent="info" />
        <KpiCard label={t('kpi_iscrizioni')} value={formatNumber(overview.summary.iscrizione)} hint={t('kpi_iscrizioni_hint')} icon={UserPlus2} accent="global" />
      </section>

      <div className="flex items-center justify-end">
        <Link
          href="/analytics"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <BarChart3 className="h-4 w-4" aria-hidden />
          {t('view_analytics')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle>{t('section_quick')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 p-5 pt-0 sm:grid-cols-2">
          {quick.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.href}
                href={q.href}
                className="group flex items-start gap-3 rounded-lg border bg-background p-4 transition-colors hover:border-ring/60 hover:bg-muted/50"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className={`h-[18px] w-[18px] ${q.accent}`} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                    {t(q.titleKey)}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t(q.descKey)}
                  </span>
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle>{t('section_bottlenecks')}</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <BottleneckList data={overview.bottlenecks} />
        </CardContent>
      </Card>
    </div>
  );
}
