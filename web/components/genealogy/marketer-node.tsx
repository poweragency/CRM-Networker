'use client';

import * as React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  PanelLeft,
  PanelRight,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { RankBadge } from '@/components/ui/rank-badge';
import { StatusDot } from '@/components/ui/status-dot';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import { type PlacementLeg, type TreeNode } from '@/lib/types/db';
import { NODE_HEIGHT, NODE_WIDTH } from './layout';

/**
 * Custom React Flow node — the binary genealogy mini-card (doc 14 §7.1/§7.5).
 *
 * Shows identity (avatar, display_name, RankBadge), an activity indicator dot, the
 * binary team counts (left/right + total) and the three headline KPIs (prospects,
 * iscrizioni, conversion %). The whole card is the selection target; a dedicated
 * chevron toggles lazy expand/collapse without selecting. Branch identity is
 * carried by the left border accent (LEFT=viola, RIGHT=verde, root=indigo).
 *
 * Data is passed through React Flow's `data` prop; the callbacks are injected by
 * the canvas so the node stays a pure presenter.
 */

export interface MarketerNodeData extends Record<string, unknown> {
  node: TreeNode;
  branchLeg: PlacementLeg | null;
  selected: boolean;
  expanded: boolean;
  hasChildren: boolean;
  /** Recruited from outside your line (placed in your leg via spillover). */
  spillover?: boolean;
  onToggle: (node: TreeNode) => void;
  onSelect: (node: TreeNode) => void;
}

/** Left-accent rail color carrying the branch identity of the node. */
const legAccent: Record<'root' | PlacementLeg, string> = {
  root: 'bg-branch-global',
  LEFT: 'bg-branch-left',
  RIGHT: 'bg-branch-right',
};

/** Soft tint behind the avatar ring, matching the branch identity. */
const legRing: Record<'root' | PlacementLeg, string> = {
  root: 'ring-branch-global/40',
  LEFT: 'ring-branch-left/40',
  RIGHT: 'ring-branch-right/40',
};

function KpiCell({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Target;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-0.5">
      <span className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', accent)} aria-hidden />
        <span className="text-[15px] font-semibold leading-none tabular-nums text-treeNode-foreground">
          {value}
        </span>
      </span>
      <span className="truncate pl-[1.375rem] text-[10px] font-medium uppercase leading-none tracking-wide text-treeNode-foreground/45">
        {label}
      </span>
    </div>
  );
}

function MarketerNodeImpl({ data, selected: rfSelected }: NodeProps) {
  const t = useTranslations('genealogia');
  const { node, branchLeg, selected, spillover, onSelect } =
    data as unknown as MarketerNodeData;

  const isSelected = selected || rfSelected;
  const key = branchLeg ?? 'root';

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${node.display_name}, ${node.rank}`}
      onClick={() => onSelect(node)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node);
        }
      }}
      className={cn(
        'group relative isolate flex cursor-pointer flex-col overflow-hidden rounded-xl',
        'bg-treeNode text-treeNode-foreground shadow-card outline-none ring-1 ring-white/10',
        'transition-all duration-base ease-emphasized',
        'hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-ring/60',
        isSelected &&
          '-translate-y-0.5 shadow-glow ring-2 ring-ring',
      )}
    >
      {/* React Flow connection handles (top = incoming, bottom = outgoing). */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-border"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-1.5 !w-1.5 !border-0 !bg-border"
        isConnectable={false}
      />

      {/* Depth: a subtle top-down sheen over the neutral black + branch glow on
          hover/selected, so the card reads as a layered surface (never flat). */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/[0.07] via-transparent to-black/30"
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-px -z-10 rounded-xl opacity-0 blur-md transition-opacity duration-base',
          'group-hover:opacity-30',
          isSelected && '!opacity-40',
          legAccent[key],
        )}
      />

      {/* Branch identity rail (LEFT=viola · RIGHT=verde · root=indigo). */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-1 rounded-l-xl',
          legAccent[key],
        )}
      />

      {/* Header: avatar + identity + activity dot */}
      <div className="flex items-start gap-2.5 px-3.5 pb-2 pt-3">
        <span className="relative shrink-0">
          <Avatar
            name={node.display_name}
            size="md"
            className={cn(
              'ring-2 ring-offset-2 ring-offset-treeNode transition-all duration-base',
              legRing[key],
            )}
          />
          {/* Activity health dot, anchored to the avatar (rolled-up node
              health, doc 14 §7.2). Uses the shared StatusDot for token color +
              accessible Italian label; pulses when "hot". */}
          <StatusDot
            kind="activity"
            value={node.activity}
            pulse={node.activity === 'hot'}
            className="absolute -bottom-1 -right-1 rounded-full bg-treeNode p-0.5 ring-2 ring-treeNode"
          />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight text-treeNode-foreground">
              {node.display_name}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <RankBadge
              rank={node.rank}
              className="border border-white/10 px-2 py-0.5 text-[10px] shadow-xs"
            />
            {spillover && (
              <span className="inline-flex items-center rounded-full border border-dashed border-info/50 bg-info/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-info">
                {t('spillover')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Binary counts */}
      <div className="flex items-center gap-1.5 px-3.5 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-md bg-branch-left/25 px-1.5 py-0.5 font-semibold tabular-nums text-branch-left ring-1 ring-inset ring-branch-left/30">
          <PanelLeft className="h-3 w-3" aria-hidden />
          {formatNumber(node.left_count)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-branch-right/25 px-1.5 py-0.5 font-semibold tabular-nums text-branch-right ring-1 ring-inset ring-branch-right/30">
          <PanelRight className="h-3 w-3" aria-hidden />
          {formatNumber(node.right_count)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-semibold tabular-nums text-treeNode-foreground/85">
          <Users className="h-3 w-3 text-treeNode-foreground/50" aria-hidden />
          {formatNumber(node.team_size)}
        </span>
      </div>

      {/* KPI strip */}
      <div className="mt-auto grid grid-cols-2 items-center divide-x divide-white/10 border-t border-white/10 bg-black/30 py-2">
        <KpiCell
          icon={Target}
          value={formatNumber(node.kpis.prospects)}
          label={t('kpi_prospects')}
          accent="text-info"
        />
        <KpiCell
          icon={TrendingUp}
          value={formatPercent(node.kpis.conversion_rate, 0)}
          label={t('kpi_conversion')}
          accent="text-warning"
        />
      </div>
    </div>
  );
}

export const MarketerNode = React.memo(MarketerNodeImpl);
