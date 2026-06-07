'use server';

import {
  getAttendancePage,
  getAttendanceSummary,
  getAttendanceView,
  setZoomAttendance,
  setZoomCam,
  type AttendancePageResult,
  type AttendanceViewResult,
} from '@/lib/data/attendance';
import type { AttendanceSummary } from '@/lib/data/attendance-shared';

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

/** Day switch: calls + first page of members + day-wide summary for the new day. */
export async function getAttendanceViewAction(
  date: string,
  search = '',
  limit = 100,
): Promise<AttendanceViewResult> {
  return getAttendanceView(date, { search, offset: 0, limit });
}

/** Search / load-more: a page of members + the match count (no summary reload). */
export async function getAttendancePageAction(
  date: string,
  search: string,
  offset: number,
  limit: number,
): Promise<AttendancePageResult> {
  return getAttendancePage(date, { search, offset, limit });
}

/** Realtime refetch of the day-wide counters (keeps gauges exact after echoes). */
export async function getAttendanceSummaryAction(date: string): Promise<AttendanceSummary> {
  return getAttendanceSummary(date);
}
