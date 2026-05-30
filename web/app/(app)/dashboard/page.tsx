import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  Users,
  Phone,
  UserPlus,
  Target,
  Network,
  BarChart3,
  Trophy,
  ArrowRight,
  PanelLeft,
  PanelRight,
} from 'lucide-react';
import { getCurrentClaims } from '@/lib/data/session';
import { getNode, getRootMarketer } from '@/lib/data/genealogy';
import { ConfigNotice } from '@/components/config-notice';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RankBadge } from '@/components/ui/rank-badge';
import { Badge } from '@/components/ui/badge';
import { RANK_ORDER, type MarketerRank, type MembershipRole } from '@/lib/types/db';
import type { TreeNode } from '@/lib/types/db';
import { formatNumber, formatPercent } from '@/lib/utils';

/**
 * /dashboard — the rank-adaptive landing surface (RSC).
 *
 * Reads the caller's claims and own marketer node through the demo-safe data
 * layer (mock fallback when env is missing / a query fails), then renders a
 * welcome that adapts to the viewer's seniority, four KPI tiles fed from the
 * node's rolled-up metrics, a binary branch overview, and quick links into the
 * core surfaces. Fully server-rendered; builds and runs with no env.
 */

function isLeader(rank: MarketerRank): boolean {
  return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf('team_leader');
}

function subtitleKey(role: MembershipRole, rank: MarketerRank): string {
  if (role === 'admin' || role === 'owner') return 'subtitle_admin';
  if (isLeader(rank)) return 'subtitle_leader';
  return 'subtitle_member';
}

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');

  const { claims, demo } = await getCurrentClaims();

  // The caller's own node carries their KPIs + binary team counts; fall back to
  // the visible root if the profile id can't be resolved.
  const nodeRes = await getNode(claims.marketer_id);
  let node: TreeNode | null = nodeRes.data;
  if (!node) {
    node = (await getRootMarketer()).data;
  }
  const isDemo = demo || nodeRes.demo;

  const firstName = node.first_name || node.display_name.split(' ')[0] || '';
  const kpis = node.kpis;

  const quickLinks: ReadonlyArray<{
    href: string;
    icon: typeof Network;
    titleKey: string;
    descKey: string;
    accent: string;
  }> = [
    {
      href: '/genealogia',
      icon: Network,
      titleKey: 'quick_genealogia',
      descKey: 'quick_genealogia_desc',
      accent: 'text-branch-global',
    },
    {
      href: '/contatti',
      icon: Users,
      titleKey: 'quick_contatti',
      descKey: 'quick_contatti_desc',
      accent: 'text-info',
    },
    {
      href: '/analytics',
      icon: BarChart3,
      titleKey: 'quick_analytics',
      descKey: 'quick_analytics_desc',
      accent: 'text-primary',
    },
    {
      href: '/classifiche',
      icon: Trophy,
      titleKey: 'quick_classifiche',
      descKey: 'quick_classifiche_desc',
      accent: 'text-warning',
    },
  ];

  return (
    <div className="space-y-6">
      {isDemo && <ConfigNotice variant="inline" />}

      {/* Welcome */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {firstName
              ? t('welcome_named', { nome: firstName })
              : t('welcome')}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(subtitleKey(claims.role, claims.rank))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('your_rank')}</span>
          <RankBadge rank={node.rank} />
        </div>
      </div>

      {/* KPI grid */}
      <section
        aria-label={t('title')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label={t('kpi_prospects')}
          value={formatNumber(kpis.prospects)}
          hint={t('kpi_prospects_hint')}
          icon={Target}
          accent="info"
        />
        <KpiCard
          label={t('kpi_calls')}
          value={formatNumber(kpis.calls)}
          hint={t('kpi_calls_hint')}
          icon={Phone}
          accent="primary"
        />
        <KpiCard
          label={t('kpi_iscrizioni')}
          value={formatNumber(kpis.iscrizioni)}
          hint={t('kpi_iscrizioni_hint')}
          icon={UserPlus}
          accent="success"
        />
        <KpiCard
          label={t('kpi_conversion')}
          value={formatPercent(kpis.conversion_rate)}
          hint={t('kpi_conversion_hint')}
          icon={Trophy}
          accent="warning"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Branch overview */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-3">
            <CardTitle>{t('branch_overview')}</CardTitle>
            <Link
              href="/genealogia"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {t('view_all')}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0">
            <div className="flex items-center justify-between rounded-lg border bg-background p-3">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-branch-left/12 text-branch-left">
                  <PanelLeft className="h-4 w-4" aria-hidden />
                </span>
                {t('branch_left')}
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {formatNumber(node.left_count)}
                </span>{' '}
                {t('members')}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-background p-3">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-branch-right/12 text-branch-right">
                  <PanelRight className="h-4 w-4" aria-hidden />
                </span>
                {t('branch_right')}
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {formatNumber(node.right_count)}
                </span>{' '}
                {t('members')}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                {t('team_size')}
              </span>
              <Badge variant="default">{formatNumber(node.team_size)}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-5 pb-3">
            <CardTitle>{t('quick_links')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 p-5 pt-0 sm:grid-cols-2">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-start gap-3 rounded-lg border bg-background p-4 outline-none transition-colors hover:border-ring/60 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className={`h-[18px] w-[18px] ${link.accent}`} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                      {t(link.titleKey)}
                      <ArrowRight
                        className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t(link.descKey)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
