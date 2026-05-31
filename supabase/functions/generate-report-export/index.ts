// =============================================================================
// generate-report-export — synchronous report renderer (doc 15 §4–5).
//
// Invoked by an authenticated, CRM-eligible caller. Calls assemble_report_dataset
// under the caller's JWT (SECURITY INVOKER → closure RLS scopes every read to the
// caller's visible subtree), then renders the versioned dataset to the requested
// format and returns it as a download. CSV + JSON are rendered here; PDF/XLSX
// binary rendering is a follow-up (returns 501). The large/async path
// (report_export_jobs + drain) is separate (doc 15 §11).
//
// Request  (POST, verify_jwt=true): { envelope: <assemble envelope>, format }
//   envelope: { report_type, scope:{kind,marketer_id,branch_side},
//               period:{granularity,period_start,period_end,history_periods},
//               options? }
// Response (200): the rendered file (Content-Disposition: attachment).
// =============================================================================
import { preflight } from '../_shared/cors.ts';
import { error, fileResponse, mapPgError } from '../_shared/http.ts';
import { userClient } from '../_shared/supabase.ts';

interface Body {
  envelope?: Record<string, unknown>;
  format?: 'csv' | 'json' | 'pdf' | 'xlsx';
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return error('method_not_allowed', 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return error('invalid_json', 400);
  }

  const envelope = body.envelope;
  const format = body.format ?? 'csv';
  const reportType =
    envelope && typeof envelope.report_type === 'string' ? envelope.report_type : null;
  if (!envelope || !reportType) return error('report_type_required', 400);
  if (format === 'pdf' || format === 'xlsx') {
    return error('format_not_implemented', 501, `${format} rendering is a follow-up`);
  }

  const supabase = userClient(req);
  const { data: dataset, error: rpcError } = await supabase.rpc(
    'assemble_report_dataset',
    { p_envelope: envelope },
  );
  if (rpcError) {
    const { status, code } = mapPgError(rpcError.message);
    return error(code, status, rpcError.message);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${reportType}_${stamp}`;

  if (format === 'json') {
    return fileResponse(
      JSON.stringify(dataset, null, 2),
      `${base}.json`,
      'application/json',
    );
  }

  // CSV: flatten the report-specific `data` block to rows.
  const rows = flattenToRows((dataset as Record<string, unknown>)?.data);
  return fileResponse(toCsv(rows), `${base}.csv`, 'text/csv; charset=utf-8');
});

/**
 * Coerce an arbitrary report `data` block into tabular rows:
 *  - array of objects → as-is
 *  - object with a single array property → that array
 *  - flat object → one [{key, value}] row per top-level entry
 */
function flattenToRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const arrayProp = Object.values(obj).find((v) => Array.isArray(v));
    if (Array.isArray(arrayProp)) return arrayProp as Record<string, unknown>[];
    return Object.entries(obj).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : value,
    }));
  }
  return [];
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (v: unknown): string => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}
