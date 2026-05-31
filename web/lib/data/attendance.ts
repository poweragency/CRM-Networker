import 'server-only';
import { getSubtree } from '@/lib/data/genealogy';
import { getCurrentClaims } from '@/lib/data/session';
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
 * Frontend + mock for now (no DB table yet): a deterministic default attendance
 * is derived per (marketer, day, call), and edits are kept in an in-memory
 * override map so a toggle reflects within the running server. Demo-safe; never
 * throws.
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

/** In-memory edit store (mock-only; resets on server restart). */
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

/** Deterministic default: ~2 of 3 marked present, varies by person/day/call. */
function defaultPresent(id: string, date: string, call: ZoomCall): boolean {
  return hash(keyOf(id, date, call)) % 3 !== 0;
}

function resolve(id: string, date: string, call: ZoomCall): boolean {
  const k = keyOf(id, date, call);
  return overrides.has(k) ? overrides.get(k)! : defaultPresent(id, date, call);
}

/** Attendance for the viewer's subtree on a given day (ISO `YYYY-MM-DD`). */
export async function getZoomAttendance(
  date: string,
): Promise<AttendanceResult> {
  const { claims, demo } = await getCurrentClaims();
  const sub = await getSubtree(claims.marketer_id, 'GLOBAL');
  const members: AttendanceMember[] = sub.data
    .map((n) => ({
      id: n.id,
      display_name: n.display_name,
      rank: n.rank,
      status: n.status,
      present: {
        wake_up: resolve(n.id, date, 'wake_up'),
        golden: resolve(n.id, date, 'golden'),
        join_the_dream: resolve(n.id, date, 'join_the_dream'),
      },
    }))
    // Alphabetical by name (it-IT), not by tree/rank order.
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));
  return { date, members, demo: demo || sub.demo };
}

export interface SetAttendanceResult {
  ok: boolean;
  /** Always true for now — attendance is mock-backed (no DB table yet). */
  demo: boolean;
}

/** Mark a single (marketer, day, call) attendance flag (in-memory, demo-safe). */
export async function setZoomAttendance(
  marketerId: string,
  date: string,
  call: ZoomCall,
  present: boolean,
): Promise<SetAttendanceResult> {
  overrides.set(keyOf(marketerId, date, call), present);
  return { ok: true, demo: true };
}
