import 'server-only';
import { isSupabaseConfigured } from '@/lib/env';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { mockTopMarketers, type TopMarketerEntry } from '@/lib/data/mock/dashboard';
import type { MarketerRank } from '@/lib/types/db';

/**
 * Dashboard data access (server-only) for the "migliori marketer del mese"
 * rankings. The Zoom podium is REAL — it counts present=true rows in
 * `zoom_attendance` for the current month, scoped (by RLS) to the caller's
 * subtree. "Percorsi" and "conversione" don't have a wired source yet, so they
 * return empty (no fake names) when connected. In pure demo mode (no env) the
 * three demo lists are shown so the showcase UI stays populated.
 */

export interface MonthlyTopMarketers {
  /** Chi ha visto più Zoom di team (presenze registrate). */
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

/** First/last calendar day of the current month, as ISO `YYYY-MM-DD`. */
function monthBounds(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/** Top-N marketers by Zoom presences this month (RLS-scoped to the subtree). */
async function topZoom(limit: number, selfId: string): Promise<TopMarketerEntry[]> {
  const supabase = getClient();
  if (!supabase) return [];
  const { from, to } = monthBounds();
  try {
    const { data, error } = await supabase
      .from('zoom_attendance')
      .select('marketer_id, marketers(display_name,rank)')
      .eq('present', true)
      .gte('call_date', from)
      .lte('call_date', to);
    if (error || !data) return [];

    const counts = new Map<string, { name: string; rank: MarketerRank; count: number }>();
    for (const r of data as Record<string, unknown>[]) {
      const id = String(r.marketer_id);
      const mk = (r.marketers ?? {}) as { display_name?: string; rank?: string };
      const cur =
        counts.get(id) ??
        { name: mk.display_name ?? '—', rank: (mk.rank as MarketerRank) ?? 'executive', count: 0 };
      cur.count += 1;
      counts.set(id, cur);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name, 'it'))
      .slice(0, limit)
      .map(([id, v], i) => ({
        marketer_id: id,
        display_name: v.name,
        rank: v.rank,
        value: v.count,
        position: i + 1,
        is_self: id === selfId,
      }));
  } catch {
    return [];
  }
}

export async function getMonthlyTopMarketers(
  limit = 5,
): Promise<MonthlyTopResult> {
  // Pure demo mode (no env): seed all three with the showcase dataset.
  if (!isSupabaseConfigured) {
    return {
      data: {
        zoom: mockTopMarketers('zoom', limit),
        percorsi: mockTopMarketers('percorsi', limit),
        conversion: mockTopMarketers('conversion', limit),
      },
      demo: true,
    };
  }

  const { marketerId: selfId } = await getOwnerContext();
  const zoom = await topZoom(limit, selfId);
  // "percorsi" and "conversione" have no wired source yet → empty (no fake data).
  return { data: { zoom, percorsi: [], conversion: [] }, demo: false };
}
