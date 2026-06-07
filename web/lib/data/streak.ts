import 'server-only';
import { getClient } from '@/lib/data/crm-shared';
import { logError } from '@/lib/log';

/**
 * "Catena d'Oro" — the daily DMO streak. Backed by the `dmo_status` RPC (migration
 * 0054), which computes today's three daily tasks, records the day when all are
 * done, and returns the current consecutive-day streak — all in Europe/Rome local
 * time. Demo-safe: returns an empty status when env is missing or the call fails.
 */

export interface DmoStatus {
  /** Attended at least one Zoom call today. */
  present: boolean;
  /** Added at least one Lista 100 contact today. */
  lista: boolean;
  /** Created or advanced at least one prospect today. */
  funnel: boolean;
  /** All three daily tasks done today. */
  allDone: boolean;
  /** Consecutive days the DMO was completed (incl. today when done). */
  streak: number;
  /** Today already counted toward the streak. */
  todayRecorded: boolean;
  demo: boolean;
}

const EMPTY: DmoStatus = {
  present: false,
  lista: false,
  funnel: false,
  allDone: false,
  streak: 0,
  todayRecorded: false,
  demo: true,
};

export async function getDmoStatus(): Promise<DmoStatus> {
  const supabase = getClient();
  if (!supabase) return EMPTY;
  try {
    const { data, error } = await supabase.rpc('dmo_status');
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return { ...EMPTY, demo: false };
    const r = row as Record<string, unknown>;
    return {
      present: Boolean(r.present),
      lista: Boolean(r.lista),
      funnel: Boolean(r.funnel),
      allDone: Boolean(r.all_done),
      streak: Number(r.streak ?? 0),
      todayRecorded: Boolean(r.today_recorded),
      demo: false,
    };
  } catch (e) {
    logError('getDmoStatus', e);
    return { ...EMPTY, demo: false };
  }
}
