import 'server-only';
import { fetchAllRows, getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { getSubtree, TREE_LOAD_DEPTH } from '@/lib/data/genealogy';
import {
  weekdayOf,
  type AttendanceMember,
  type ZoomCallDef,
} from '@/lib/data/attendance-shared';

/**
 * Zoom attendance data access (server-only). Calls are DYNAMIC (table
 * `zoom_calls`): the viewer sees the calls scheduled on the chosen day that are
 * visible to them (org-wide, or team calls of their upline co-admins — RLS
 * enforced), and marks present + cam per person (their visible subtree) against
 * each call id. Demo-safe: no env → the 3 historical calls + deterministic data.
 */

export type { AttendanceMember, ZoomCallDef };

export interface AttendanceResult {
  date: string;
  calls: ZoomCallDef[];
  members: AttendanceMember[];
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

/** Attendance for the viewer's subtree on a given day (ISO `YYYY-MM-DD`). */
export async function getZoomAttendance(date: string): Promise<AttendanceResult> {
  const { marketerId, demo } = await getOwnerContext();
  // Presenze only needs the member list (id/name/rank/status) — skip the funnel
  // roll-up (funnel:false) so the day view doesn't pay for KPI aggregation.
  const sub = await getSubtree(marketerId, 'GLOBAL', TREE_LOAD_DEPTH, { funnel: false });
  const supabase = getClient();
  const wd = weekdayOf(date);

  // Demo mode (no env): the 3 fixed calls + deterministic/in-memory attendance.
  if (!supabase) {
    const calls = DEMO_CALLS.filter((c) => c.weekday === wd);
    const members = sub.data
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
    return { date, calls, members, demo: true };
  }

  // Visible calls scheduled on this weekday (RLS scopes org/team visibility).
  let calls: ZoomCallDef[] = [];
  try {
    const { data } = await supabase
      .from('zoom_calls')
      .select('id,title,weekday,start_time,scope,team_branch,created_by, creator:created_by(display_name)')
      .eq('weekday', wd)
      .eq('active', true);
    calls = ((data as Record<string, unknown>[] | null) ?? []).map(mapCallRow).sort(byTimeThenTitle);
  } catch {
    calls = [];
  }

  // Persisted present + cam for the day, keyed by `${marketer_id}|${call_id}`.
  const present = new Map<string, boolean>();
  const camera = new Map<string, boolean>();
  try {
    // NO `.in(ids)`: with a big team that filter became a ~40KB URL and the request
    // failed → the saved attendance never loaded (everyone showed absent, and marks
    // appeared to reset). RLS already scopes zoom_attendance to the caller's subtree,
    // so a plain day query returns exactly the right rows. Paginated for the row cap.
    const data = await fetchAllRows<{
      marketer_id: string;
      call_id: string | null;
      present: boolean;
      cam: boolean;
    }>((from, to) =>
      supabase
        .from('zoom_attendance')
        .select('marketer_id,call_id,present,cam')
        .eq('call_date', date)
        .range(from, to),
    );
    for (const r of data ?? []) {
      if (!r.call_id) continue;
      present.set(`${r.marketer_id}|${r.call_id}`, r.present);
      camera.set(`${r.marketer_id}|${r.call_id}`, r.cam);
    }
  } catch {
    /* leave defaults */
  }

  const members: AttendanceMember[] = sub.data
    .map((n) => ({
      id: n.id,
      display_name: n.display_name,
      rank: n.rank,
      status: n.status,
      present: Object.fromEntries(calls.map((c) => [c.id, present.get(`${n.id}|${c.id}`) ?? false])),
      cam: Object.fromEntries(calls.map((c) => [c.id, camera.get(`${n.id}|${c.id}`) ?? false])),
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));

  return { date, calls, members, demo: false };
}

export interface ZoomDayResult {
  calls: ZoomCallDef[];
  /** present flags keyed `${marketer_id}|${call_id}` (only cells with a row). */
  present: Record<string, boolean>;
  cam: Record<string, boolean>;
  demo: boolean;
}

/**
 * Per-day calls + attendance ONLY (no member list). The Presenze table loads the
 * team once, then switches day with THIS — so a day change no longer re-runs the
 * subtree load. Attendance is RLS-scoped to the caller's subtree (no id filter
 * needed) and paginated so a big team's day isn't truncated by the row cap.
 */
export async function getZoomDay(date: string): Promise<ZoomDayResult> {
  const { demo } = await getOwnerContext();
  const supabase = getClient();
  const wd = weekdayOf(date);

  if (!supabase) {
    const calls = DEMO_CALLS.filter((c) => c.weekday === wd);
    const present: Record<string, boolean> = {};
    const cam: Record<string, boolean> = {};
    for (const [k, v] of presentOverrides) {
      const [id, d, cid] = k.split('|');
      if (d === date && id && cid) present[`${id}|${cid}`] = v;
    }
    for (const [k, v] of camOverrides) {
      const [id, d, cid] = k.split('|');
      if (d === date && id && cid) cam[`${id}|${cid}`] = v;
    }
    return { calls, present, cam, demo: true };
  }

  let calls: ZoomCallDef[] = [];
  try {
    const { data } = await supabase
      .from('zoom_calls')
      .select('id,title,weekday,start_time,scope,team_branch,created_by, creator:created_by(display_name)')
      .eq('weekday', wd)
      .eq('active', true);
    calls = ((data as Record<string, unknown>[] | null) ?? []).map(mapCallRow).sort(byTimeThenTitle);
  } catch {
    calls = [];
  }

  const present: Record<string, boolean> = {};
  const cam: Record<string, boolean> = {};
  try {
    const rows = await fetchAllRows<{
      marketer_id: string;
      call_id: string | null;
      present: boolean;
      cam: boolean;
    }>((from, to) =>
      supabase
        .from('zoom_attendance')
        .select('marketer_id,call_id,present,cam')
        .eq('call_date', date)
        .range(from, to),
    );
    for (const r of rows ?? []) {
      if (!r.call_id) continue;
      present[`${r.marketer_id}|${r.call_id}`] = r.present;
      cam[`${r.marketer_id}|${r.call_id}`] = r.cam;
    }
  } catch {
    /* leave empty */
  }

  return { calls, present, cam, demo: false };
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
