import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { getSubtree, TREE_LOAD_DEPTH } from '@/lib/data/genealogy';
import {
  weekdayOf,
  type AttendanceMember,
  type AttendanceSummary,
  type ZoomCallDef,
} from '@/lib/data/attendance-shared';

/**
 * Zoom attendance data access (server-only). Calls are DYNAMIC (table
 * `zoom_calls`): the viewer sees the calls scheduled on the chosen day that are
 * visible to them (org-wide, or team calls of their upline co-admins — RLS
 * enforced), and marks present + cam per person (their visible subtree) against
 * each call id. Demo-safe: no env → the 3 historical calls + deterministic data.
 *
 * SCALE: the grid PAGES through members (attendance_page RPC) instead of loading
 * the whole subtree, and the day-wide gauges are computed server-side
 * (attendance_summary RPC) so they stay exact while the client holds only a page.
 */

export type { AttendanceMember, AttendanceSummary, ZoomCallDef };

export interface AttendanceViewResult {
  date: string;
  calls: ZoomCallDef[];
  /** A page of members (with their present/cam for the day). */
  members: AttendanceMember[];
  /** Count of members MATCHING the search (the grid paginates within this). */
  total: number;
  /** Day-wide counters over the WHOLE subtree (denominator of the gauges). */
  summary: AttendanceSummary;
  demo: boolean;
}

export interface AttendancePageResult {
  members: AttendanceMember[];
  total: number;
  demo: boolean;
}

/** In-memory edit stores (demo-only; reset on server restart). */
const presentOverrides = new Map<string, boolean>();
const camOverrides = new Map<string, boolean>();
const keyOf = (id: string, date: string, callId: string) => `${id}|${date}|${callId}`;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function defaultPresent(id: string, date: string, callId: string): boolean {
  return hash(keyOf(id, date, callId)) % 3 !== 0;
}

/** Demo calls (no env): the 3 historical fixed calls. */
const DEMO_CALLS: ZoomCallDef[] = [
  { id: 'wake_up', title: 'Wake Up Call', weekday: 1, start_time: null, scope: 'org', team_branch: null, created_by: null, created_by_name: null },
  { id: 'golden', title: 'Golden Call', weekday: 4, start_time: null, scope: 'org', team_branch: null, created_by: null, created_by_name: null },
  { id: 'join_the_dream', title: 'Join The Dream', weekday: 0, start_time: null, scope: 'org', team_branch: null, created_by: null, created_by_name: null },
];

function mapCallRow(r: Record<string, unknown>): ZoomCallDef {
  const cr = (r.creator ?? null) as { display_name?: string } | null;
  return {
    id: String(r.id),
    title: String(r.title),
    weekday: Number(r.weekday),
    start_time: (r.start_time as string | null) ?? null,
    scope: (r.scope as 'org' | 'team') ?? 'org',
    team_branch: (r.team_branch as 'left' | 'right' | 'all' | null) ?? null,
    created_by: (r.created_by as string | null) ?? null,
    created_by_name: cr?.display_name ?? null,
  };
}

const byTimeThenTitle = (a: ZoomCallDef, b: ZoomCallDef) =>
  (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
  a.title.localeCompare(b.title, 'it');

const CALL_COLS =
  'id,title,weekday,start_time,scope,team_branch,created_by, creator:created_by(display_name)';

type SupabaseClient = NonNullable<ReturnType<typeof getClient>>;

/** Visible calls scheduled on a date's weekday (RLS scopes org/team visibility). */
async function fetchCalls(supabase: SupabaseClient, date: string): Promise<ZoomCallDef[]> {
  try {
    const { data } = await supabase
      .from('zoom_calls')
      .select(CALL_COLS)
      .eq('weekday', weekdayOf(date))
      .eq('active', true);
    return ((data as Record<string, unknown>[] | null) ?? []).map(mapCallRow).sort(byTimeThenTitle);
  } catch {
    return [];
  }
}

/** attendance_page row → AttendanceMember (present/cam come as sparse jsonb maps). */
function rowToMember(r: Record<string, unknown>): AttendanceMember {
  return {
    id: String(r.id),
    display_name: (r.display_name as string) ?? '',
    rank: r.rank as AttendanceMember['rank'],
    status: r.status as AttendanceMember['status'],
    present: (r.present as Record<string, boolean>) ?? {},
    cam: (r.cam as Record<string, boolean>) ?? {},
  };
}

// ── Demo helpers (no env) ────────────────────────────────────────────────────
async function demoMembers(
  marketerId: string,
  date: string,
  calls: ZoomCallDef[],
): Promise<AttendanceMember[]> {
  const sub = await getSubtree(marketerId, 'GLOBAL', TREE_LOAD_DEPTH, { funnel: false });
  return sub.data
    .map((n) => ({
      id: n.id,
      display_name: n.display_name,
      rank: n.rank,
      status: n.status,
      present: Object.fromEntries(
        calls.map((c) => {
          const k = keyOf(n.id, date, c.id);
          return [c.id, presentOverrides.has(k) ? presentOverrides.get(k)! : defaultPresent(n.id, date, c.id)];
        }),
      ),
      cam: Object.fromEntries(calls.map((c) => [c.id, camOverrides.get(keyOf(n.id, date, c.id)) ?? false])),
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));
}

function summarize(members: AttendanceMember[], calls: ZoomCallDef[]): AttendanceSummary {
  const presentCounts: Record<string, number> = {};
  const camCounts: Record<string, number> = {};
  for (const c of calls) {
    presentCounts[c.id] = members.filter((m) => m.present[c.id]).length;
    camCounts[c.id] = members.filter((m) => m.cam[c.id]).length;
  }
  return { totalMembers: members.length, presentCounts, camCounts };
}

function filterMembers(all: AttendanceMember[], search: string): AttendanceMember[] {
  const needle = search.trim().toLowerCase();
  return needle ? all.filter((m) => m.display_name.toLowerCase().includes(needle)) : all;
}

/**
 * The Presenze view for a day: visible calls, a PAGE of members (with present/cam),
 * the match count, and the day-wide summary. The summary is computed over the whole
 * subtree server-side, so the gauges (X/total, 100%, day %) stay exact while the
 * grid holds only a page.
 */
export async function getAttendanceView(
  date: string,
  opts: { search?: string; offset?: number; limit?: number } = {},
): Promise<AttendanceViewResult> {
  const { marketerId } = await getOwnerContext();
  const supabase = getClient();
  const { search = '', offset = 0, limit = 100 } = opts;

  if (!supabase) {
    const calls = DEMO_CALLS.filter((c) => c.weekday === weekdayOf(date));
    const all = await demoMembers(marketerId, date, calls);
    const matched = filterMembers(all, search);
    return {
      date,
      calls,
      members: matched.slice(offset, offset + limit),
      total: matched.length,
      summary: summarize(all, calls),
      demo: true,
    };
  }

  const [calls, page, summary] = await Promise.all([
    fetchCalls(supabase, date),
    getAttendancePage(date, { search, offset, limit }),
    getAttendanceSummary(date),
  ]);
  return { date, calls, members: page.members, total: page.total, summary, demo: false };
}

/** Just a page of members (with present/cam) + the match count — search / load-more. */
export async function getAttendancePage(
  date: string,
  opts: { search?: string; offset?: number; limit?: number } = {},
): Promise<AttendancePageResult> {
  const { marketerId } = await getOwnerContext();
  const supabase = getClient();
  const { search = '', offset = 0, limit = 100 } = opts;

  if (!supabase) {
    const calls = DEMO_CALLS.filter((c) => c.weekday === weekdayOf(date));
    const matched = filterMembers(await demoMembers(marketerId, date, calls), search);
    return { members: matched.slice(offset, offset + limit), total: matched.length, demo: true };
  }
  try {
    const { data } = await supabase.rpc('attendance_page', {
      p_date: date,
      p_search: search,
      p_offset: offset,
      p_limit: limit,
    });
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    return {
      members: rows.map(rowToMember),
      total: rows.length > 0 ? Number(rows[0]!.total) || 0 : 0,
      demo: false,
    };
  } catch {
    return { members: [], total: 0, demo: false };
  }
}

/** Day-wide counters over the WHOLE visible subtree (gauges + 100% achievement). */
export async function getAttendanceSummary(date: string): Promise<AttendanceSummary> {
  const { marketerId } = await getOwnerContext();
  const supabase = getClient();

  if (!supabase) {
    const calls = DEMO_CALLS.filter((c) => c.weekday === weekdayOf(date));
    return summarize(await demoMembers(marketerId, date, calls), calls);
  }
  try {
    const { data } = await supabase.rpc('attendance_summary', { p_date: date });
    const row = (Array.isArray(data) ? data[0] : data) as
      | { total_members?: number; present_counts?: Record<string, number>; cam_counts?: Record<string, number> }
      | null;
    return {
      totalMembers: Number(row?.total_members) || 0,
      presentCounts: row?.present_counts ?? {},
      camCounts: row?.cam_counts ?? {},
    };
  } catch {
    return { totalMembers: 0, presentCounts: {}, camCounts: {} };
  }
}

export interface SetAttendanceResult {
  ok: boolean;
  demo: boolean;
}

/** Mark a single (marketer, day, call) PRESENT flag (persisted; demo = memory). */
export async function setZoomAttendance(
  marketerId: string,
  date: string,
  callId: string,
  present: boolean,
): Promise<SetAttendanceResult> {
  const { orgId, demo } = await getOwnerContext();
  const supabase = getClient();
  if (!supabase || demo) {
    presentOverrides.set(keyOf(marketerId, date, callId), present);
    return { ok: true, demo: true };
  }
  try {
    const { error } = await supabase.from('zoom_attendance').upsert(
      { org_id: orgId, marketer_id: marketerId, call_date: date, call_id: callId, present },
      { onConflict: 'org_id,marketer_id,call_date,call_id' },
    );
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}

/** Mark a single (marketer, day, call) CAMERA flag (persisted; demo = memory). */
export async function setZoomCam(
  marketerId: string,
  date: string,
  callId: string,
  cam: boolean,
): Promise<SetAttendanceResult> {
  const { orgId, demo } = await getOwnerContext();
  const supabase = getClient();
  if (!supabase || demo) {
    camOverrides.set(keyOf(marketerId, date, callId), cam);
    return { ok: true, demo: true };
  }
  try {
    const { error } = await supabase.from('zoom_attendance').upsert(
      { org_id: orgId, marketer_id: marketerId, call_date: date, call_id: callId, cam },
      { onConflict: 'org_id,marketer_id,call_date,call_id' },
    );
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
