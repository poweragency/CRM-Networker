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
 * person attended each call AND whether their camera was on.
 *
 * Persisted in `zoom_attendance` (one row per marketer/day/call carrying present
 * + cam; RLS-scoped to the viewer's subtree). In pure demo mode (no env) a
 * deterministic default + in-memory override maps are used. Never throws.
 */

export { ZOOM_CALLS, ZOOM_CALL_LABELS };
export type { ZoomCall, AttendanceMember };

export interface AttendanceResult {
  date: string;
  members: AttendanceMember[];
  demo: boolean;
}

/** In-memory edit stores (demo-only; reset on server restart). */
const presentOverrides = new Map<string, boolean>();
const camOverrides = new Map<string, boolean>();

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

  // Load persisted present + cam flags for the visible people on this day.
  const present = new Map<string, boolean>(); // key: id|call
  const camera = new Map<string, boolean>();
  if (supabase) {
    try {
      const ids = sub.data.map((n) => n.id);
      const { data } = await supabase
        .from('zoom_attendance')
        .select('marketer_id,call,present,cam')
        .eq('call_date', date)
        .in('marketer_id', ids);
      for (const r of (data as { marketer_id: string; call: ZoomCall; present: boolean; cam: boolean }[] | null) ?? []) {
        present.set(`${r.marketer_id}|${r.call}`, r.present);
        camera.set(`${r.marketer_id}|${r.call}`, r.cam);
      }
    } catch {
      /* fall through to defaults */
    }
  }

  const resolvePresent = (id: string, call: ZoomCall): boolean => {
    if (supabase) return present.get(`${id}|${call}`) ?? false;
    const k = keyOf(id, date, call);
    return presentOverrides.has(k) ? presentOverrides.get(k)! : defaultPresent(id, date, call);
  };
  const resolveCam = (id: string, call: ZoomCall): boolean => {
    if (supabase) return camera.get(`${id}|${call}`) ?? false;
    return camOverrides.get(keyOf(id, date, call)) ?? false;
  };

  const members: AttendanceMember[] = sub.data
    .map((n) => ({
      id: n.id,
      display_name: n.display_name,
      rank: n.rank,
      status: n.status,
      present: {
        wake_up: resolvePresent(n.id, 'wake_up'),
        golden: resolvePresent(n.id, 'golden'),
        join_the_dream: resolvePresent(n.id, 'join_the_dream'),
      },
      cam: {
        wake_up: resolveCam(n.id, 'wake_up'),
        golden: resolveCam(n.id, 'golden'),
        join_the_dream: resolveCam(n.id, 'join_the_dream'),
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

/** Mark a single (marketer, day, call) PRESENT flag (persisted; demo = in-memory). */
export async function setZoomAttendance(
  marketerId: string,
  date: string,
  call: ZoomCall,
  present: boolean,
): Promise<SetAttendanceResult> {
  const { orgId, demo } = await getOwnerContext();
  const supabase = getClient();
  if (!supabase || demo) {
    presentOverrides.set(keyOf(marketerId, date, call), present);
    return { ok: true, demo: true };
  }
  try {
    const { error } = await supabase.from('zoom_attendance').upsert(
      { org_id: orgId, marketer_id: marketerId, call_date: date, call, present },
      { onConflict: 'org_id,marketer_id,call_date,call' },
    );
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}

/** Mark a single (marketer, day, call) CAMERA flag (persisted; demo = in-memory). */
export async function setZoomCam(
  marketerId: string,
  date: string,
  call: ZoomCall,
  cam: boolean,
): Promise<SetAttendanceResult> {
  const { orgId, demo } = await getOwnerContext();
  const supabase = getClient();
  if (!supabase || demo) {
    camOverrides.set(keyOf(marketerId, date, call), cam);
    return { ok: true, demo: true };
  }
  try {
    const { error } = await supabase.from('zoom_attendance').upsert(
      { org_id: orgId, marketer_id: marketerId, call_date: date, call, cam },
      { onConflict: 'org_id,marketer_id,call_date,call' },
    );
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
