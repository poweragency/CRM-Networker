import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import type {
  BottleneckFinding,
  BranchMetrics,
  BranchScope,
  FunnelStageOccupancy,
  MetricDayPoint,
  ProspectStage,
  StageConversion,
  SubtreeMetrics,
} from '@/lib/types/db';
import { STAGE_ORDER } from '@/lib/types/db';
import {
  mockBottlenecks,
  mockBranchMetrics,
  mockFunnelOccupancy,
  mockMetricTrend,
  mockStageConversion,
  mockSubtreeMetrics,
} from '@/lib/data/mock/analytics';

/**
 * Analytics data access (server-only). Composes the secured scope functions
 * (`subtree_metrics`, `branch_metrics`, `funnel_totals_subtree`,
 * `stage_conversion_subtree`) and the `bottleneck_findings` table into the
 * /analytics overview. Every piece attempts Supabase and FALLS BACK to the demo
 * dataset when env is missing OR the call throws — so the page builds and renders
 * with no env (RESILIENCE). The `demo` flag is true when ANY piece fell back.
 */

export interface AnalyticsOverview {
  scope: BranchScope;
  /** Activity totals for the selected scope. */
  summary: SubtreeMetrics;
  /** All three legs (for the branch-comparison view). */
  branch: BranchMetrics;
  funnel: FunnelStageOccupancy[];
  conversion: StageConversion[];
  trend: MetricDayPoint[];
  bottlenecks: BottleneckFinding[];
  demo: boolean;
}

/** ISO date (YYYY-MM-DD) N days before the deterministic demo "now". */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Map a `branch_metrics` RPC row to {@link SubtreeMetrics}. */
function rowToMetrics(r: Record<string, unknown>): SubtreeMetrics {
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    calls_total: n('calls_total'),
    calls_connected: n('calls_connected'),
    calls_duration_secs: n('calls_duration_secs'),
    new_prospects: n('new_prospects'),
    conoscitiva: n('conoscitiva'),
    business_info: n('business_info'),
    follow_up: n('follow_up'),
    closing: n('closing'),
    check_soldi: n('check_soldi'),
    iscrizione: n('iscrizione'),
    new_recruits: n('new_recruits'),
  };
}

/**
 * The /analytics overview for a scope over the trailing 30 days. Resilient: a
 * failure in any sub-query degrades that piece to mock and flips `demo`.
 */
export async function getAnalyticsOverview(
  scope: BranchScope,
): Promise<AnalyticsOverview> {
  const supabase = getClient();
  if (!supabase) {
    return {
      scope,
      summary: mockSubtreeMetrics(scope),
      branch: mockBranchMetrics(),
      funnel: mockFunnelOccupancy(scope),
      conversion: mockStageConversion(scope),
      trend: mockMetricTrend(),
      bottlenecks: mockBottlenecks(),
      demo: true,
    };
  }

  const { orgId, marketerId } = await getOwnerContext();
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86_400_000);
  const p_from = isoDay(from);
  const p_to = isoDay(to);

  let demo = false;

  // Branch breakdown (also yields the per-scope summary).
  let branch: BranchMetrics = mockBranchMetrics();
  try {
    const { data, error } = await supabase.rpc('branch_metrics', {
      p_org_id: orgId,
      p_marketer_id: marketerId,
      p_from,
      p_to,
    });
    if (error || !Array.isArray(data) || data.length === 0) throw error ?? new Error('empty');
    const next = { ...mockBranchMetrics() };
    for (const row of data as Record<string, unknown>[]) {
      const side = String(row.branch_side) as BranchScope;
      if (side === 'GLOBAL' || side === 'LEFT' || side === 'RIGHT') {
        next[side] = rowToMetrics(row);
      }
    }
    branch = next;
  } catch {
    demo = true;
  }
  const summary = branch[scope];

  // Funnel occupancy (subtree-wide).
  let funnel = mockFunnelOccupancy(scope);
  try {
    const { data, error } = await supabase.rpc('funnel_totals_subtree', {
      p_org_id: orgId,
      p_root_marketer_id: marketerId,
    });
    if (error || !Array.isArray(data)) throw error ?? new Error('empty');
    const reached = new Map<ProspectStage, number>();
    const open = new Map<ProspectStage, number>();
    for (const row of data as Record<string, unknown>[]) {
      const stage = String(row.current_stage) as ProspectStage;
      const count = Number(row.prospects_count ?? 0);
      open.set(stage, (open.get(stage) ?? 0) + (row.outcome === 'open' ? count : 0));
      reached.set(stage, (reached.get(stage) ?? 0) + count);
    }
    funnel = STAGE_ORDER.map((stage) => ({
      stage,
      open: open.get(stage) ?? 0,
      reached: reached.get(stage) ?? 0,
    }));
  } catch {
    demo = true;
  }

  // Per-stage conversion (subtree-wide).
  let conversion = mockStageConversion(scope);
  try {
    const { data, error } = await supabase.rpc('stage_conversion_subtree', {
      p_org_id: orgId,
      p_root_marketer_id: marketerId,
      p_from,
      p_to,
    });
    if (error || !Array.isArray(data)) throw error ?? new Error('empty');
    const byStage = new Map<ProspectStage, StageConversion>();
    for (const row of data as Record<string, unknown>[]) {
      const stage = String(row.to_stage) as ProspectStage;
      byStage.set(stage, {
        stage,
        entered: Number(row.entered_count ?? 0),
        exited: Number(row.exited_count ?? 0),
        avg_time_in_stage_secs: Number(row.avg_time_in_stage_secs ?? 0),
      });
    }
    conversion = STAGE_ORDER.map(
      (stage) =>
        byStage.get(stage) ?? {
          stage,
          entered: 0,
          exited: 0,
          avg_time_in_stage_secs: 0,
        },
    );
  } catch {
    demo = true;
  }

  // Open bottleneck findings (subtree-visible via RLS).
  let bottlenecks = mockBottlenecks();
  try {
    const { data, error } = await supabase
      .from('bottleneck_findings')
      .select(
        'id,marketer_id,type,severity,stage,metric_value,threshold_value,title_it,recommendation_it,detected_at,period_start,period_end,resolved_at',
      )
      .is('resolved_at', null)
      .order('detected_at', { ascending: false })
      .limit(12);
    if (error || !data) throw error ?? new Error('empty');
    bottlenecks = (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      marketer_id: String(r.marketer_id),
      marketer_name: null,
      type: r.type as BottleneckFinding['type'],
      severity: r.severity as BottleneckFinding['severity'],
      stage: (r.stage as ProspectStage | null) ?? null,
      metric_value: r.metric_value == null ? null : Number(r.metric_value),
      threshold_value: r.threshold_value == null ? null : Number(r.threshold_value),
      title_it: String(r.title_it),
      recommendation_it: String(r.recommendation_it),
      detected_at: String(r.detected_at),
      period_start: String(r.period_start),
      period_end: String(r.period_end),
      resolved_at: null,
    }));
  } catch {
    demo = true;
  }

  // Daily trend: no single subtree RPC — best-effort own-fact aggregation,
  // otherwise the demo wave.
  let trend = mockMetricTrend();
  try {
    const { data, error } = await supabase
      .from('daily_marketer_metrics')
      .select('metric_date,calls_total,new_prospects,stage_iscrizione')
      .gte('metric_date', p_from)
      .lte('metric_date', p_to)
      .order('metric_date', { ascending: true });
    if (error || !data) throw error ?? new Error('empty');
    const byDay = new Map<string, MetricDayPoint>();
    for (const r of data as Record<string, unknown>[]) {
      const date = String(r.metric_date).slice(0, 10);
      const cur = byDay.get(date) ?? { date, calls: 0, new_prospects: 0, iscrizioni: 0 };
      cur.calls += Number(r.calls_total ?? 0);
      cur.new_prospects += Number(r.new_prospects ?? 0);
      cur.iscrizioni += Number(r.stage_iscrizione ?? 0);
      byDay.set(date, cur);
    }
    if (byDay.size > 0) trend = [...byDay.values()];
    else demo = true;
  } catch {
    demo = true;
  }

  return { scope, summary, branch, funnel, conversion, trend, bottlenecks, demo };
}
