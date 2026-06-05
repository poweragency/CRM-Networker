import { getTranslations } from 'next-intl/server';
import { PanelLeft, PanelRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/ui/count-up';
import type { TreeNode } from '@/lib/types/db';

/**
 * MarketerKpis — the marketer's team structure (team / left / right — genealogy
 * aggregates) for the "Produzione" section. The personal funnel KPIs live in the
 * dedicated "Performance" modal (see {@link PerformanceModal}), not inline.
 */
export async function MarketerKpis({ node }: { node: TreeNode }) {
  const tg = await getTranslations('genealogia');

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Team structure (genealogia) — these are downline aggregates. */}
      <div className="grid grid-cols-3 divide-x">
        <HeroStat icon={Users} label={tg('team_size')} value={node.team_size} />
        <HeroStat
          icon={PanelLeft}
          label={tg('left_count')}
          value={node.left_count}
          accent="text-branch-left"
        />
        <HeroStat
          icon={PanelRight}
          label={tg('right_count')}
          value={node.right_count}
          accent="text-branch-right"
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
  value: number;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', accent ?? 'text-muted-foreground')} aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
        <CountUp value={value} />
      </span>
    </div>
  );
}
