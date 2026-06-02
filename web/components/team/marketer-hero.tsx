import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowLeft,
  PanelLeft,
  PanelRight,
  Phone,
  Target,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import type { TreeNode } from '@/lib/types/db';

/**
 * MarketerHero — the profile masthead for /team/[id] (server component). Replaces
 * the old breadcrumb + duplicate identity card with a single premium header: a
 * back link, a large avatar with status ring, identity (name + "Tu" + rank +
 * status) and a KPI strip (team / left / right + prospects / calls / enrolments /
 * conversion). Pure presentation over the tree node.
 */

const STATUS_RING: Record<string, string> = {
  active: 'ring-success/40',
  pending: 'ring-warning/40',
  inactive: 'ring-border',
};

export async function MarketerHero({
  node,
  isSelf,
  crmAccess = false,
}: {
  node: TreeNode;
  isSelf: boolean;
  /** Whether the marketer has an active CRM account login. */
  crmAccess?: boolean;
}) {
  const t = await getTranslations('team');
  const tg = await getTranslations('genealogia');

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Top band: back link + identity, on a subtle accent wash */}
      <div className="relative bg-gradient-to-br from-primary/[0.07] to-transparent p-5">
        <Link
          href="/statistiche"
          className="mb-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t('breadcrumb')}
        </Link>

        <div className="flex items-start gap-4">
          <Avatar
            name={node.display_name}
            size="lg"
            className={cn('h-16 w-16 text-lg ring-2 ring-offset-2 ring-offset-card', STATUS_RING[node.status])}
          />
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                {node.display_name}
              </h1>
              {isSelf && (
                <Badge variant="default" className="px-1.5 py-0">
                  {t('you')}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RankBadge rank={node.rank} />
              {/* Renewal (rinnovo) — distinct prefix so it's not confused with CRM. */}
              <Badge variant={node.status === 'active' ? 'success' : 'danger'}>
                {t('renewal_prefix')}:{' '}
                {node.status === 'active' ? t('renewal_active') : t('renewal_inactive')}
              </Badge>
              {/* CRM account access — separate concept, separate badge. */}
              <Badge variant={crmAccess ? 'info' : 'secondary'}>
                {t('account_prefix')}:{' '}
                {crmAccess ? t('account_on') : t('account_off')}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-4 sm:divide-y-0 lg:grid-cols-7">
        <HeroStat icon={Users} label={tg('team_size')} value={formatNumber(node.team_size)} />
        <HeroStat
          icon={PanelLeft}
          label={tg('left_count')}
          value={formatNumber(node.left_count)}
          accent="text-branch-left"
        />
        <HeroStat
          icon={PanelRight}
          label={tg('right_count')}
          value={formatNumber(node.right_count)}
          accent="text-branch-right"
        />
        <HeroStat
          icon={Target}
          label={tg('kpi_prospects')}
          value={formatNumber(node.kpis.prospects)}
          accent="text-info"
        />
        <HeroStat
          icon={Phone}
          label={tg('kpi_calls')}
          value={formatNumber(node.kpis.calls)}
          accent="text-primary"
        />
        <HeroStat
          icon={UserPlus}
          label={tg('kpi_iscrizioni')}
          value={formatNumber(node.kpis.iscrizioni)}
          accent="text-success"
        />
        <HeroStat
          icon={TrendingUp}
          label={tg('kpi_conversion')}
          value={formatPercent(node.kpis.conversion_rate)}
          accent="text-warning"
        />
      </div>
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', accent ?? 'text-muted-foreground')} aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </span>
    </div>
  );
}
