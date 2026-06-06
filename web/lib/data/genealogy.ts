import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getCurrentClaims } from '@/lib/data/session';
import type {
  BranchScope,
  MarketerRank,
  MarketerStatus,
  PlacementLeg,
  TreeNode,
} from '@/lib/types/db';
import {
  MOCK_ROOT_ID,
  mockChildren,
  mockNode,
  mockRoot,
  mockSearch,
  mockSubtree,
} from '@/lib/data/mock-genealogy';

/**
 * Genealogy data access (server-only). Every function attempts Supabase via the
 * RLS-bound server client / closure-backed RPCs (doc 09 §3.10, doc 14 §5–7) and
 * FALLS BACK to the demo tree when env is missing OR the call throws. This keeps
 * /genealogia fully renderable in "modalità demo" and guarantees `next build`
 * succeeds with no env (RESILIENCE requirement).
 *
 * The fallback is signalled via the `demo` flag on the returned envelope so the
 * UI can show the config-notice pattern.
 */

export interface GenealogyResult<T> {
  data: T;
  /** true when served from mock data (env missing or query failed). */
  demo: boolean;
}

/** Raw row shape returned by the marketers select / get_subtree RPC. */
interface MarketerRow {
  id: string;
  parent_id: string | null;
  leg: PlacementLeg | null;
  sponsor_id: string | null;
  first_name: string;
  last_name: string;
  display_name: string | null;
  rank: MarketerRank;
  status: MarketerStatus;
  team_size?: number | null;
  left_team_size?: number | null;
  right_team_size?: number | null;
  has_left_child?: boolean | null;
  has_right_child?: boolean | null;
  branch_leg?: PlacementLeg | null;
  /** From get_subtree (boolean) or, for direct selects, derived from memberships. */
  crm_access?: boolean | null;
  memberships?: { status?: string | null }[] | null;
}

function toTreeNode(row: MarketerRow): TreeNode {
  const display =
    row.display_name ?? `${row.first_name} ${row.last_name}`.trim();
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    display_name: display,
    parent_id: row.parent_id,
    leg: row.leg,
    sponsor_id: row.sponsor_id,
    rank: row.rank,
    status: row.status,
    crm_access:
      typeof row.crm_access === 'boolean'
        ? row.crm_access
        : (row.memberships ?? []).some((m) => m.status === 'active'),
    team_size: row.team_size ?? 0,
    left_count: row.left_team_size ?? 0,
    right_count: row.right_team_size ?? 0,
    has_left_child: row.has_left_child ?? false,
    has_right_child: row.has_right_child ?? false,
    // Live activity is metrics-derived server-side; default to 'cold' until the
    // KPI rollup endpoint feeds it. Kept deterministic for now.
    activity: row.status === 'active' ? 'cold' : 'dormant',
    kpis: { prospects: 0, calls: 0, iscrizioni: 0, conversion_rate: 0 },
    children_loaded: false,
  };
}

type SupabaseServerClient = NonNullable<ReturnType<typeof createClient>>;

/**
 * Team-size aggregates (team / left / right) for a set of ancestor nodes, derived
 * from the closure table using the SAME definition as get_subtree: descendants at
 * depth >= 1, split by `branch_leg`. The direct-select reads (getNode, getChildren,
 * getRootMarketer) don't carry these aggregates, so we backfill them here in a
 * single round-trip. RLS (`closure_select`) already scopes rows to the caller's
 * visible subtree, so the counts can never leak across orgs/branches.
 */
async function fetchTeamCounts(
  supabase: SupabaseServerClient,
  ids: string[],
): Promise<Map<string, { team: number; left: number; right: number }>> {
  const counts = new Map<string, { team: number; left: number; right: number }>();
  for (const id of ids) counts.set(id, { team: 0, left: 0, right: 0 });
  if (ids.length === 0) return counts;
  try {
    const { data } = await supabase
      .from('marketer_tree_closure')
      .select('ancestor_id, branch_leg')
      .in('ancestor_id', ids)
      .gte('depth', 1);
    const rows = (data ?? []) as { ancestor_id: string; branch_leg: PlacementLeg | null }[];
    for (const r of rows) {
      const c = counts.get(r.ancestor_id);
      if (!c) continue;
      c.team += 1;
      if (r.branch_leg === 'LEFT') c.left += 1;
      else if (r.branch_leg === 'RIGHT') c.right += 1;
    }
  } catch {
    // best-effort: leave zeros so the node still renders.
  }
  return counts;
}

/** Stamp fetched counts onto already-built TreeNodes. */
function withCounts(
  nodes: TreeNode[],
  counts: Map<string, { team: number; left: number; right: number }>,
): TreeNode[] {
  return nodes.map((n) => {
    const c = counts.get(n.id);
    return c
      ? { ...n, team_size: c.team, left_count: c.left, right_count: c.right }
      : n;
  });
}

/** The caller's visible root: own marketer (members) or org root (admins). */
export async function getRootMarketer(): Promise<GenealogyResult<TreeNode>> {
  if (!isSupabaseConfigured) {
    return { data: mockRoot(), demo: true };
  }
  try {
    const supabase = createClient();
    if (!supabase) return { data: mockRoot(), demo: true };

    const cols =
      'id,parent_id,leg,sponsor_id,first_name,last_name,display_name,rank,status,memberships(status)';

    // Admins/owners can see the ORG root (parent_id NULL). A member CANNOT — the
    // org root is their upline, not their downline — so RLS returns no row.
    const { data: rootData } = await supabase
      .from('marketers')
      .select(cols)
      .is('parent_id', null)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle<MarketerRow>();
    if (rootData) {
      const node = toTreeNode(rootData);
      const counts = await fetchTeamCounts(supabase, [node.id]);
      return { data: withCounts([node], counts)[0], demo: false };
    }

    // Fallback: root the tree at the caller's OWN marketer (top of their subtree).
    // NO deleted_at filter here — even if the caller's own marketer was soft-removed
    // from the tree, we still show THEIR real node (never fake mock data).
    const { claims } = await getCurrentClaims();
    if (claims.marketer_id) {
      const { data: selfData } = await supabase
        .from('marketers')
        .select(cols)
        .eq('id', claims.marketer_id)
        .maybeSingle<MarketerRow>();
      if (selfData) {
        const node = toTreeNode(selfData);
        const counts = await fetchTeamCounts(supabase, [node.id]);
        return { data: withCounts([node], counts)[0], demo: false };
      }
    }

    return { data: mockRoot(), demo: true };
  } catch {
    return { data: mockRoot(), demo: true };
  }
}

/** Direct children (≤2 legs) of a node, LEFT then RIGHT. */
export async function getChildren(
  parentId: string,
): Promise<GenealogyResult<TreeNode[]>> {
  if (!isSupabaseConfigured) {
    return { data: mockChildren(parentId), demo: true };
  }
  try {
    const supabase = createClient();
    if (!supabase) return { data: mockChildren(parentId), demo: true };

    const { data, error } = await supabase
      .from('marketers')
      .select(
        'id,parent_id,leg,sponsor_id,first_name,last_name,display_name,rank,status,memberships(status)',
      )
      .eq('parent_id', parentId)
      .is('deleted_at', null)
      .order('leg', { ascending: true });

    if (error || !data) return { data: [], demo: false };
    const nodes = (data as MarketerRow[]).map(toTreeNode);
    const counts = await fetchTeamCounts(supabase, nodes.map((n) => n.id));
    return { data: withCounts(nodes, counts), demo: false };
  } catch {
    return { data: [], demo: false };
  }
}

/**
 * Bounded subtree for a scope. Uses the `get_subtree` read-RPC (doc 09 §3.10),
 * then filters by `branch_leg` for LEFT/RIGHT views (doc 14 §4). The root row is
 * always included; for branch scopes only the chosen-leg descendants are kept.
 */
export async function getSubtree(
  rootId: string,
  scope: BranchScope,
  maxDepth = 4,
): Promise<GenealogyResult<TreeNode[]>> {
  if (!isSupabaseConfigured) {
    return { data: mockSubtree(rootId, scope), demo: true };
  }
  try {
    const supabase = createClient();
    if (!supabase) return { data: mockSubtree(rootId, scope), demo: true };

    const { data, error } = await supabase.rpc('get_subtree', {
      node_id: rootId,
      max_depth: maxDepth,
    });

    if (error || !Array.isArray(data) || data.length === 0) {
      // Env IS configured → an empty/failed subtree is the REAL state (the node
      // has no visible downline). Return empty, never the fake mock tree.
      return { data: [], demo: false };
    }

    const rows = data as MarketerRow[];
    const filtered =
      scope === 'GLOBAL'
        ? rows
        : rows.filter((r) => r.id === rootId || r.branch_leg === scope);

    return { data: filtered.map(toTreeNode), demo: false };
  } catch {
    return { data: [], demo: false };
  }
}

/** Single node by id (KPI/card refresh). Request-memoized via React cache() so
 *  the 3-4 calls per /team/[id] render (metadata + page + profile + sponsor)
 *  collapse to one query per distinct id (audit M38). */
export const getNode = cache(async function getNode(
  id: string,
): Promise<GenealogyResult<TreeNode | null>> {
  if (!isSupabaseConfigured) {
    return { data: mockNode(id), demo: true };
  }
  try {
    const supabase = createClient();
    if (!supabase) return { data: mockNode(id), demo: true };

    const { data, error } = await supabase
      .from('marketers')
      .select(
        'id,parent_id,leg,sponsor_id,first_name,last_name,display_name,rank,status,memberships(status)',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle<MarketerRow>();

    if (error || !data) return { data: null, demo: false };
    const node = toTreeNode(data);
    const counts = await fetchTeamCounts(supabase, [node.id]);
    return { data: withCounts([node], counts)[0], demo: false };
  } catch {
    return { data: null, demo: false };
  }
});

/** Trigram name search within the caller's visible subtree (doc 14 §5.5). */
export async function searchMarketers(
  q: string,
): Promise<GenealogyResult<TreeNode[]>> {
  const needle = q.trim();
  if (!needle) return { data: [], demo: !isSupabaseConfigured };

  if (!isSupabaseConfigured) {
    return { data: mockSearch(needle), demo: true };
  }
  try {
    const supabase = createClient();
    if (!supabase) return { data: mockSearch(needle), demo: true };

    const { data, error } = await supabase
      .from('marketers')
      .select(
        'id,parent_id,leg,sponsor_id,first_name,last_name,display_name,rank,status,memberships(status)',
      )
      .is('deleted_at', null)
      .ilike('display_name', `%${needle}%`)
      .limit(20);

    if (error || !data) return { data: [], demo: false };
    return { data: (data as MarketerRow[]).map(toTreeNode), demo: false };
  } catch {
    return { data: [], demo: false };
  }
}

export { MOCK_ROOT_ID };
