'use server';

import {
  getZoomDay,
  setZoomAttendance,
  setZoomCam,
  type ZoomDayResult,
} from '@/lib/data/attendance';

/**
 * Server Actions backing the Presenze Zoom table. Delegate to the demo-safe
 * server-only data layer; calls are referenced by id (dynamic calls).
 */
export interface SetAttendanceActionResult {
  ok: boolean;
  demo: boolean;
}

export async function setZoomAttendanceAction(
  marketerId: string,
  date: string,
  callId: string,
  present: boolean,
): Promise<SetAttendanceActionResult> {
  return setZoomAttendance(marketerId, date, callId, present);
}

export async function setZoomCamAction(
  marketerId: string,
  date: string,
  callId: string,
  cam: boolean,
): Promise<SetAttendanceActionResult> {
  return setZoomCam(marketerId, date, callId, cam);
}

/** Fast day switch: just the day's calls + attendance (no team reload). */
export async function getZoomDayAction(date: string): Promise<ZoomDayResult> {
  return getZoomDay(date);
}
