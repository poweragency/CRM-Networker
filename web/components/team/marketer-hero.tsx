import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, PanelLeft, PanelRight, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { cn, formatNumber } from '@/lib/utils';
import type { TreeNode } from '@/lib/types/db';
import {
  PersonalPerformance,
  type PersonalProspect,
} from '@/components/team/personal-performance';

/**
 * MarketerHero — the profile masthead for /team/[id] (server component). Replaces
 * the old breadcrumb + duplicate identity card with a single premium header: a
 * back link, a large avatar with status ring, identity (name + "Tu" + rank +
 * status) and a KPI strip. The strip is split in two: the team structure
 * (team / left / right — genealogy aggregates) and the marketer's OWN
 * {@link PersonalPerformance} (prospect / iscrizioni / conversione with a period
 * filter), which is personal — never rolled up from the downline. Conversion =
 * iscritti ÷ chi ha visto la Business Info.
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
  prospects = [],
}: {
  node: TreeNode;
  isSelf: boolean;
  /** Whether the marketer has an active CRM account login. */
  crmAccess?: boolean;
  /** This marketer's OWN prospects (stage + funnel-entry date) for the KPIs. */
  prospects?: PersonalProspect[];
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

      {/* Personal performance — this marketer ONLY, with a period filter. */}
      <PersonalPerformance prospects={prospects} />
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
