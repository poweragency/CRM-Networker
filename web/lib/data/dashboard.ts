import 'server-only';
import { isSupabaseConfigured } from '@/lib/env';
import {
  mockTopMarketers,
  type TopMarketerEntry,
} from '@/lib/data/mock/dashboard';

/**
 * Dashboard data access (server-only) for the "migliori marketer del mese"
 * rankings. The three categories are FRONTEND + MOCK / derived for now: the
 * underlying "Zoom di team visti" and "percorsi fatti" events do not exist in the
 * schema yet (product decision), so the rankings come from the demo dataset. The
 * `demo` flag drives the config-notice when env is missing.
 */

export interface MonthlyTopMarketers {
  /** Chi ha visto più Zoom di team. */
  zoom: TopMarketerEntry[];
  /** Chi ha fatto più percorsi. */
  percorsi: TopMarketerEntry[];
  /** Tasso di conversione Business Info → Closing più alto (0..1). */
  conversion: TopMarketerEntry[];
}

export interface MonthlyTopResult {
  data: MonthlyTopMarketers;
  demo: boolean;
}

export async function getMonthlyTopMarketers(
  limit = 5,
): Promise<MonthlyTopResult> {
  // When connected to a real project the underlying ranking sources (Zoom-di-team
  // views / percorsi events) are not wired to the schema yet, so we return EMPTY
  // rankings rather than fake names. The demo dataset is shown only in pure demo
  // mode (env missing) so the showcase UI stays populated.
  if (isSupabaseConfigured) {
    return { data: { zoom: [], percorsi: [], conversion: [] }, demo: false };
  }
  return {
    data: {
      zoom: mockTopMarketers('zoom', limit),
      percorsi: mockTopMarketers('percorsi', limit),
      conversion: mockTopMarketers('conversion', limit),
    },
    demo: true,
  };
}
