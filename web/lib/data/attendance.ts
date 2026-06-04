import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { getSubtree } from '@/lib/data/genealogy';
import {
  ZOOM_CALLS,
  ZOOM_CALL_LABELS,
  type AttendanceMember,
  type ZoomCall,
} from '@/lib/data/attendance-shared';

/**
 * Zoom attendance data access (server-only). Each viewer sees everyone from
 * themselves DOWN (their visible subtree) and can mark, per day, whether each
 * person attended the three calls: Wake Up Call, Golden Call, Join The Dream.
 *
 * Persisted in `zoom_attendance` (one row per marketer/day/call; RLS-scoped to
 * the viewer's subtree). In pure demo mode (no env) a deterministic default is
 * derived and edits are kept in an in-memory override map. Never throws.
 *
 * The client-safe vocabulary (calls/labels/member type) lives in
 * `attendance-shared.ts`; re-exported here for server-side importers.
 */

export { ZOOM_CALLS, ZOOM_CALL_LABELS };
export type { ZoomCall, AttendanceMember };

export interface AttendanceResult {
  date: string;
  members: AttendanceMember[];
  demo: boolean;
}

/** In-memory edit store (demo-only; resets on server restart). */
const overrides = new Map<string, boolean>();

function keyOf(id: string, date: string, call: ZoomCall): string {
  return `${id}|${date}|${call}`;
}

/** Small deterministic string hash (no Math.random — stable across renders). */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic demo default: ~2 of 3 marked present, varies by person/day/call. */
function defaultPresent(id: string, date: string, call: ZoomCall): boolean {
  return hash(keyOf(id, date, call)) % 3 !== 0;
}

/** Attendance for the viewer's subtree on a given day (ISO `YYYY-MM-DD`). */
export async function getZoomAttendance(
  date: string,
): Promise<AttendanceResult> {
  const { marketerId, demo } = await getOwnerContext();
  const sub = await getSubtree(marketerId, 'GLOBAL');
  const supabase = getClient();

  // Load persisted present flags for the visible people on this day.
  const present = new Map<string, boolean>(); // key: id|call
  if (supabase) {
    try {
      const ids = sub.data.map((n) => n.id);
      const { data } = await supabase
        .from('zoom_attendance')
        .select('marketer_id,call,present')
        .eq('call_date', date)
        .in('marketer_id', ids);
      for (const r of (data as { marketer_id: string; call: ZoomCall; present: boolean }[] | null) ?? []) {
        present.set(`${r.marketer_id}|${r.call}`, r.present);
      }
    } catch {
      /* fall through to defaults */
    }
  }

  const resolve = (id: string, call: ZoomCall): boolean => {
    if (supabase) return present.get(`${id}|${call}`) ?? false;
    const k = keyOf(id, date, call);
    return overrides.has(k) ? overrides.get(k)! : defaultPresent(id, date, call);
  };

  const members: AttendanceMember[] = sub.data
    .map((n) => ({
      id: n.id,
      display_name: n.display_name,
      rank: n.rank,
      status: n.status,
      present: {
        wake_up: resolve(n.id, 'wake_up'),
        golden: resolve(n.id, 'golden'),
        join_the_dream: resolve(n.id, 'join_the_dream'),
      },
    }))
    // Alphabetical by name (it-IT), not by tree/rank order.
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));

  return { date, members, demo: (demo || sub.demo) && !supabase };
}

export interface SetAttendanceResult {
  ok: boolean;
  /** true only when simulated (pure demo mode). */
  demo: boolean;
}

/** Mark a single (marketer, day, call) attendance flag (persisted; demo = in-memory). */
export async function setZoomAttendance(
  marketerId: string,
  date: string,
  call: ZoomCall,
  present: boolean,
): Promise<SetAttendanceResult> {
  const { orgId, demo } = await getOwnerContext();
  const supabase = getClient();
  if (!supabase || demo) {
    overrides.set(keyOf(marketerId, date, call), present);
    return { ok: true, demo: true };
  }
  try {
    const { error } = await supabase.from('zoom_attendance').upsert(
      {
        org_id: orgId,
        marketer_id: marketerId,
        call_date: date,
        call,
        present,
      },
      { onConflict: 'org_id,marketer_id,call_date,call' },
    );
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
