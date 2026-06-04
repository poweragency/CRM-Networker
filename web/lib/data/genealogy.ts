import 'server-only';
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
    if (rootData) return { data: toTreeNode(rootData), demo: false };

    // Fallback: root the tree at the caller's OWN marketer (top of their subtree).
    const { claims } = await getCurrentClaims();
    if (claims.marketer_id) {
      const { data: selfData } = await supabase
        .from('marketers')
        .select(cols)
        .eq('id', claims.marketer_id)
        .is('deleted_at', null)
        .maybeSingle<MarketerRow>();
      if (selfData) return { data: toTreeNode(selfData), demo: false };
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

    if (error || !data) return { data: mockChildren(parentId), demo: true };
    return { data: (data as MarketerRow[]).map(toTreeNode), demo: false };
  } catch {
    return { data: mockChildren(parentId), demo: true };
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
      return { data: mockSubtree(rootId, scope), demo: true };
    }

    const rows = data as MarketerRow[];
    const filtered =
      scope === 'GLOBAL'
        ? rows
        : rows.filter((r) => r.id === rootId || r.branch_leg === scope);

    return { data: filtered.map(toTreeNode), demo: false };
  } catch {
    return { data: mockSubtree(rootId, scope), demo: true };
  }
}

/** Single node by id (KPI/card refresh). */
export async function getNode(
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

    if (error || !data) return { data: mockNode(id), demo: true };
    return { data: toTreeNode(data), demo: false };
  } catch {
    return { data: mockNode(id), demo: true };
  }
}

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

    if (error || !data) return { data: mockSearch(needle), demo: true };
    return { data: (data as MarketerRow[]).map(toTreeNode), demo: false };
  } catch {
    return { data: mockSearch(needle), demo: true };
  }
}

export { MOCK_ROOT_ID };
