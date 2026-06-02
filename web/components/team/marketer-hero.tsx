import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowLeft,
  PanelLeft,
  PanelRight,
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
import type { ProspectKpis } from '@/lib/data/prospects';

/**
 * MarketerHero — the profile masthead for /team/[id] (server component). Replaces
 * the old breadcrumb + duplicate identity card with a single premium header: a
 * back link, a large avatar with status ring, identity (name + "Tu" + rank +
 * status) and a KPI strip. The strip is split in two: the team structure
 * (team / left / right — genealogy aggregates) and the marketer's OWN
 * performance (prospect / iscrizioni / conversione), which are personal — never
 * rolled up from the downline. Conversion = iscritti ÷ chi ha visto la Business
 * Info. Pure presentation; the personal KPIs are computed by the page.
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
  kpis,
}: {
  node: TreeNode;
  isSelf: boolean;
  /** Whether the marketer has an active CRM account login. */
  crmAccess?: boolean;
  /** Personal funnel KPIs (this marketer only). Falls back to node.kpis. */
  kpis?: ProspectKpis;
}) {
  const t = await getTranslations('team');
  const tg = await getTranslations('genealogia');

  // Personal performance — this marketer's own prospects, not the downline.
  const prospects = kpis?.prospects ?? node.kpis.prospects;
  const iscrizioni = kpis?.iscrizioni ?? node.kpis.iscrizioni;
  const conversion = kpis?.conversionRate ?? node.kpis.conversion_rate;

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

      {/* Team structure (genealogia) — these are downline aggregates. */}
      <div className="grid grid-cols-3 divide-x border-t">
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
      </div>

      {/* Personal performance — this marketer ONLY, never the downline. */}
      <div className="border-t bg-muted/20">
        <p className="px-4 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('kpi_personal_title')}
        </p>
        <div className="grid grid-cols-3 divide-x">
          <HeroStat
            icon={Target}
            label={tg('kpi_prospects')}
            value={formatNumber(prospects)}
            accent="text-info"
          />
          <HeroStat
            icon={UserPlus}
            label={tg('kpi_iscrizioni')}
            value={formatNumber(iscrizioni)}
            accent="text-success"
          />
          <HeroStat
            icon={TrendingUp}
            label={tg('kpi_conversion')}
            value={formatPercent(conversion)}
            accent="text-warning"
            hint={t('kpi_conversion_caption')}
          />
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  accent?: string;
  /** Optional small caption under the value (e.g. how a ratio is computed). */
  hint?: string;
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
      {hint && (
        <span className="text-[10px] leading-tight text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}
