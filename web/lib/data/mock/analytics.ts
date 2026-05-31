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
import { daysAgo } from '@/lib/data/mock/_shared';

/**
 * Deterministic demo analytics so /analytics renders fully when Supabase env is
 * missing OR a query fails (RESILIENCE). Numbers are hand-authored to read like
 * the demo org (Marco De Santis' subtree) and to stay internally consistent:
 * GLOBAL = self + LEFT + RIGHT, and the funnel narrows monotonically.
 *
 * Pure data + tiny pure selectors — safe to import from the server-only data
 * layer. No randomness in the render path (stable builds).
 */

/** Self-only activity (Marco) — contributes to GLOBAL but to no single leg. */
const SELF: SubtreeMetrics = {
  calls_total: 142,
  calls_connected: 96,
  calls_duration_secs: 142 * 318,
  new_prospects: 38,
  conoscitiva: 38,
  business_info: 29,
  follow_up: 22,
  closing: 16,
  check_soldi: 13,
  iscrizione: 11,
  new_recruits: 2,
};

const LEFT: SubtreeMetrics = {
  calls_total: 196,
  calls_connected: 121,
  calls_duration_secs: 196 * 286,
  new_prospects: 58,
  conoscitiva: 58,
  business_info: 41,
  follow_up: 30,
  closing: 19,
  check_soldi: 15,
  iscrizione: 12,
  new_recruits: 4,
};

const RIGHT: SubtreeMetrics = {
  calls_total: 151,
  calls_connected: 88,
  calls_duration_secs: 151 * 274,
  new_prospects: 44,
  conoscitiva: 44,
  business_info: 30,
  follow_up: 21,
  closing: 13,
  check_soldi: 9,
  iscrizione: 7,
  new_recruits: 3,
};

function add(a: SubtreeMetrics, b: SubtreeMetrics): SubtreeMetrics {
  return {
    calls_total: a.calls_total + b.calls_total,
    calls_connected: a.calls_connected + b.calls_connected,
    calls_duration_secs: a.calls_duration_secs + b.calls_duration_secs,
    new_prospects: a.new_prospects + b.new_prospects,
    conoscitiva: a.conoscitiva + b.conoscitiva,
    business_info: a.business_info + b.business_info,
    follow_up: a.follow_up + b.follow_up,
    closing: a.closing + b.closing,
    check_soldi: a.check_soldi + b.check_soldi,
    iscrizione: a.iscrizione + b.iscrizione,
    new_recruits: a.new_recruits + b.new_recruits,
  };
}

const GLOBAL: SubtreeMetrics = add(add(SELF, LEFT), RIGHT);

const BY_SCOPE: BranchMetrics = { GLOBAL, LEFT, RIGHT };

/** Subtree activity totals for a scope. */
export function mockSubtreeMetrics(scope: BranchScope): SubtreeMetrics {
  return BY_SCOPE[scope];
}

/** The full per-branch breakdown (for the branch-comparison view). */
export function mockBranchMetrics(): BranchMetrics {
  return BY_SCOPE;
}

/**
 * Current funnel occupancy (open prospects per stage) for a scope. `reached`
 * mirrors the cumulative stage entries from {@link mockSubtreeMetrics}; `open`
 * is the live count still parked in the stage (a slice of those that reached).
 */
const OPEN_FRACTION: Record<ProspectStage, number> = {
  conoscitiva: 0.34,
  business_info: 0.31,
  follow_up: 0.28,
  closing: 0.22,
  check_soldi: 0.18,
  iscrizione: 0, // terminal — enrolled prospects leave the open pipeline
};

export function mockFunnelOccupancy(scope: BranchScope): FunnelStageOccupancy[] {
  const m = BY_SCOPE[scope];
  const reached: Record<ProspectStage, number> = {
    conoscitiva: m.conoscitiva,
    business_info: m.business_info,
    follow_up: m.follow_up,
    closing: m.closing,
    check_soldi: m.check_soldi,
    iscrizione: m.iscrizione,
  };
  return STAGE_ORDER.map((stage) => ({
    stage,
    reached: reached[stage],
    open: Math.round(reached[stage] * OPEN_FRACTION[stage]),
  }));
}

/** Per-stage conversion totals for a scope (entered/exited + avg time-in-stage). */
const AVG_DAYS_IN_STAGE: Record<ProspectStage, number> = {
  conoscitiva: 2.1,
  business_info: 3.4,
  follow_up: 5.8,
  closing: 4.2,
  check_soldi: 2.7,
  iscrizione: 1.0,
};

export function mockStageConversion(scope: BranchScope): StageConversion[] {
  const m = BY_SCOPE[scope];
  const entered: Record<ProspectStage, number> = {
    conoscitiva: m.conoscitiva,
    business_info: m.business_info,
    follow_up: m.follow_up,
    closing: m.closing,
    check_soldi: m.check_soldi,
    iscrizione: m.iscrizione,
  };
  return STAGE_ORDER.map((stage, i) => {
    const next = STAGE_ORDER[i + 1];
    // exited = those who moved on to the next stage (≈ entries into next).
    const exited = next ? entered[next] : Math.round(entered[stage] * 0.9);
    return {
      stage,
      entered: entered[stage],
      exited: Math.min(exited, entered[stage]),
      avg_time_in_stage_secs: Math.round(AVG_DAYS_IN_STAGE[stage] * 86_400),
    };
  });
}

/**
 * 30-day activity trend (org-local days, newest last). Deterministic gentle
 * weekly wave so the sparkline/area reads like real activity without randomness.
 */
export function mockMetricTrend(days = 30): MetricDayPoint[] {
  const out: MetricDayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dow = i % 7;
    const weekend = dow === 5 || dow === 6 ? 0.45 : 1;
    const wave = 1 + 0.35 * Math.sin((days - i) / 3.3);
    const calls = Math.max(0, Math.round(16 * wave * weekend));
    const newProspects = Math.max(0, Math.round(4.6 * wave * weekend));
    const iscrizioni = Math.max(0, Math.round(1.0 * wave * weekend - (dow === 0 ? 0.4 : 0)));
    out.push({
      date: daysAgo(i).slice(0, 10),
      calls,
      new_prospects: newProspects,
      iscrizioni,
    });
  }
  return out;
}

/** Open bottleneck findings across the demo subtree (newest first). */
export function mockBottlenecks(): BottleneckFinding[] {
  return [
    {
      id: 'bn-1',
      marketer_id: 'nR',
      marketer_name: 'Luca Ferrari',
      type: 'weak_conversion',
      severity: 'critical',
      stage: 'closing',
      metric_value: 0.31,
      threshold_value: 0.45,
      title_it: 'Conversione Closing → Check Soldi sotto soglia',
      recommendation_it:
        'Solo il 31% dei prospect supera la fase di Closing (soglia 45%). Rivedi gli script di chiusura e affianca il team in 2-3 chiamate.',
      detected_at: daysAgo(1),
      period_start: daysAgo(30).slice(0, 10),
      period_end: daysAgo(0).slice(0, 10),
      resolved_at: null,
    },
    {
      id: 'bn-2',
      marketer_id: 'nLR',
      marketer_name: 'Davide Greco',
      type: 'stage_delay',
      severity: 'warning',
      stage: 'follow_up',
      metric_value: 9.4,
      threshold_value: 7,
      title_it: 'Tempo medio in Follow-up troppo alto',
      recommendation_it:
        'I prospect restano in media 9,4 giorni in Follow-up (soglia 7). Pianifica i prossimi contatti entro 48h dall’ultima interazione.',
      detected_at: daysAgo(2),
      period_start: daysAgo(30).slice(0, 10),
      period_end: daysAgo(0).slice(0, 10),
      resolved_at: null,
    },
    {
      id: 'bn-3',
      marketer_id: 'nRR',
      marketer_name: 'Paolo Russo',
      type: 'inactivity',
      severity: 'warning',
      stage: null,
      metric_value: 18,
      threshold_value: 14,
      title_it: 'Nessuna attività da 18 giorni',
      recommendation_it:
        'Paolo non registra chiamate né avanzamenti di fase da 18 giorni. Contattalo per capire come supportarlo.',
      detected_at: daysAgo(3),
      period_start: daysAgo(30).slice(0, 10),
      period_end: daysAgo(0).slice(0, 10),
      resolved_at: null,
    },
    {
      id: 'bn-4',
      marketer_id: 'nLL',
      marketer_name: 'Sara Conti',
      type: 'followup_overdue',
      severity: 'info',
      stage: null,
      metric_value: 6,
      threshold_value: 5,
      title_it: '6 follow-up in ritardo',
      recommendation_it:
        'Ci sono 6 follow-up con data superata. Riprogrammali per non perdere i prospect più caldi.',
      detected_at: daysAgo(4),
      period_start: daysAgo(30).slice(0, 10),
      period_end: daysAgo(0).slice(0, 10),
      resolved_at: null,
    },
  ];
}
