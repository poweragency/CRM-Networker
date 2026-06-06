'use client';

import * as React from 'react';
import { Globe, PanelLeft, PanelRight, UserCheck, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn, formatNumber } from '@/lib/utils';
import type { BranchScope, PlacementLeg, TreeNode } from '@/lib/types/db';

/**
 * Per-branch summary stats (doc 14 §6.2): for the active scope it rolls up the
 * descendants of the layout root into totale / attivi / iscrizioni. Counts come
 * from the loaded node window; for branch scopes only the chosen-leg subtree of
 * the own root is counted (closure `branch_leg` semantics, computed client-side
 * over the cached adjacency).
 */

export interface BranchSummaryProps {
  /** Every loaded node (full cache). */
  nodes: TreeNode[];
  /** The caller's own root id (branch sides are resolved relative to it). */
  rootId: string;
  scope: BranchScope;
  className?: string;
}

interface Stats {
  total: number;
  active: number;
  iscrizioni: number;
}

/** Collect the subtree (inclusive) of `startId` from the adjacency map. */
function collectSubtree(
  childrenOf: Map<string, TreeNode[]>,
  startId: string,
  byId: Map<string, TreeNode>,
): TreeNode[] {
  const out: TreeNode[] = [];
  const stack = [startId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (n) out.push(n);
    for (const c of childrenOf.get(id) ?? []) stack.push(c.id);
  }
  return out;
}

function aggregate(nodes: TreeNode[]): Stats {
  return nodes.reduce<Stats>(
    (acc, n) => ({
      total: acc.total + 1,
      active: acc.active + (n.status === 'active' ? 1 : 0),
      iscrizioni: acc.iscrizioni + n.kpis.iscrizioni,
    }),
    { total: 0, active: 0, iscrizioni: 0 },
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 shadow-xs transition-all duration-base hover:-translate-y-px hover:shadow-card-hover">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          accent,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tabular-nums leading-tight text-foreground">
          {formatNumber(value)}
        </span>
        <span className="block truncate text-[11px] leading-tight text-muted-foreground">
          {label}
        </span>
      </span>
    </div>
  );
}

export function BranchSummary({
  nodes,
  rootId,
  scope,
  className,
}: BranchSummaryProps) {
  const t = useTranslations('genealogia');
  const tb = useTranslations('branch');

  const stats = React.useMemo<Stats>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const childrenOf = new Map<string, TreeNode[]>();
    for (const n of nodes) {
      if (!n.parent_id) continue;
      const arr = childrenOf.get(n.parent_id) ?? [];
      arr.push(n);
      childrenOf.set(n.parent_id, arr);
    }

    if (scope === 'GLOBAL') {
      // Global: the whole subtree under the own root, excluding the root itself.
      const sub = collectSubtree(childrenOf, rootId, byId).filter(
        (n) => n.id !== rootId,
      );
      return aggregate(sub);
    }

    // Branch: the chosen-leg child's subtree (the branch root relative to N).
    const leg: PlacementLeg = scope === 'LEFT' ? 'LEFT' : 'RIGHT';
    const child = (childrenOf.get(rootId) ?? []).find((c) => c.leg === leg);
    if (!child) return { total: 0, active: 0, iscrizioni: 0 };
    return aggregate(collectSubtree(childrenOf, child.id, byId));
  }, [nodes, rootId, scope]);

  const meta =
    scope === 'GLOBAL'
      ? { label: tb('global'), Icon: Globe, accent: 'bg-branch-global/12 text-branch-global' }
      : scope === 'LEFT'
        ? { label: tb('left_full'), Icon: PanelLeft, accent: 'bg-branch-left/12 text-branch-left' }
        : { label: tb('right_full'), Icon: PanelRight, accent: 'bg-branch-right/12 text-branch-right' };

  const HeadIcon = meta.Icon;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md',
            meta.accent,
          )}
        >
          <HeadIcon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatPill
          icon={Users}
          label={t('summary_total')}
          value={stats.total}
          accent="bg-muted text-muted-foreground"
        />
        <StatPill
          icon={UserCheck}
          label={t('summary_active')}
          value={stats.active}
          accent="bg-success/12 text-success"
        />
      </div>
    </div>
  );
}
