import { getTranslations } from 'next-intl/server';
import { PanelLeft, PanelRight, Users } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { TreeNode } from '@/lib/types/db';
import {
  PersonalPerformance,
  type PersonalProspect,
} from '@/components/team/personal-performance';

/**
 * MarketerKpis — the marketer's numbers, shown inside the "Produzione" section
 * (not the always-on masthead). Two parts: the team structure (team / left /
 * right — genealogy aggregates) and the marketer's OWN
 * {@link PersonalPerformance} (prospect / iscrizioni / conversione with a period
 * filter), which is personal and never rolled up from the downline.
 */
export async function MarketerKpis({
  node,
  prospects = [],
}: {
  node: TreeNode;
  prospects?: PersonalProspect[];
}) {
  const tg = await getTranslations('genealogia');

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Team structure (genealogia) — these are downline aggregates. */}
      <div className="grid grid-cols-3 divide-x">
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
