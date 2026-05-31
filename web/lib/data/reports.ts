import 'server-only';
import { getClient, isDemo } from '@/lib/data/crm-shared';
import type {
  ExportFormat,
  ExportJob,
  MetricsPayload,
  MonthlyReport,
  ReportPeriod,
} from '@/lib/types/db';
import { demoId } from '@/lib/data/mock/_shared';
import { mockExportJobs, mockReports } from '@/lib/data/mock/reports';

/**
 * Reporting data access (server-only). Reads the immutable `monthly_reports`
 * snapshots (doc 01 §6.4) and the `report_export_jobs` queue (doc 15 §11.2),
 * and enqueues new exports. Every read attempts Supabase and FALLS BACK to the
 * demo dataset when env is missing OR the query fails (RESILIENCE). Enqueue is
 * optimistic + demo-safe: it returns a `queued` job and never throws.
 */

export interface ReportsResult {
  data: MonthlyReport[];
  demo: boolean;
}

export interface ExportJobsResult {
  data: ExportJob[];
  demo: boolean;
}

export interface EnqueueExportInput {
  reportType: string;
  format: ExportFormat;
  /** Optional report subject (marketer) the export is scoped to. */
  marketerId?: string | null;
}

export interface EnqueueExportResult {
  job: ExportJob;
  demo: boolean;
  ok: boolean;
}

/** Coerce a raw jsonb metrics payload into the typed {@link MetricsPayload}. */
function toPayload(raw: unknown): MetricsPayload {
  const r = (raw ?? {}) as Record<string, unknown>;
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
    enrollments: n('enrollments'),
    new_recruits: n('new_recruits'),
    team_size: n('team_size'),
    active_members: n('active_members'),
    conv_overall: n('conv_overall'),
  };
}

/** The caller's visible report snapshots, newest period first. */
export async function listReports(limit = 24): Promise<ReportsResult> {
  const supabase = getClient();
  if (!supabase) return { data: mockReports(), demo: true };
  try {
    const { data, error } = await supabase
      .from('monthly_reports')
      .select(
        'id,marketer_id,period,period_start,period_end,metrics,previous_metrics,deltas,delta_pct,generated_at,marketers(display_name)',
      )
      .order('period_start', { ascending: false })
      .limit(limit);

    if (error || !data) return { data: mockReports(), demo: true };

    const rows: MonthlyReport[] = (data as Record<string, unknown>[]).map((r) => {
      const m = (r.marketers ?? null) as { display_name?: string } | null;
      return {
        id: String(r.id),
        marketer_id: (r.marketer_id as string | null) ?? null,
        subject_name: m?.display_name ?? null,
        period: r.period as ReportPeriod,
        period_start: String(r.period_start),
        period_end: String(r.period_end),
        metrics: toPayload(r.metrics),
        previous_metrics: r.previous_metrics ? toPayload(r.previous_metrics) : null,
        deltas: (r.deltas as MonthlyReport['deltas']) ?? null,
        delta_pct: (r.delta_pct as MonthlyReport['delta_pct']) ?? null,
        generated_at: String(r.generated_at),
      };
    });
    return { data: rows, demo: false };
  } catch {
    return { data: mockReports(), demo: true };
  }
}

/** The caller's export jobs, newest first. */
export async function listExportJobs(limit = 20): Promise<ExportJobsResult> {
  const supabase = getClient();
  if (!supabase) return { data: mockExportJobs(), demo: true };
  try {
    const { data, error } = await supabase
      .from('report_export_jobs')
      .select(
        'id,report_type,format,status,row_count,bytes,error_code,created_at,finished_at,expires_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return { data: mockExportJobs(), demo: true };

    const rows: ExportJob[] = (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      report_type: String(r.report_type),
      format: r.format as ExportFormat,
      status: r.status as ExportJob['status'],
      row_count: r.row_count == null ? null : Number(r.row_count),
      bytes: r.bytes == null ? null : Number(r.bytes),
      error_code: (r.error_code as string | null) ?? null,
      created_at: String(r.created_at),
      finished_at: (r.finished_at as string | null) ?? null,
      expires_at: (r.expires_at as string | null) ?? null,
    }));
    return { data: rows, demo: false };
  } catch {
    return { data: mockExportJobs(), demo: true };
  }
}

/**
 * Enqueue a report export. Demo-safe & optimistic: returns a freshly `queued`
 * job the UI can prepend immediately. Wiring the hosted `enqueue_export_job`
 * RPC + Edge renderer is a follow-up (the demo simulates the queue).
 */
export async function enqueueExport(
  input: EnqueueExportInput,
): Promise<EnqueueExportResult> {
  const job: ExportJob = {
    id: demoId('job'),
    report_type: input.reportType,
    format: input.format,
    status: 'queued',
    row_count: null,
    bytes: null,
    error_code: null,
    created_at: new Date().toISOString(),
    finished_at: null,
    expires_at: null,
  };
  return { job, demo: isDemo(), ok: true };
}
