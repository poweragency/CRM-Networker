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

export interface AttendanceMember {
  id: string;
  display_name: string;
  rank: MarketerRank;
  status: MarketerStatus;
  present: Record<ZoomCall, boolean>;
}
