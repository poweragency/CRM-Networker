'use server';

import { setZoomAttendance, setZoomCam } from '@/lib/data/attendance';
import type { ZoomCall } from '@/lib/data/attendance-shared';

/**
 * Server Action backing the Presenze Zoom table. Delegates to the server-only
 * data layer (`lib/data/attendance.ts`), which is demo-safe and mock-backed for
 * now (no DB table yet), so it never throws and returns a small serializable
 * envelope the client uses to confirm/rollback the toggle.
 */
export interface SetAttendanceActionResult {
  ok: boolean;
  demo: boolean;
}

export async function setZoomAttendanceAction(
  marketerId: string,
  date: string,
  call: ZoomCall,
  present: boolean,
): Promise<SetAttendanceActionResult> {
  return setZoomAttendance(marketerId, date, call, present);
}

export async function setZoomCamAction(
  marketerId: string,
  date: string,
  call: ZoomCall,
  cam: boolean,
): Promise<SetAttendanceActionResult> {
  return setZoomCam(marketerId, date, call, cam);
}
