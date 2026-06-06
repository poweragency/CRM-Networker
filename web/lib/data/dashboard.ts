import 'server-only';
import { isSupabaseConfigured } from '@/lib/env';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { mockTopMarketers, type TopMarketerEntry } from '@/lib/data/mock/dashboard';
import { stageIndex, type MarketerRank, type ProspectStage } from '@/lib/types/db';

/**
 * Dashboard data access (server-only) for the "migliori marketer del mese"
 * rankings. The Zoom podium is REAL — derived from `zoom_attendance` (present=true
 * records) for the current month, scoped (by RLS) to the caller's subtree. Each
 * Zoom entry also carries `cam_rate`: the share of THIS MONTH's presences where
 * the camera was on (present&cam / present), shown next to the Zoom count.
 * "Percorsi" = prospects entered the funnel this month, per marketer. "Conversione"
 * = share of those that reached Closing among those that reached Business Info.
 * Both are RLS-scoped to the caller's subtree (same as Zoom).
 * In pure demo mode (no env) the demo dataset populates all categories.
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

interface PresentRow {
  marketer_id: string;
  cam: boolean;
  name: string;
  rank: MarketerRank;
}

/** First/last calendar day of the current month, as ISO `YYYY-MM-DD`. */
function monthBounds(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/** Present (present=true) attendance rows for the month, RLS-scoped to the subtree. */
async function fetchPresentRows(): Promise<PresentRow[]> {
  const supabase = getClient();
  if (!supabase) return [];
  const { from, to } = monthBounds();
  try {
    const { data, error } = await supabase
      .from('zoom_attendance')
      .select('marketer_id, cam, marketers(display_name,rank)')
      .eq('present', true)
      .gte('call_date', from)
      .lte('call_date', to);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => {
      const mk = (r.marketers ?? {}) as { display_name?: string; rank?: string };
      return {
        marketer_id: String(r.marketer_id),
        cam: Boolean(r.cam),
        name: mk.display_name ?? '—',
        rank: (mk.rank as MarketerRank) ?? 'executive',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Rank by number of present Zooms this month (descending). Each entry also gets
 * `cam_rate` = camera-on share among that person's present Zooms this month.
 */
function rankZoom(rows: PresentRow[], limit: number, selfId: string): TopMarketerEntry[] {
  const counts = new Map<string, { name: string; rank: MarketerRank; count: number; cam: number }>();
  for (const r of rows) {
    const cur = counts.get(r.marketer_id) ?? { name: r.name, rank: r.rank, count: 0, cam: 0 };
    cur.count += 1;
    if (r.cam) cur.cam += 1;
    counts.set(r.marketer_id, cur);
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
      cam_rate: v.count > 0 ? v.cam / v.count : null,
    }));
}

/**
 * Prospects entered THIS month, RLS-scoped to the subtree. Deleted prospects are
 * INCLUDED on purpose (the "percorso fatto" stays counted even after the card is
 * removed). Each row is classified for the conversion metric:
 *   • enrolled = iscritto (outcome 'enrolled' or stage 'iscrizione')
 *   • deleted  = removed from the kanban
 * An OPEN prospect (still in the kanban) is neither → it does NOT count toward the
 * conversion average until it is resolved (iscritto or eliminato).
 */
async function fetchMonthProspects(): Promise<
  { owner: string; enrolled: boolean; deleted: boolean }[]
> {
  const supabase = getClient();
  if (!supabase) return [];
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const toExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  try {
    const { data, error } = await supabase
      .from('prospects')
      .select('owner_marketer_id, current_stage, outcome, deleted_at')
      .gte('entered_funnel_at', from)
      .lt('entered_funnel_at', toExclusive);
    if (error || !data) return [];
    const iscr = stageIndex('iscrizione');
    return (data as Record<string, unknown>[]).map((r) => ({
      owner: String(r.owner_marketer_id),
      enrolled:
        r.outcome === 'enrolled' ||
        stageIndex(r.current_stage as ProspectStage) === iscr,
      deleted: r.deleted_at != null,
    }));
  } catch {
    return [];
  }
}

/** Resolve display name + rank for a set of marketer ids (RLS-scoped). */
async function resolveMarketers(
  ids: string[],
): Promise<Map<string, { name: string; rank: MarketerRank }>> {
  const out = new Map<string, { name: string; rank: MarketerRank }>();
  const supabase = getClient();
  if (!supabase || ids.length === 0) return out;
  try {
    const { data } = await supabase
      .from('marketers')
      .select('id, display_name, rank')
      .in('id', ids);
    for (const r of (data as Record<string, unknown>[] | null) ?? []) {
      out.set(String(r.id), {
        name: (r.display_name as string) ?? '—',
        rank: (r.rank as MarketerRank) ?? 'executive',
      });
    }
  } catch {
    /* ignore — names degrade to a dash */
  }
  return out;
}

export async function getMonthlyTopMarketers(
  limit = 5,
): Promise<MonthlyTopResult> {
  // Pure demo mode (no env): seed all categories with the showcase dataset.
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
  const rows = await fetchPresentRows();
  const zoom = rankZoom(rows, limit, selfId);

  // Percorsi + conversione — derived from this month's prospects per marketer.
  // count = all percorsi (incl. deleted). For conversion ONLY resolved prospects
  // count: enrolled = success, deleted-not-enrolled = failure; open prospects in
  // the kanban are excluded until resolved.
  const prospectRows = await fetchMonthProspects();
  const byOwner = new Map<string, { count: number; enrolled: number; resolvedFail: number }>();
  for (const p of prospectRows) {
    const cur = byOwner.get(p.owner) ?? { count: 0, enrolled: 0, resolvedFail: 0 };
    cur.count += 1;
    if (p.enrolled) cur.enrolled += 1;
    else if (p.deleted) cur.resolvedFail += 1;
    byOwner.set(p.owner, cur);
  }
  const names = await resolveMarketers([...byOwner.keys()]);
  const nameOf = (id: string) => names.get(id)?.name ?? '—';
  const rankOf = (id: string) => names.get(id)?.rank ?? 'executive';

  const percorsi: TopMarketerEntry[] = [...byOwner.entries()]
    .sort((a, b) => b[1].count - a[1].count || nameOf(a[0]).localeCompare(nameOf(b[0]), 'it'))
    .slice(0, limit)
    .map(([id, v], i) => ({
      marketer_id: id,
      display_name: nameOf(id),
      rank: rankOf(id),
      value: v.count,
      position: i + 1,
      is_self: id === selfId,
      cam_rate: null,
    }));

  const conversion: TopMarketerEntry[] = [...byOwner.entries()]
    .map(([id, v]) => ({ id, resolved: v.enrolled + v.resolvedFail, enrolled: v.enrolled }))
    .filter((e) => e.resolved > 0)
    .map((e) => ({ id: e.id, rate: e.enrolled / e.resolved, resolved: e.resolved }))
    .sort((a, b) => b.rate - a.rate || b.resolved - a.resolved)
    .slice(0, limit)
    .map((e, i) => ({
      marketer_id: e.id,
      display_name: nameOf(e.id),
      rank: rankOf(e.id),
      value: e.rate,
      position: i + 1,
      is_self: e.id === selfId,
      cam_rate: null,
    }));

  return { data: { zoom, percorsi, conversion }, demo: false };
}
