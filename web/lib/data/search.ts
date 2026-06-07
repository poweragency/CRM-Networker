import 'server-only';
import { getClient } from '@/lib/data/crm-shared';
import { RANK_LABELS, type MarketerRank } from '@/lib/types/db';

/**
 * Global people search (server-only) backing the sidebar search box. Looks up
 * TEAM members (marketers) and PROSPECTS by name in one shot. Both queries are
 * RLS-bound, so a leader only ever finds people inside their visible subtree —
 * no extra scoping needed here. Demo / no-env → empty (the live app has data).
 */

export interface SearchHit {
  kind: 'team' | 'prospect';
  id: string;
  name: string;
  /** Secondary line (rank for team; null for prospects). */
  subtitle: string | null;
  href: string;
}

/** Escape LIKE wildcards so a literal name search can't be hijacked by % / _. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function searchPeople(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = getClient();
  if (!supabase) return [];
  const pattern = `%${escapeLike(q)}%`;

  const hits: SearchHit[] = [];

  // Team members (RLS → the caller's visible subtree).
  try {
    const { data } = await supabase
      .from('marketers')
      .select('id, display_name, rank')
      .is('deleted_at', null)
      .ilike('display_name', pattern)
      .order('display_name', { ascending: true })
      .limit(6);
    for (const r of (data ?? []) as { id: string; display_name: string; rank: MarketerRank }[]) {
      hits.push({
        kind: 'team',
        id: r.id,
        name: r.display_name,
        subtitle: RANK_LABELS[r.rank] ?? null,
        href: `/team/${r.id}`,
      });
    }
  } catch {
    /* best-effort */
  }

  // Prospects (RLS → visible prospects of the caller's subtree).
  try {
    const { data } = await supabase
      .from('prospects')
      .select('id, full_name')
      .is('deleted_at', null)
      .ilike('full_name', pattern)
      .order('full_name', { ascending: true })
      .limit(6);
    for (const r of (data ?? []) as { id: string; full_name: string }[]) {
      hits.push({
        kind: 'prospect',
        id: r.id,
        name: r.full_name,
        subtitle: null,
        href: `/percorso-prospect/${r.id}`,
      });
    }
  } catch {
    /* best-effort */
  }

  return hits;
}
