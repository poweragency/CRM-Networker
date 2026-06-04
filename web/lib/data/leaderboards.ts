import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import type {
  BranchScope,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardScope,
  MarketerRank,
} from '@/lib/types/db';
import { mockLeaderboard } from '@/lib/data/mock/leaderboards';

/**
 * Leaderboard data access (server-only). Reads the precomputed
 * `leaderboard_snapshots` (doc 11 §11) for the latest period matching
 * (metric, scope, branch_side), joining the marketer name/rank, and FALLS BACK
 * to the demo ranking when env is missing OR the query fails (RESILIENCE).
 */

export interface LeaderboardResult {
  data: LeaderboardEntry[];
  demo: boolean;
}

/** Top-N ranked entries for (metric, scope, branch). */
export async function getLeaderboard(
  metric: LeaderboardMetric,
  scope: LeaderboardScope,
  branch: BranchScope = 'GLOBAL',
  limit = 20,
): Promise<LeaderboardResult> {
  const supabase = getClient();
  if (!supabase) {
    return { data: mockLeaderboard(metric, scope, branch, limit), demo: true };
  }

  try {
    const { marketerId } = await getOwnerContext();

    // Resolve the latest period_start for this (metric, scope) so a snapshot
    // refresh mid-month doesn't mix periods.
    const { data: latest } = await supabase
      .from('leaderboard_snapshots')
      .select('period_start')
      .eq('metric', metric)
      .eq('scope', scope)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle<{ period_start: string }>();

    let query = supabase
      .from('leaderboard_snapshots')
      .select('marketer_id,rank_position,value,marketers(display_name,rank)')
      .eq('metric', metric)
      .eq('scope', scope)
      .order('rank_position', { ascending: true })
      .limit(limit);

    if (scope === 'branch') query = query.eq('branch_side', branch);
    if (latest?.period_start) query = query.eq('period_start', latest.period_start);

    const { data, error } = await query;
    // Connected: an empty/absent snapshot means the period hasn't been computed
    // yet (no cron) — show an EMPTY board, not fake names.
    if (error || !data || data.length === 0) {
      return { data: [], demo: false };
    }

    const entries: LeaderboardEntry[] = (data as Record<string, unknown>[]).map(
      (r) => {
        const m = (r.marketers ?? {}) as { display_name?: string; rank?: string };
        return {
          marketer_id: String(r.marketer_id),
          display_name: m.display_name ?? '—',
          rank: (m.rank as MarketerRank) ?? 'executive',
          rank_position: Number(r.rank_position ?? 0),
          value: Number(r.value ?? 0),
          is_self: String(r.marketer_id) === marketerId,
        };
      },
    );
    return { data: entries, demo: false };
  } catch {
    return { data: [], demo: false };
  }
}
