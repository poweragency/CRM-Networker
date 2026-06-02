import type {
  ActivityIndicator,
  BranchScope,
  MarketerRank,
  MarketerStatus,
  PlacementLeg,
  TreeNode,
  TreeNodeKpis,
} from '@/lib/types/db';
import { applyIdentity, getRuntimeNodes, runtimeNode } from '@/lib/data/mock/runtime';

/**
 * Deterministic demo binary tree (~21 nodes) so /genealogia, search and the
 * scope switcher render fully when Supabase env is missing or a query fails
 * (RESILIENCE requirement). One root with reasonably balanced LEFT/RIGHT legs,
 * varied ranks/status/KPIs/activity. IDs use the `n`-prefixed label convention
 * from doc 14 §2.1 so they look like real ltree labels.
 *
 * This module is the single source of demo truth; lib/data/genealogy.ts falls
 * back to it. It is pure data + tiny pure helpers — safe to import anywhere.
 */

interface Seed {
  id: string;
  parent: string | null;
  leg: PlacementLeg | null;
  sponsor?: string | null; // defaults to parent (no spillover) when omitted
  first: string;
  last: string;
  rank: MarketerRank;
  status: MarketerStatus;
  kpis: TreeNodeKpis;
}

// Hand-authored so leg balance, ranks and KPIs read like a real org.
const SEEDS: Seed[] = [
  // ── Root ──
  { id: 'nroot', parent: null, leg: null, first: 'Marco', last: 'De Santis', rank: 'vice_president', status: 'active', kpis: { prospects: 38, calls: 142, iscrizioni: 11, conversion_rate: 0.21 } },

  // ── Level 1 ──
  { id: 'nL', parent: 'nroot', leg: 'LEFT', first: 'Giulia', last: 'Bianchi', rank: 'executive_team_leader', status: 'active', kpis: { prospects: 24, calls: 98, iscrizioni: 7, conversion_rate: 0.18 } },
  { id: 'nR', parent: 'nroot', leg: 'RIGHT', first: 'Luca', last: 'Ferrari', rank: 'senior_team_leader', status: 'active', kpis: { prospects: 21, calls: 87, iscrizioni: 6, conversion_rate: 0.17 } },

  // ── Level 2 — LEFT branch ──
  { id: 'nLL', parent: 'nL', leg: 'LEFT', first: 'Sara', last: 'Conti', rank: 'team_leader', status: 'active', kpis: { prospects: 15, calls: 61, iscrizioni: 4, conversion_rate: 0.16 } },
  { id: 'nLR', parent: 'nL', leg: 'RIGHT', first: 'Davide', last: 'Greco', rank: 'team_leader', status: 'active', kpis: { prospects: 12, calls: 54, iscrizioni: 3, conversion_rate: 0.14 } },

  // ── Level 2 — RIGHT branch ──
  { id: 'nRL', parent: 'nR', leg: 'LEFT', first: 'Elena', last: 'Moretti', rank: 'team_leader', status: 'active', kpis: { prospects: 13, calls: 49, iscrizioni: 3, conversion_rate: 0.15 } },
  { id: 'nRR', parent: 'nR', leg: 'RIGHT', first: 'Paolo', last: 'Russo', rank: 'consultant', status: 'inactive', kpis: { prospects: 6, calls: 18, iscrizioni: 1, conversion_rate: 0.09 } },

  // ── Level 3 — under LL ──
  { id: 'nLLL', parent: 'nLL', leg: 'LEFT', first: 'Anna', last: 'Costa', rank: 'consultant', status: 'active', kpis: { prospects: 9, calls: 33, iscrizioni: 2, conversion_rate: 0.13 } },
  { id: 'nLLR', parent: 'nLL', leg: 'RIGHT', sponsor: 'nL', first: 'Matteo', last: 'Gallo', rank: 'consultant', status: 'active', kpis: { prospects: 8, calls: 29, iscrizioni: 2, conversion_rate: 0.12 } },

  // ── Level 3 — under LR ──
  { id: 'nLRL', parent: 'nLR', leg: 'LEFT', first: 'Chiara', last: 'Fontana', rank: 'consultant', status: 'active', kpis: { prospects: 4, calls: 11, iscrizioni: 0, conversion_rate: 0.0 } },

  // ── Level 3 — under RL ──
  { id: 'nRLL', parent: 'nRL', leg: 'LEFT', first: 'Simone', last: 'Marino', rank: 'consultant', status: 'active', kpis: { prospects: 7, calls: 26, iscrizioni: 1, conversion_rate: 0.1 } },
  { id: 'nRLR', parent: 'nRL', leg: 'RIGHT', first: 'Federica', last: 'Lombardi', rank: 'executive', status: 'active', kpis: { prospects: 5, calls: 17, iscrizioni: 1, conversion_rate: 0.11 } },

  // ── Level 3 — under RR ──
  { id: 'nRRL', parent: 'nRR', leg: 'LEFT', first: 'Andrea', last: 'Barbieri', rank: 'executive', status: 'inactive', kpis: { prospects: 1, calls: 3, iscrizioni: 0, conversion_rate: 0.0 } },

  // ── Level 4 — leaves ──
  { id: 'nLLLL', parent: 'nLLL', leg: 'LEFT', first: 'Valentina', last: 'Rizzo', rank: 'executive', status: 'active', kpis: { prospects: 3, calls: 9, iscrizioni: 0, conversion_rate: 0.0 } },
  { id: 'nLLLR', parent: 'nLLL', leg: 'RIGHT', first: 'Stefano', last: 'Caruso', rank: 'executive', status: 'active', kpis: { prospects: 2, calls: 5, iscrizioni: 0, conversion_rate: 0.0 } },
  { id: 'nLLRL', parent: 'nLLR', leg: 'LEFT', first: 'Martina', last: 'Bruno', rank: 'executive', status: 'active', kpis: { prospects: 4, calls: 12, iscrizioni: 1, conversion_rate: 0.16 } },
  { id: 'nRLLL', parent: 'nRLL', leg: 'LEFT', first: 'Giorgio', last: 'Villa', rank: 'executive', status: 'active', kpis: { prospects: 2, calls: 7, iscrizioni: 0, conversion_rate: 0.0 } },
  { id: 'nRLRL', parent: 'nRLR', leg: 'LEFT', first: 'Roberta', last: 'Serra', rank: 'executive', status: 'inactive', kpis: { prospects: 0, calls: 1, iscrizioni: 0, conversion_rate: 0.0 } },
  { id: 'nLRLL', parent: 'nLRL', leg: 'LEFT', first: 'Alessio', last: 'De Luca', rank: 'executive', status: 'active', kpis: { prospects: 3, calls: 8, iscrizioni: 0, conversion_rate: 0.0 } },
  { id: 'nLRLR', parent: 'nLRL', leg: 'RIGHT', first: 'Ilaria', last: 'Ferri', rank: 'executive', status: 'active', kpis: { prospects: 1, calls: 2, iscrizioni: 0, conversion_rate: 0.0 } },
];

/** Derive an activity badge from KPIs, matching doc 14 §7.2 thresholds. */
function deriveActivity(kpis: TreeNodeKpis, status: MarketerStatus): ActivityIndicator {
  if (status === 'inactive') return 'dormant';
  if (kpis.iscrizioni >= 1 || kpis.calls >= 20 || kpis.prospects >= 10) return 'hot';
  if (kpis.calls >= 5 || kpis.prospects >= 3) return 'warm';
  if (kpis.calls > 0 || kpis.prospects > 0) return 'cold';
  return 'dormant';
}

/** Build the fully-derived node map once (team sizes via closure-style counts). */
function buildNodes(): Map<string, TreeNode> {
  const childrenOf = new Map<string, Seed[]>();
  for (const s of SEEDS) {
    if (s.parent) {
      const arr = childrenOf.get(s.parent) ?? [];
      arr.push(s);
      childrenOf.set(s.parent, arr);
    }
  }

  // Count all descendants (excluding self) per node.
  function subtreeCount(id: string): number {
    const kids = childrenOf.get(id) ?? [];
    return kids.reduce((acc, k) => acc + 1 + subtreeCount(k.id), 0);
  }

  const map = new Map<string, TreeNode>();
  for (const s of SEEDS) {
    const kids = childrenOf.get(s.id) ?? [];
    const leftChild = kids.find((k) => k.leg === 'LEFT');
    const rightChild = kids.find((k) => k.leg === 'RIGHT');
    const leftCount = leftChild ? 1 + subtreeCount(leftChild.id) : 0;
    const rightCount = rightChild ? 1 + subtreeCount(rightChild.id) : 0;

    map.set(s.id, {
      id: s.id,
      first_name: s.first,
      last_name: s.last,
      display_name: `${s.first} ${s.last}`,
      parent_id: s.parent,
      leg: s.leg,
      sponsor_id: s.sponsor !== undefined ? s.sponsor : s.parent,
      rank: s.rank,
      status: s.status,
      team_size: leftCount + rightCount,
      left_count: leftCount,
      right_count: rightCount,
      has_left_child: Boolean(leftChild),
      has_right_child: Boolean(rightChild),
      activity: deriveActivity(s.kpis, s.status),
      kpis: s.kpis,
      children_loaded: true,
    });
  }
  return map;
}

const NODE_MAP = buildNodes();
/** All demo nodes in seed (pre-order-ish) order. */
export const MOCK_NODES: TreeNode[] = SEEDS.map((s) => NODE_MAP.get(s.id)!);
export const MOCK_ROOT_ID = 'nroot';

/** Root node of the demo tree. */
export function mockRoot(): TreeNode {
  return NODE_MAP.get(MOCK_ROOT_ID)!;
}

/**
 * A single demo node by id (or null). Runtime-added nodes win over the seed; any
 * rank/status identity override (set from a profile by a manager) is applied.
 */
export function mockNode(id: string): TreeNode | null {
  const base = runtimeNode(id) ?? NODE_MAP.get(id) ?? null;
  return base ? applyIdentity(base) : null;
}

/**
 * Direct children (≤2) of a node, ordered LEFT then RIGHT. Includes any
 * runtime-added marketers (e.g. placed from the tree) so every view stays in
 * sync within the running server. Identity overrides (rank/status) are applied.
 */
export function mockChildren(parentId: string): TreeNode[] {
  return [...MOCK_NODES, ...getRuntimeNodes()]
    .filter((n) => n.parent_id === parentId)
    .sort((a, b) => (a.leg === b.leg ? 0 : a.leg === 'LEFT' ? -1 : 1))
    .map(applyIdentity);
}

/** Return the LEFT-only / RIGHT-only / full subtree (inclusive of root). */
export function mockSubtree(rootId: string, scope: BranchScope): TreeNode[] {
  const root = mockNode(rootId);
  if (!root) return [];

  const result: TreeNode[] = [];
  const visit = (id: string) => {
    const node = mockNode(id);
    if (!node) return;
    result.push(node);
    for (const child of mockChildren(id)) visit(child.id);
  };

  if (scope === 'GLOBAL') {
    visit(rootId);
    return result;
  }

  // LEFT / RIGHT: root + only the chosen-leg child's subtree.
  result.push(root);
  const child = mockChildren(rootId).find(
    (c) => c.leg === (scope === 'LEFT' ? 'LEFT' : 'RIGHT'),
  );
  if (child) visit(child.id);
  return result;
}

/** Case-insensitive name search across the demo tree + runtime adds (max 20). */
export function mockSearch(q: string): TreeNode[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return [...MOCK_NODES, ...getRuntimeNodes()]
    .map(applyIdentity)
    .filter((n) => n.display_name.toLowerCase().includes(needle))
    .slice(0, 20);
}
