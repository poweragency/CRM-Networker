import type { MarketerRank, MarketerStatus } from '@/lib/types/db';

/**
 * Client-safe shared types/constants for Zoom attendance. Kept OUT of the
 * server-only `attendance.ts` so client components (the attendance table) can
 * import the call vocabulary and the member shape without pulling in
 * `server-only`. The server data layer re-exports these.
 */

export type ZoomCall = 'wake_up' | 'golden' | 'join_the_dream';

export const ZOOM_CALLS: readonly ZoomCall[] = [
  'wake_up',
  'golden',
  'join_the_dream',
] as const;

export const ZOOM_CALL_LABELS: Record<ZoomCall, string> = {
  wake_up: 'Wake Up Call',
  golden: 'Golden Call',
  join_the_dream: 'Join The Dream',
};

/**
 * Each call runs on ONE fixed weekday (0=Sun … 6=Sat):
 *  - Wake Up Call → Monday
 *  - Golden Call → Thursday
 *  - Join The Dream → Sunday
 */
export const ZOOM_CALL_WEEKDAY: Record<ZoomCall, number> = {
  wake_up: 1,
  golden: 4,
  join_the_dream: 0,
};

/** Weekday (0=Sun … 6=Sat) of an ISO `YYYY-MM-DD` — timezone-stable. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** The calls scheduled on the given ISO day, in canonical order (0, 1 or more). */
export function callsForDate(isoDate: string): ZoomCall[] {
  const wd = weekdayOf(isoDate);
  return ZOOM_CALLS.filter((c) => ZOOM_CALL_WEEKDAY[c] === wd);
}

export interface AttendanceMember {
  id: string;
  display_name: string;
  rank: MarketerRank;
  status: MarketerStatus;
  present: Record<ZoomCall, boolean>;
}
