'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  FolderOpen,
  KeyRound,
  Locate,
  PanelLeft,
  PanelRight,
  Phone,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { RankBadge } from '@/components/ui/rank-badge';
import { Separator } from '@/components/ui/separator';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import type { TreeNode } from '@/lib/types/db';
import { isCrmEligibleRank } from './permissions';

/**
 * Side detail panel opened on node selection (doc 14 §7.1). Shows a profile
 * summary (identity, rank, status, binary team stats, KPI block) and the
 * "Attiva accesso CRM" action. The action is surfaced only when: the viewer is
 * allowed (role admin/owner OR rank ≥ team_leader), the TARGET rank is CRM-
 * eligible (consultant upward — not executive/no_rank/cliente), and the target is
 * not already active. Clicking it opens the activation dialog (email + password),
 * handled by the parent.
 */

export interface NodeDetailPanelProps {
  node: TreeNode | null;
  /** Viewer can perform "Attiva accesso CRM". */
  canActivate: boolean;
  /** True in demo / no-env mode (activation is simulated). */
  demo: boolean;
  /** Target ids that already had CRM access granted this session. */
  activatedIds: ReadonlySet<string>;
  /** Open the activation dialog for this node. */
  onActivate: (node: TreeNode) => void;
  onClose: () => void;
  /** Re-root / locate the node in the canvas. */
  onLocate: (node: TreeNode) => void;
  className?: string;
}

function StatRow({
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
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={cn('h-4 w-4', accent ?? 'text-muted-foreground')} aria-hidden />
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export function NodeDetailPanel({
  node,
  canActivate,
  demo,
  activatedIds,
  onActivate,
  onClose,
  onLocate,
  className,
}: NodeDetailPanelProps) {
  const t = useTranslations('genealogia');
  const tc = useTranslations('common');

  if (!node) return null;

  const activated = activatedIds.has(node.id);
  // Offer activation only when: the viewer is allowed, the TARGET rank is CRM-
  // eligible (consultant+), the profile plausibly still needs one, and it wasn't
  // just activated this session.
  const showActivate =
    canActivate &&
    isCrmEligibleRank(node.rank) &&
    node.status !== 'active' &&
    !activated;

  return (
    <aside
      aria-label={node.display_name}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden bg-card',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b p-4">
        <Avatar name={node.display_name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight text-foreground">
            {node.display_name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <RankBadge rank={node.rank} />
            <Badge variant={node.status === 'active' ? 'success' : 'danger'}>
              {node.status === 'active'
                ? t('profile_activated')
                : t('profile_not_activated')}
            </Badge>
          </div>
        </div>
        <button
          type="button"
          aria-label={tc('close')}
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Binary team */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('team_size')}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-branch-left/5 p-2.5 text-center">
              <PanelLeft className="mx-auto h-4 w-4 text-branch-left" aria-hidden />
              <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                {formatNumber(node.left_count)}
              </p>
              <p className="text-[11px] text-muted-foreground">{t('left_count')}</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-2.5 text-center">
              <Users className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden />
              <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                {formatNumber(node.team_size)}
              </p>
              <p className="text-[11px] text-muted-foreground">{t('team_size')}</p>
            </div>
            <div className="rounded-lg border bg-branch-right/5 p-2.5 text-center">
              <PanelRight className="mx-auto h-4 w-4 text-branch-right" aria-hidden />
              <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                {formatNumber(node.right_count)}
              </p>
              <p className="text-[11px] text-muted-foreground">{t('right_count')}</p>
            </div>
          </div>
        </section>

        <Separator />

        {/* KPIs */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            KPI
          </h3>
          <div className="space-y-2">
            <StatRow
              icon={Target}
              label={t('kpi_prospects')}
              value={formatNumber(node.kpis.prospects)}
              accent="text-info"
            />
            <StatRow
              icon={Phone}
              label={t('kpi_calls')}
              value={formatNumber(node.kpis.calls)}
              accent="text-primary"
            />
            <StatRow
              icon={UserPlus}
              label={t('kpi_iscrizioni')}
              value={formatNumber(node.kpis.iscrizioni)}
              accent="text-success"
            />
            <StatRow
              icon={TrendingUp}
              label={t('kpi_conversion')}
              value={formatPercent(node.kpis.conversion_rate)}
              accent="text-warning"
            />
          </div>
        </section>
      </div>

      {/* Footer actions */}
      <div className="space-y-2 border-t p-4">
        <Link href={`/team/${node.id}`} className={cn(buttonVariants(), 'w-full')}>
          <FolderOpen aria-hidden />
          {t('open_profile')}
        </Link>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => onLocate(node)}
        >
          <Locate aria-hidden />
          {t('view_node')}
        </Button>

        {activated ? (
          <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
            <span className="font-medium">{t('activate_crm_done')}</span>
          </div>
        ) : showActivate ? (
          <div className="space-y-1.5">
            <Button className="w-full" onClick={() => onActivate(node)}>
              <KeyRound aria-hidden />
              {t('activate_crm')}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              {demo ? t('activate_crm_demo') : t('activate_crm_hint')}
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
