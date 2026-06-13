'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpFromLine,
  FolderOpen,
  Loader2,
  Locate,
  PanelLeft,
  PanelRight,
  Target,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { RankBadge } from '@/components/ui/rank-badge';
import { StatusDot } from '@/components/ui/status-dot';
import { Separator } from '@/components/ui/separator';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import type { TreeNode } from '@/lib/types/db';
import { prospectStageBreakdownAction } from '@/app/(app)/genealogia/actions';
import type { ProspectStageBreakdown } from '@/lib/data/genealogy';

/**
 * Side detail panel opened on node selection (doc 14 §7.1). Shows a profile
 * summary (identity, rank, status, binary team stats, KPI block), a link to the
 * full profile, and — for Team Leader+ / admin — the "remove from tree" action.
 * (Account access is now created up-front when a member is added, so there is no
 * separate "attiva accesso" step here.)
 */

export interface NodeDetailPanelProps {
  node: TreeNode | null;
  /** Viewer can manage the node (Team Leader+ / admin) — gates removal. */
  canActivate: boolean;
  /** This node is SPILLOVER for the viewer (recruited from outside your line). */
  spillover?: boolean;
  /** This node is the viewer's own root (so neither badge is shown). */
  isRoot?: boolean;
  /** Display name of who actually recruited this person (their sponsor). */
  sponsorName?: string | null;
  onClose: () => void;
  /** Re-root / locate the node in the canvas. */
  onLocate: (node: TreeNode) => void;
  /** Remove the node from the tree (reattaches its single downline). */
  onRemove: (node: TreeNode) => void;
  /** Insert a new marketer ABOVE this node (it slots into the upline's place). */
  onInsertAbove?: (node: TreeNode) => void;
  /** Viewer can insert above (Team Leader+ / admin). */
  canInsertAbove?: boolean;
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

function FunnelCell({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value?: number;
  loading: boolean;
  accent: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 text-center">
      <p className={cn('text-lg font-semibold tabular-nums', accent)}>
        {loading ? '…' : formatNumber(value ?? 0)}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function NodeDetailPanel({
  node,
  canActivate,
  spillover = false,
  isRoot = false,
  sponsorName = null,
  onClose,
  onLocate,
  onRemove,
  onInsertAbove,
  canInsertAbove = false,
  removing,
  className,
}: NodeDetailPanelProps) {
  const t = useTranslations('genealogia');
  const tc = useTranslations('common');
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => setConfirming(false), [node?.id]);

  // Open-prospects-per-stage, loaded on demand when a node is selected.
  const [funnel, setFunnel] = React.useState<ProspectStageBreakdown | null>(null);
  const [loadingFunnel, setLoadingFunnel] = React.useState(false);
  React.useEffect(() => {
    if (!node?.id) return;
    let active = true;
    setFunnel(null);
    setLoadingFunnel(true);
    prospectStageBreakdownAction(node.id)
      .then((b) => {
        if (active) setFunnel(b);
      })
      .finally(() => {
        if (active) setLoadingFunnel(false);
      });
    return () => {
      active = false;
    };
  }, [node?.id]);

  if (!node) return null;

  return (
    <aside
      aria-label={node.display_name}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden bg-card/80',
        className,
      )}
    >
      {/* Header — a compact identity hero with a subtle accent wash + close. */}
      <div className="relative shrink-0 overflow-hidden border-b">
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
              {!isRoot && spillover && (
                <span className="inline-flex items-center rounded-full border border-dashed border-info/50 bg-info/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-info">
                  {t('spillover')}
                </span>
              )}
              {!isRoot && !spillover && (
                <span className="inline-flex items-center rounded-full border border-success/40 bg-success/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                  {t('organic')}
                </span>
              )}
            </div>
            {/* Renewal (rinnovo) state — Attivo (green) / Scaduto (red). */}
            <div className="mt-2">
              <StatusDot value={node.status} showLabel />
            </div>
            {spillover && sponsorName && (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {t('spillover_from', { name: sponsorName })}
              </p>
            )}
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

      {/* Scrollable body — min-h-0 lets it shrink so the footer actions stay visible. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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
              icon={UserPlus}
              label={`${t('kpi_iscrizioni')} (mese)`}
              value={formatNumber(node.kpis.iscrizioni)}
              accent="text-success"
              accentBg="bg-success/12"
            />
            <StatRow
              icon={TrendingUp}
              label={`${t('kpi_conversion')} (mese)`}
              value={formatPercent(node.kpis.conversion_rate)}
              accent="text-warning"
              accentBg="bg-warning/12"
            />
          </div>
        </section>

        <Separator />

        {/* Prospect APERTI per fase del funnel (caricati alla selezione del nodo). */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Prospect per fase
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <FunnelCell label="B. Info" value={funnel?.businessInfo} loading={loadingFunnel} accent="text-info" />
            <FunnelCell label="Follow-up" value={funnel?.followUp} loading={loadingFunnel} accent="text-primary" />
            <FunnelCell label="Closing" value={funnel?.closing} loading={loadingFunnel} accent="text-warning" />
            <FunnelCell label="Check Soldi" value={funnel?.checkSoldi} loading={loadingFunnel} accent="text-success" />
          </div>
        </section>
      </div>

      {/* Footer actions — shrink-0 so every button stays visible at 100% zoom. */}
      <div className="shrink-0 space-y-2 border-t bg-muted/30 p-4">
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

        {/* "Vai al nodo" (re-center) is hidden on mobile to de-clutter the sheet —
            on a small canvas it's of little use; kept on desktop (sm+). */}
        <Button
          variant="outline"
          className="hidden w-full sm:flex"
          onClick={() => onLocate(node)}
        >
          <Locate aria-hidden />
          {t('view_node')}
        </Button>

        {/* Insert ABOVE — slots a new marketer into this node's place under the
            upline, with this node hanging below it on the LEFT leg. Team Leader+
            only (canInsertAbove); hidden for the root. */}
        {canInsertAbove && onInsertAbove && node.parent_id && (
          <Button
            variant="outline"
            className="w-full border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => onInsertAbove(node)}
          >
            <ArrowUpFromLine aria-hidden />
            {t('insert_above')}
          </Button>
        )}

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
