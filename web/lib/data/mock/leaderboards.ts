import type {
  BranchScope,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardScope,
} from '@/lib/types/db';
import { MOCK_NODES, MOCK_ROOT_ID } from '@/lib/data/mock-genealogy';
import type { TreeNode } from '@/lib/types/db';

/**
 * Deterministic demo leaderboards (doc 11 §11) derived from the genealogy demo
 * tree so the values stay coherent with /genealogia and /analytics. Ranking is
 * computed on read from each node's KPIs; the viewer (root, Marco) is flagged
 * `is_self`. Pure — safe to import from the server-only data layer.
 */

/** Per-node value for a ranked metric (kept consistent with the tree KPIs). */
function metricValue(node: TreeNode, metric: LeaderboardMetric): number {
  switch (metric) {
    case 'calls':
      return node.kpis.calls;
    case 'new_prospects':
      return node.kpis.prospects;
    case 'enrollments':
      return node.kpis.iscrizioni;
    case 'conversion_rate':
      return node.kpis.conversion_rate;
    case 'team_growth':
      return Math.round(node.team_size * 0.5) + node.kpis.iscrizioni;
  }
}

/** Resolve the population ranked for a given scope (+ branch side). */
function population(scope: LeaderboardScope, branch: BranchScope): TreeNode[] {
  const active = MOCK_NODES.filter((n) => n.status !== 'inactive');
  if (scope === 'branch') {
    // LEFT/RIGHT legs of the root; GLOBAL falls back to the whole org.
    if (branch === 'LEFT') return active.filter((n) => n.id.startsWith('nL'));
    if (branch === 'RIGHT') return active.filter((n) => n.id.startsWith('nR'));
  }
  // org + team both span the root's whole subtree in the demo (root = viewer).
  return active;
}

/** Top-N ranked entries for (metric, scope, branch). */
export function mockLeaderboard(
  metric: LeaderboardMetric,
  scope: LeaderboardScope,
  branch: BranchScope = 'GLOBAL',
  limit = 20,
): LeaderboardEntry[] {
  const ranked = population(scope, branch)
    .map((n) => ({ node: n, value: metricValue(n, metric) }))
    .filter((r) => r.value > 0)
    .sort((a, b) =>
      b.value !== a.value
        ? b.value - a.value
        : a.node.display_name.localeCompare(b.node.display_name, 'it'),
    )
    .slice(0, limit);

  return ranked.map((r, i) => ({
    marketer_id: r.node.id,
    display_name: r.node.display_name,
    rank: r.node.rank,
    rank_position: i + 1,
    value: r.value,
    is_self: r.node.id === MOCK_ROOT_ID,
  }));
}
