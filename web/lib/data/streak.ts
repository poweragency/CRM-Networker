import 'server-only';
import { getClient } from '@/lib/data/crm-shared';
import { logError } from '@/lib/log';
import type { MarketerRank } from '@/lib/types/db';

/**
 * "Catena d'Oro" — the daily DMO streak. v2 (migration 0055): the DMO is 5 MANUAL
 * daily tasks the user ticks by hand. `dmo_status` reads today's 5 tasks + the
 * consecutive all-done-day streak; `dmo_toggle` flips one task and returns the
 * fresh status; `dmo_month_leaderboard` ranks the team by all-done days this month
 * (Europe/Rome). Demo-safe: empty/echoed status when env is missing or a call fails.
 */

/** The 5 manual DMO tasks (client keys ↔ DB columns in {@link TASK_COLUMN}). */
export type DmoTask =
  | 'readPages'
  | 'igStory'
  | 'tiktokReel'
  | 'meetPerson'
  | 'training';

/** Client task key → DB column name (the `dmo_toggle` argument). */
export const TASK_COLUMN: Record<DmoTask, string> = {
  readPages: 'read_pages',
  igStory: 'ig_story',
  tiktokReel: 'tiktok_reel',
  meetPerson: 'meet_person',
  training: 'training',
};

export interface DmoStatus {
  /** Read 10 pages. */
  readPages: boolean;
  /** Posted an Instagram story. */
  igStory: boolean;
  /** Posted a TikTok / reel. */
  tiktokReel: boolean;
  /** Met a new person. */
  meetPerson: boolean;
  /** Watched a training video / podcast. */
  training: boolean;
  /** All 5 daily tasks done today. */
  allDone: boolean;
  /** Consecutive days the DMO was completed (incl. today when done). */
  streak: number;
  /** Today already counts toward the streak (= all done today). */
  todayRecorded: boolean;
  demo: boolean;
}

const EMPTY: DmoStatus = {
  readPages: false,
  igStory: false,
  tiktokReel: false,
  meetPerson: false,
  training: false,
  allDone: false,
  streak: 0,
  todayRecorded: false,
  demo: true,
};

function mapStatus(row: Record<string, unknown>): DmoStatus {
  return {
    readPages: Boolean(row.read_pages),
    igStory: Boolean(row.ig_story),
    tiktokReel: Boolean(row.tiktok_reel),
    meetPerson: Boolean(row.meet_person),
    training: Boolean(row.training),
    allDone: Boolean(row.all_done),
    streak: Number(row.streak ?? 0),
    todayRecorded: Boolean(row.today_recorded),
    demo: false,
  };
}

export async function getDmoStatus(): Promise<DmoStatus> {
  const supabase = getClient();
  if (!supabase) return EMPTY;
  try {
    const { data, error } = await supabase.rpc('dmo_status');
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return { ...EMPTY, demo: false };
    return mapStatus(row as Record<string, unknown>);
  } catch (e) {
    logError('getDmoStatus', e);
    return { ...EMPTY, demo: false };
  }
}

/** Flip one of today's DMO tasks and return the refreshed status. */
export async function toggleDmoTask(
  column: string,
  value: boolean,
): Promise<DmoStatus> {
  const supabase = getClient();
  if (!supabase) return EMPTY;
  try {
    const { data, error } = await supabase.rpc('dmo_toggle', {
      p_task: column,
      p_value: value,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return { ...EMPTY, demo: false };
    return mapStatus(row as Record<string, unknown>);
  } catch (e) {
    logError('toggleDmoTask', e, { column, value });
    return { ...EMPTY, demo: false };
  }
}

export interface DmoLeaderRow {
  marketer_id: string;
  display_name: string;
  rank: MarketerRank;
  days_done: number;
  is_self: boolean;
}

/** Team ranking by all-done DMO days this month (caller's visible subtree). */
export async function getDmoLeaderboard(): Promise<{
  rows: DmoLeaderRow[];
  demo: boolean;
}> {
  const supabase = getClient();
  if (!supabase) {
    return {
      demo: true,
      rows: [
        { marketer_id: 'demo-1', display_name: 'Tato Lion', rank: 'global_director', days_done: 18, is_self: true },
        { marketer_id: 'demo-2', display_name: 'Cesare Bianchi', rank: 'team_leader', days_done: 14, is_self: false },
        { marketer_id: 'demo-3', display_name: 'Geremia Verdi', rank: 'consultant', days_done: 9, is_self: false },
      ],
    };
  }
  try {
    const { data, error } = await supabase.rpc('dmo_month_leaderboard');
    if (error || !Array.isArray(data)) return { rows: [], demo: false };
    const rows = (data as Record<string, unknown>[]).map((r) => ({
      marketer_id: String(r.marketer_id),
      display_name: String(r.display_name ?? '—'),
      rank: (r.rank as MarketerRank) ?? 'no_rank',
      days_done: Number(r.days_done ?? 0),
      is_self: Boolean(r.is_self),
    }));
    return { rows, demo: false };
  } catch (e) {
    logError('getDmoLeaderboard', e);
    return { rows: [], demo: false };
  }
}
