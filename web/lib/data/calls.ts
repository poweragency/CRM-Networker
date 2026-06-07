import 'server-only';
import type {
  Call,
  CallOutcome,
  CallStats,
  CallType,
  CallWithTarget,
} from '@/lib/types/db';
import { MOCK_CALLS, MOCK_CALL_TARGETS } from '@/lib/data/mock/calls';
import {
  type CrmResult,
  type MutationResult,
  fetchAllRows,
  getClient,
  getOwnerContext,
  matchesText,
  nowIso,
  ok,
} from '@/lib/data/crm-shared';
import { demoId } from '@/lib/data/mock/_shared';

/**
 * Calls data access (server-only, Supabase-then-MOCK, never throws). Powers the
 * call log, the per-prospect call history and the activity stats strip.
 */

const SELECT =
  'id,org_id,marketer_id,prospect_id,contact_id,call_type,outcome,duration_secs,occurred_at,notes,created_by,created_at,updated_at,deleted_at';

export interface CallFilters {
  search?: string;
  type?: CallType[];
  outcome?: CallOutcome[];
  prospectId?: string;
  contactId?: string;
  /** restrict to the last N days (stats window). */
  sinceDays?: number;
}

function filterMock(filters: CallFilters): CallWithTarget[] {
  const { search = '', type, outcome, prospectId, contactId, sinceDays } = filters;
  const cutoff = sinceDays ? Date.now() - sinceDays * 86_400_000 : null;

  return MOCK_CALLS.filter((c) => !c.deleted_at)
    .filter((c) => {
      if (type?.length && !type.includes(c.call_type)) return false;
      if (outcome?.length && !outcome.includes(c.outcome)) return false;
      if (prospectId && c.prospect_id !== prospectId) return false;
      if (contactId && c.contact_id !== contactId) return false;
      if (cutoff && new Date(c.occurred_at).getTime() < cutoff) return false;
      if (search && !matchesText(MOCK_CALL_TARGETS[c.id], search) && !matchesText(c.notes, search))
        return false;
      return true;
    })
    .map((c) => ({ ...c, target_name: MOCK_CALL_TARGETS[c.id] ?? null }))
    .sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
}

/** List calls (most-recent first), optionally scoped to a prospect/contact. */
export async function listCalls(
  filters: CallFilters = {},
): Promise<CrmResult<CallWithTarget[]>> {
  const supabase = getClient();
  if (!supabase) return ok(filterMock(filters), true);
  try {
    // Paginate so the log/stats stay complete past the row cap. `makeQuery` rebuilds
    // the filtered query per page (awaiting a builder consumes it).
    const cutoff = filters.sinceDays
      ? new Date(Date.now() - filters.sinceDays * 86_400_000).toISOString()
      : null;
    const makeQuery = (from: number, to: number) => {
      let q = supabase.from('calls').select(SELECT).is('deleted_at', null);
      if (filters.type?.length) q = q.in('call_type', filters.type);
      if (filters.outcome?.length) q = q.in('outcome', filters.outcome);
      if (filters.prospectId) q = q.eq('prospect_id', filters.prospectId);
      if (filters.contactId) q = q.eq('contact_id', filters.contactId);
      if (cutoff) q = q.gte('occurred_at', cutoff);
      return q.order('occurred_at', { ascending: false }).range(from, to);
    };
    const data = await fetchAllRows<Call>(makeQuery);
    if (data === null) return ok(filterMock(filters), true);
    // target_name is resolved by the screen (join) — default null here.
    const rows = data.map((c) => ({ ...c, target_name: null }));
    return ok(rows, false);
  } catch {
    return ok(filterMock(filters), true);
  }
}

/** Aggregate call stats for a window (default last 30 days). */
export async function getCallStats(
  sinceDays = 30,
): Promise<CrmResult<CallStats>> {
  const { data, demo } = await listCalls({ sinceDays });
  const stats: CallStats = {
    total: data.length,
    connected: data.filter((c) =>
      ['connesso', 'appuntamento', 'iscritto'].includes(c.outcome),
    ).length,
    duration_secs: data.reduce((acc, c) => acc + c.duration_secs, 0),
    appointments: data.filter((c) => c.outcome === 'appuntamento').length,
    enrollments: data.filter((c) => c.outcome === 'iscritto').length,
    connect_rate: 0,
  };
  stats.connect_rate = stats.total ? stats.connected / stats.total : 0;
  return ok(stats, demo);
}

export interface CallInput {
  call_type: CallType;
  outcome: CallOutcome;
  duration_secs?: number;
  occurred_at?: string;
  prospect_id?: string | null;
  contact_id?: string | null;
  notes?: string | null;
  marketer_id?: string;
}

/** Log a call (real insert when configured; simulated in demo). */
export async function createCall(
  input: CallInput,
): Promise<MutationResult<Call>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();

  const optimistic: Call = {
    id: demoId('cl'),
    org_id: orgId,
    marketer_id: input.marketer_id ?? marketerId,
    prospect_id: input.prospect_id ?? null,
    contact_id: input.contact_id ?? null,
    call_type: input.call_type,
    outcome: input.outcome,
    duration_secs: input.duration_secs ?? 0,
    occurred_at: input.occurred_at ?? nowIso(),
    notes: input.notes ?? null,
    created_by: marketerId,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  };

  if (!supabase || demo) return { data: optimistic, demo: true, ok: true };

  try {
    const { data, error } = await supabase
      .from('calls')
      .insert({ ...optimistic, id: undefined })
      .select(SELECT)
      .single();
    if (error || !data) return { data: optimistic, demo: false, ok: false };
    return { data: data as Call, demo: false, ok: true };
  } catch {
    return { data: optimistic, demo: false, ok: false };
  }
}
