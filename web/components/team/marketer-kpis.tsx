import { getTranslations } from 'next-intl/server';
import { PanelLeft, PanelRight, Target, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/ui/count-up';
import type { TreeNode } from '@/lib/types/db';

/**
 * MarketerKpis — the marketer's headline numbers for the "Produzione" section:
 * "Prospect (in ballo)" — their LIVE active prospects (open funnel + Lista-100 in
 * percorso), the SAME figure the genealogy tree shows for this person — followed by
 * the binary team structure (team / left / right). Rendered as premium stat cards
 * with tinted icon chips, large tallying numbers and a hover lift. The funnel
 * STEP-conversion trends live in the dedicated "Performance" modal.
 */
export async function MarketerKpis({ node }: { node: TreeNode }) {
  const tg = await getTranslations('genealogia');

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <HeroStat
        icon={Target}
        label={tg('kpi_prospects_live')}
        value={node.kpis.prospects}
        chip="bg-info/10 text-info"
        bar="from-info/60"
      />
      <HeroStat
        icon={Users}
        label={tg('team_size')}
        value={node.team_size}
        chip="bg-primary/10 text-primary"
        bar="from-primary/60"
      />
      <HeroStat
        icon={PanelLeft}
        label={tg('left_count')}
        value={node.left_count}
        chip="bg-branch-left/10 text-branch-left"
        bar="from-branch-left/60"
      />
      <HeroStat
        icon={PanelRight}
        label={tg('right_count')}
        value={node.right_count}
        chip="bg-branch-right/10 text-branch-right"
        bar="from-branch-right/60"
      />
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  chip,
  bar,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  /** Tone classes for the icon chip (bg + text). */
  chip: string;
  /** Gradient start color for the bottom accent bar. */
  bar: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-card transition-all duration-base ease-standard hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', chip)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
        <CountUp value={value} />
      </p>
      <span
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r to-transparent opacity-0 transition-opacity duration-base group-hover:opacity-100',
          bar,
        )}
        aria-hidden
      />
    </div>
  );
}
