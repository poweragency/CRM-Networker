import type {
  ExportJob,
  MetricsPayload,
  MonthlyReport,
} from '@/lib/types/db';
import { daysAgo } from '@/lib/data/mock/_shared';

/**
 * Deterministic demo reporting data so /report renders fully with no env
 * (RESILIENCE). A short monthly history for the viewer (Marco) plus the
 * org-level roll-up, with MoM deltas computed exactly like the DB
 * (jsonb_delta / jsonb_delta_pct), and a few export jobs in varied states.
 * Pure — safe to import from the server-only data layer.
 */

function payload(p: Partial<MetricsPayload> & { conoscitiva: number; iscrizione: number }): MetricsPayload {
  const calls_total = p.calls_total ?? Math.round(p.conoscitiva * 3.4);
  return {
    calls_total,
    calls_connected: p.calls_connected ?? Math.round(calls_total * 0.62),
    calls_duration_secs: p.calls_duration_secs ?? calls_total * 300,
    new_prospects: p.new_prospects ?? p.conoscitiva,
    conoscitiva: p.conoscitiva,
    business_info: p.business_info ?? Math.round(p.conoscitiva * 0.72),
    follow_up: p.follow_up ?? Math.round(p.conoscitiva * 0.54),
    closing: p.closing ?? Math.round(p.conoscitiva * 0.36),
    check_soldi: p.check_soldi ?? Math.round(p.conoscitiva * 0.26),
    iscrizione: p.iscrizione,
    enrollments: p.iscrizione,
    new_recruits: p.new_recruits ?? Math.round(p.iscrizione * 0.7),
    team_size: p.team_size ?? 20,
    active_members: p.active_members ?? 15,
    conv_overall: p.conoscitiva > 0 ? Number((p.iscrizione / p.conoscitiva).toFixed(4)) : 0,
  };
}

const NUMERIC_KEYS: (keyof MetricsPayload)[] = [
  'calls_total',
  'calls_connected',
  'calls_duration_secs',
  'new_prospects',
  'conoscitiva',
  'business_info',
  'follow_up',
  'closing',
  'check_soldi',
  'iscrizione',
  'enrollments',
  'new_recruits',
  'team_size',
  'active_members',
  'conv_overall',
];

function deltas(cur: MetricsPayload, prev: MetricsPayload | null) {
  if (!prev) return { deltas: null, delta_pct: null };
  const d: Partial<Record<keyof MetricsPayload, number>> = {};
  const dp: Partial<Record<keyof MetricsPayload, number>> = {};
  for (const k of NUMERIC_KEYS) {
    d[k] = Number((cur[k] - prev[k]).toFixed(4));
    dp[k] = prev[k] !== 0 ? Number(((cur[k] - prev[k]) / Math.abs(prev[k])).toFixed(4)) : 0;
  }
  return { deltas: d, delta_pct: dp };
}

// Monthly history for Marco (newest first), each diffed against the prior month.
const MAR = payload({ conoscitiva: 130, iscrizione: 8, team_size: 18, active_members: 13 });
const APR = payload({ conoscitiva: 152, iscrizione: 9, team_size: 19, active_members: 14 });
const MAY = payload({ conoscitiva: 168, iscrizione: 11, team_size: 21, active_members: 16 });

// Org-level roll-up for May (whole tenant) — visible to admins/owners.
const MAY_ORG = payload({ conoscitiva: 412, iscrizione: 30, team_size: 21, active_members: 16 });
const APR_ORG = payload({ conoscitiva: 388, iscrizione: 26, team_size: 20, active_members: 15 });

export function mockReports(): MonthlyReport[] {
  return [
    {
      id: 'rep-2026-05-nroot',
      marketer_id: 'nroot',
      subject_name: 'Marco De Santis',
      period: 'monthly',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      metrics: MAY,
      previous_metrics: APR,
      ...deltas(MAY, APR),
      generated_at: daysAgo(1),
    },
    {
      id: 'rep-2026-05-org',
      marketer_id: null,
      subject_name: null,
      period: 'monthly',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      metrics: MAY_ORG,
      previous_metrics: APR_ORG,
      ...deltas(MAY_ORG, APR_ORG),
      generated_at: daysAgo(1),
    },
    {
      id: 'rep-2026-04-nroot',
      marketer_id: 'nroot',
      subject_name: 'Marco De Santis',
      period: 'monthly',
      period_start: '2026-04-01',
      period_end: '2026-04-30',
      metrics: APR,
      previous_metrics: MAR,
      ...deltas(APR, MAR),
      generated_at: daysAgo(31),
    },
    {
      id: 'rep-2026-03-nroot',
      marketer_id: 'nroot',
      subject_name: 'Marco De Santis',
      period: 'monthly',
      period_start: '2026-03-01',
      period_end: '2026-03-31',
      metrics: MAR,
      previous_metrics: null,
      deltas: null,
      delta_pct: null,
      generated_at: daysAgo(62),
    },
  ];
}

export function mockExportJobs(): ExportJob[] {
  return [
    {
      id: 'job-1',
      report_type: 'monthly_performance',
      format: 'pdf',
      status: 'ready',
      row_count: 1,
      bytes: 248_500,
      error_code: null,
      created_at: daysAgo(1, 1),
      finished_at: daysAgo(1, 1),
      expires_at: daysAgo(-6),
    },
    {
      id: 'job-2',
      report_type: 'team_report',
      format: 'xlsx',
      status: 'rendering',
      row_count: 21,
      bytes: null,
      error_code: null,
      created_at: daysAgo(0, 1),
      finished_at: null,
      expires_at: null,
    },
    {
      id: 'job-3',
      report_type: 'funnel_report',
      format: 'csv',
      status: 'queued',
      row_count: null,
      bytes: null,
      error_code: null,
      created_at: daysAgo(0),
      finished_at: null,
      expires_at: null,
    },
    {
      id: 'job-4',
      report_type: 'leaderboard_export',
      format: 'csv',
      status: 'expired',
      row_count: 20,
      bytes: 14_300,
      error_code: null,
      created_at: daysAgo(9),
      finished_at: daysAgo(9),
      expires_at: daysAgo(2),
    },
  ];
}
