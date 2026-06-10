import type { MarketerRank, MarketerStatus } from '@/lib/types/db';

/**
 * Client-safe shared types/constants for Zoom attendance. Calls are now DYNAMIC
 * (defined in the `zoom_calls` table: org-wide by an admin, or team-scoped by a
 * co-admin) so the fixed 3-call vocabulary is gone — components receive the
 * visible {@link ZoomCallDef}s for the day from the server.
 */

/** A scheduled zoom call definition. */
export interface ZoomCallDef {
  id: string;
  title: string;
  /** 0=Sun … 6=Sat. */
  weekday: number;
  /** "HH:MM" or null. */
  start_time: string | null;
  /** 'org' = whole organization; 'team' = creator's downline only. */
  scope: 'org' | 'team';
  /** Team calls: which branch of the creator's downline ('all' | 'left' | 'right'). */
  team_branch: 'left' | 'right' | 'all' | null;
  /** Minimum rank required to see/join the call. null = everyone (incl. cliente/no_rank). */
  min_rank: MarketerRank | null;
  /** Marketer who created it (null = org default). */
  created_by: string | null;
  /** Display name of the creator (for the "da Nome" label). */
  created_by_name: string | null;
}

/** Italian weekday names, indexed 0=Sun … 6=Sat. */
export const WEEKDAY_LABELS: readonly string[] = [
  'Domenica',
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
];

/** Weekday (0=Sun … 6=Sat) of an ISO `YYYY-MM-DD` — timezone-stable. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

export interface AttendanceMember {
  id: string;
  display_name: string;
  rank: MarketerRank;
  status: MarketerStatus;
  /** present flag per call id. */
  present: Record<string, boolean>;
  /** cam flag per call id. */
  cam: Record<string, boolean>;
}

/**
 * Day-wide counters computed server-side over the WHOLE visible subtree, so the
 * gauges (X/total present, 100% achievement, day %) stay exact even though the
 * grid only holds a page of members.
 */
export interface AttendanceSummary {
  /** Total visible members (the denominator of every gauge). */
  totalMembers: number;
  /** present count per call id. */
  presentCounts: Record<string, number>;
  /** cam count per call id. */
  camCounts: Record<string, number>;
}
