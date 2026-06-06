'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  FolderOpen,
  KeyRound,
  Loader2,
  Locate,
  PanelLeft,
  PanelRight,
  Phone,
  Target,
  Trash2,
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
import { StatusDot } from '@/components/ui/status-dot';
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
  /** Remove the node from the tree (reattaches its single downline). */
  onRemove: (node: TreeNode) => void;
  /** A removal is in flight. */
  removing: boolean;
  className?: string;
}

function StatRow({
  icon: Icon,
  label,
  value,
  accent,
  accentBg,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  accent?: string;
  accentBg?: string;
}) {
  return (
    <div className="group flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 transition-colors duration-base hover:border-border hover:bg-muted/40">
      <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            accentBg ?? 'bg-muted',
          )}
        >
          <Icon
            className={cn('h-4 w-4', accent ?? 'text-muted-foreground')}
            aria-hidden
          />
        </span>
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
  onRemove,
  removing,
  className,
}: NodeDetailPanelProps) {
  const t = useTranslations('genealogia');
  const tc = useTranslations('common');
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => setConfirming(false), [node?.id]);

  if (!node) return null;

  const activated = activatedIds.has(node.id);
  // Offer activation only when: the viewer is allowed, the TARGET rank is CRM-
  // eligible (consultant+), the profile plausibly still needs one, and it wasn't
  // just activated this session.
  const showActivate =
    canActivate &&
    isCrmEligibleRank(node.rank) &&
    !node.crm_access &&
    !activated;

  return (
    <aside
      aria-label={node.display_name}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden bg-card/80',
        className,
      )}
    >
      {/* Header — a compact identity hero with a subtle accent wash + close. */}
      <div className="relative overflow-hidden border-b">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/[0.03] to-transparent"
        />
        <div className="relative flex items-start gap-3 p-4">
          <Avatar
            name={node.display_name}
            size="lg"
            className="ring-2 ring-primary/20 ring-offset-2 ring-offset-card"
          />
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="truncate text-base font-semibold leading-tight text-foreground">
              {node.display_name}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RankBadge rank={node.rank} />
              <Badge
                variant={node.crm_access || activated ? 'success' : 'secondary'}
              >
                {node.crm_access || activated
                  ? t('crm_active')
                  : t('crm_inactive')}
              </Badge>
            </div>
            <div className="mt-2">
              <StatusDot kind="activity" value={node.activity} showLabel />
            </div>
          </div>
          <button
            type="button"
            aria-label={tc('close')}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-base hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Binary team */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('team_size')}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="relative overflow-hidden rounded-lg border border-branch-left/20 bg-branch-left/10 p-2.5 text-center">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-branch-left/60"
              />
              <PanelLeft
                className="mx-auto h-4 w-4 text-branch-left"
                aria-hidden
              />
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(node.left_count)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('left_count')}
              </p>
            </div>
            <div className="relative overflow-hidden rounded-lg border bg-muted/50 p-2.5 text-center">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-primary/60"
              />
              <Users
                className="mx-auto h-4 w-4 text-primary"
                aria-hidden
              />
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(node.team_size)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('team_size')}
              </p>
            </div>
            <div className="relative overflow-hidden rounded-lg border border-branch-right/20 bg-branch-right/10 p-2.5 text-center">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-branch-right/60"
              />
              <PanelRight
                className="mx-auto h-4 w-4 text-branch-right"
                aria-hidden
              />
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(node.right_count)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('right_count')}
              </p>
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
              accentBg="bg-info/12"
            />
            <StatRow
              icon={Phone}
              label={t('kpi_calls')}
              value={formatNumber(node.kpis.calls)}
              accent="text-primary"
              accentBg="bg-primary/12"
            />
            <StatRow
              icon={UserPlus}
              label={t('kpi_iscrizioni')}
              value={formatNumber(node.kpis.iscrizioni)}
              accent="text-success"
              accentBg="bg-success/12"
            />
            <StatRow
              icon={TrendingUp}
              label={t('kpi_conversion')}
              value={formatPercent(node.kpis.conversion_rate)}
              accent="text-warning"
              accentBg="bg-warning/12"
            />
          </div>
        </section>
      </div>

      {/* Footer actions */}
      <div className="space-y-2 border-t bg-muted/30 p-4">
        <Link
          href={`/team/${node.id}`}
          className={cn(
            buttonVariants(),
            'w-full shadow-sm transition-all duration-base hover:shadow-glow',
          )}
        >
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

        {/* Remove from the tree — only for Team Leader+ (canActivate); hidden for
            the root; blocked when both legs are occupied; else a two-step confirm. */}
        {canActivate && node.parent_id && (
          <div className="border-t pt-2">
            {node.has_left_child && node.has_right_child ? (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{t('remove_two_lines')}</span>
              </div>
            ) : confirming ? (
              <div className="space-y-1.5">
                <p className="text-center text-[11px] text-muted-foreground">
                  {t('remove_confirm')}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setConfirming(false)}
                    disabled={removing}
                  >
                    {t('remove_cancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => onRemove(node)}
                    disabled={removing}
                  >
                    {removing ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                    {t('remove')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="w-full text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setConfirming(true)}
              >
                <Trash2 aria-hidden />
                {t('remove')}
              </Button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
