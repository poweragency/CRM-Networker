import type { MarketerRank, TreeNode } from '@/lib/types/db';
import { MOCK_NODES, MOCK_ROOT_ID } from '@/lib/data/mock-genealogy';

/**
 * Deterministic demo data for the Dashboard "migliori marketer del mese". The
 * three categories — Zoom di team visti, percorsi fatti, conversione Business
 * Info → Closing — are derived from the genealogy demo tree's KPIs so they stay
 * coherent with the rest of the demo. NOTE: "Zoom visti" and "percorsi fatti"
 * events do not exist in the schema yet, so these are MOCK/derived for now
 * (product decision). Pure & deterministic — safe to import server-side.
 */

export type TopCategory = 'zoom' | 'percorsi' | 'conversion';

export interface TopMarketerEntry {
  marketer_id: string;
  display_name: string;
  rank: MarketerRank;
  /** Raw metric value (count, or 0..1 ratio for conversion). */
  value: number;
  /** 1-based ranking position. */
  position: number;
  is_self: boolean;
}

function metricValue(node: TreeNode, category: TopCategory): number {
  switch (category) {
    case 'zoom':
      // Derived "team Zoom watched" proxy.
      return Math.round(
        node.kpis.prospects * 1.5 + node.kpis.iscrizioni * 4 + node.kpis.calls * 0.2,
      );
    case 'percorsi':
      // Number of percorsi (funnels) worked ≈ prospects in pipeline.
      return node.kpis.prospects;
    case 'conversion':
      // Business Info → Closing conversion (0..1 ratio).
      return node.kpis.conversion_rate;
  }
}

/** Top-N marketers for a category (descending, ties broken by name). */
export function mockTopMarketers(
  category: TopCategory,
  limit = 5,
): TopMarketerEntry[] {
  const ranked = MOCK_NODES.filter((n) => n.status !== 'suspended')
    .map((n) => ({ n, value: metricValue(n, category) }))
    .filter((r) => r.value > 0)
    .sort((a, b) =>
      b.value !== a.value
        ? b.value - a.value
        : a.n.display_name.localeCompare(b.n.display_name, 'it'),
    )
    .slice(0, limit);

  return ranked.map((r, i) => ({
    marketer_id: r.n.id,
    display_name: r.n.display_name,
    rank: r.n.rank,
    value: r.value,
    position: i + 1,
    is_self: r.n.id === MOCK_ROOT_ID,
  }));
}
