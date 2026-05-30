'use client';

import * as React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  ChevronDown,
  ChevronRight,
  PanelLeft,
  PanelRight,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { RankBadge } from '@/components/ui/rank-badge';
import { StatusDot } from '@/components/ui/status-dot';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import type { PlacementLeg, TreeNode } from '@/lib/types/db';
import { NODE_HEIGHT, NODE_WIDTH } from './layout';

/**
 * Custom React Flow node — the binary genealogy mini-card (doc 14 §7.1/§7.5).
 *
 * Shows identity (avatar, display_name, RankBadge), an activity indicator dot, the
 * binary team counts (left/right + total) and the three headline KPIs (prospects,
 * iscrizioni, conversion %). The whole card is the selection target; a dedicated
 * chevron toggles lazy expand/collapse without selecting. Branch identity is
 * carried by the left border accent (LEFT=viola, RIGHT=verde, root=blu).
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
  onToggle: (node: TreeNode) => void;
  onSelect: (node: TreeNode) => void;
}

const legAccent: Record<'root' | PlacementLeg, string> = {
  root: 'border-l-branch-global',
  LEFT: 'border-l-branch-left',
  RIGHT: 'border-l-branch-right',
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
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-1">
      <span className="flex items-center gap-1">
        <Icon className={cn('h-3 w-3', accent)} aria-hidden />
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </span>
      <span className="truncate text-[10px] leading-none text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function MarketerNodeImpl({ data, selected: rfSelected }: NodeProps) {
  const t = useTranslations('genealogia');
  const {
    node,
    branchLeg,
    selected,
    expanded,
    hasChildren,
    onToggle,
    onSelect,
  } = data as unknown as MarketerNodeData;

  const isSelected = selected || rfSelected;
  const accent = legAccent[branchLeg ?? 'root'];

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
        'group relative flex cursor-pointer flex-col rounded-xl border border-l-[3px] bg-card text-card-foreground shadow-sm outline-none transition-all',
        'hover:shadow-md hover:border-ring/50',
        accent,
        isSelected && 'ring-2 ring-ring shadow-md',
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

      {/* Header: avatar + identity + activity dot */}
      <div className="flex items-start gap-2.5 px-3 pb-2 pt-2.5">
        <Avatar name={node.display_name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight text-foreground">
              {node.display_name}
            </span>
            <StatusDot
              kind="activity"
              value={node.activity}
              pulse={node.activity === 'hot'}
              className="shrink-0"
            />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <RankBadge rank={node.rank} className="px-1.5 py-0 text-[10px]" />
          </div>
        </div>
      </div>

      {/* Binary counts */}
      <div className="flex items-center gap-1 px-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded bg-branch-left/10 px-1.5 py-0.5 font-medium text-branch-left">
          <PanelLeft className="h-3 w-3" aria-hidden />
          {formatNumber(node.left_count)}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-branch-right/10 px-1.5 py-0.5 font-medium text-branch-right">
          <PanelRight className="h-3 w-3" aria-hidden />
          {formatNumber(node.right_count)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-foreground">
          <Users className="h-3 w-3 text-muted-foreground" aria-hidden />
          {formatNumber(node.team_size)}
        </span>
      </div>

      {/* KPI strip */}
      <div className="mt-auto grid grid-cols-3 items-center gap-1 border-t px-1 py-2">
        <KpiCell
          icon={Target}
          value={formatNumber(node.kpis.prospects)}
          label={t('kpi_prospects')}
          accent="text-info"
        />
        <KpiCell
          icon={UserPlus}
          value={formatNumber(node.kpis.iscrizioni)}
          label={t('kpi_iscrizioni')}
          accent="text-success"
        />
        <KpiCell
          icon={Target}
          value={formatPercent(node.kpis.conversion_rate, 0)}
          label={t('kpi_conversion')}
          accent="text-warning"
        />
      </div>

      {/* Expand / collapse toggle (does not select) */}
      {hasChildren && (
        <button
          type="button"
          aria-label={expanded ? t('collapse') : t('expand')}
          title={expanded ? t('collapse') : t('expand')}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node);
          }}
          className={cn(
            'absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors',
            'hover:border-ring/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}

export const MarketerNode = React.memo(MarketerNodeImpl);
