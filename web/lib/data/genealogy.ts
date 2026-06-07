import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getCurrentClaims } from '@/lib/data/session';
import type {
  BranchScope,
  ListaContattiStatus,
  MarketerRank,
  MarketerStatus,
  PlacementLeg,
  ProspectOutcome,
  ProspectStage,
  TreeNode,
} from '@/lib/types/db';
import { STAGE_ORDER } from '@/lib/types/db';
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

/** Raw (un-rated) funnel counts for ONE marketer — summable across a subtree. */
interface PersonalFunnel {
  /** Prospects still "in ballo" RIGHT NOW — open funnel + Lista-100 entries in
   *  percorso that aren't concluded. A live snapshot (NOT monthly): excludes
   *  enrolled/lost AND deleted. */
  prospects: number;
  /** Reached Business Info among THIS MONTH's intake (the monthly conversion
   *  denominator — prospects entered this month, stage >= business_info). */
  businessInfo: number;
  /** Enrollments THIS MONTH (prospects entered this month, stage iscrizione). */
  iscrizioni: number;
}
const ZERO_FUNNEL: PersonalFunnel = { prospects: 0, businessInfo: 0, iscrizioni: 0 };
const BUSINESS_INFO_IDX = STAGE_ORDER.indexOf('business_info');

/**
 * Per-marketer PERSONAL funnel counts (audit: these were hardcoded to 0).
 *
 * `prospects` = how many are "in ballo" right now — a LIVE snapshot from two
 * sources: the `prospects` table (open only) + `lista_contatti_entries` with
 * percorso 1..4 not concluded (Lista-100 contacts in the funnel; they're not in
 * the prospects table since promote makes a contact). Excludes enrolled/lost/
 * deleted. NOT time-scoped — an open prospect stays "in ballo".
 *
 * `iscrizioni` + `businessInfo` are MONTHLY (reset on the 1st): they count only
 * prospects whose `entered_funnel_at` is in the current month (same cohort the
 * dashboard uses), so the conversion = monthly iscritti / monthly business-info.
 * Lista-100 entries have no reliable funnel-entry date, so they feed only the
 * live "in ballo" count, not the monthly metrics.
 *
 * Returns raw counts so they can be summed over a subtree before the rate is
 * computed. Two queries for the whole id set; RLS scopes each to the caller.
 */
async function fetchPersonalFunnel(
  supabase: SupabaseServerClient,
  ids: string[],
): Promise<Map<string, PersonalFunnel>> {
  const out = new Map<string, PersonalFunnel>();
  for (const id of ids) out.set(id, { ...ZERO_FUNNEL });
  if (ids.length === 0) return out;

  // Primary path: the `funnel_counts` RPC aggregates server-side, so the counts are
  // EXACT regardless of org size (the previous client-side `.in(ids)` reads were
  // capped by PostgREST's row limit → the tree silently undercounted, esp. Lista-100).
  // It also owns the single "prospect in ballo" definition (open prospects + Lista-100
  // entries still in percorso) and this-month's BI/iscrizioni cohort.
  try {
    const { data, error } = await supabase.rpc('funnel_counts', { p_ids: ids });
    if (!error && Array.isArray(data)) {
      for (const r of data as {
        marketer_id: string;
        prospects: number;
        business_info: number;
        iscrizioni: number;
      }[]) {
        out.set(r.marketer_id, {
          prospects: Number(r.prospects) || 0,
          businessInfo: Number(r.business_info) || 0,
          iscrizioni: Number(r.iscrizioni) || 0,
        });
      }
      return out;
    }
  } catch {
    /* fall through to the client-side fallback below */
  }

  // Fallback (RPC unavailable): same definition, computed client-side. Subject to the
  // row cap on very large orgs, but keeps the tree populated rather than empty.
  const now = new Date();
  const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  try {
    const { data } = await supabase
      .from('prospects')
      .select('owner_marketer_id, current_stage, outcome, entered_funnel_at')
      .in('owner_marketer_id', ids)
      .is('deleted_at', null);
    for (const r of (data ?? []) as {
      owner_marketer_id: string;
      current_stage: ProspectStage;
      outcome: ProspectOutcome;
      entered_funnel_at: string;
    }[]) {
      const f = out.get(r.owner_marketer_id);
      if (!f) continue;
      if (r.outcome === 'open') f.prospects += 1; // live snapshot (any date)
      const enteredThisMonth =
        new Date(r.entered_funnel_at).getTime() >= monthStartMs;
      if (enteredThisMonth) {
        if (STAGE_ORDER.indexOf(r.current_stage) >= BUSINESS_INFO_IDX) f.businessInfo += 1;
        if (r.current_stage === 'iscrizione') f.iscrizioni += 1;
      }
    }
  } catch {
    /* best-effort */
  }

  try {
    const { data } = await supabase
      .from('lista_contatti_entries')
      .select('owner_marketer_id, percorso, stato')
      .in('owner_marketer_id', ids)
      .gte('percorso', 1)
      .is('deleted_at', null);
    for (const r of (data ?? []) as {
      owner_marketer_id: string;
      percorso: number;
      stato: ListaContattiStatus | null;
    }[]) {
      const f = out.get(r.owner_marketer_id);
      if (!f) continue;
      const concluded =
        r.percorso >= 5 || r.stato === 'iscritto' || r.stato === 'non_iscritto';
      if (!concluded) f.prospects += 1; // still in ballo
    }
  } catch {
    /* best-effort */
  }

  return out;
}

/** Conversion = iscritti / business-info-reached (0 when no one reached BI). */
function conversionOf(f: PersonalFunnel): number {
  return f.businessInfo > 0 ? f.iscrizioni / f.businessInfo : 0;
}

/** Stamp funnel counts + conversion onto TreeNodes (personal OR aggregated). */
function stampFunnel(
  nodes: TreeNode[],
  byId: Map<string, PersonalFunnel>,
): TreeNode[] {
  return nodes.map((n) => {
    const f = byId.get(n.id) ?? ZERO_FUNNEL;
    return {
      ...n,
      kpis: {
        ...n.kpis,
        prospects: f.prospects,
        iscrizioni: f.iscrizioni,
        conversion_rate: conversionOf(f),
      },
    };
  });
}

/**
 * Roll each loaded node's funnel up over its WHOLE loaded subtree (the node + all
 * its descendants present in `nodes`). This makes the tree a leader's overview:
 * the number on a node is the SUM of the team's prospects ("da X in giù ci sono N
 * prospect"), and the conversion is the team-wide rate — total iscritti ÷ total
 * Business-Info across the subtree. Summing the raw counts before dividing makes
 * the rate volume-weighted by team size (NOT a flat average of left/right), and it
 * naturally folds in the root's own funnel. O(n) post-order over the in-memory tree
 * (parent_id adjacency), so no extra query and no row-limit risk on big orgs.
 */
function aggregateSubtree(
  nodes: TreeNode[],
  personal: Map<string, PersonalFunnel>,
): Map<string, PersonalFunnel> {
  const inSet = new Set(nodes.map((n) => n.id));
  const childrenByParent = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent_id && inSet.has(n.parent_id)) {
      const arr = childrenByParent.get(n.parent_id) ?? [];
      arr.push(n.id);
      childrenByParent.set(n.parent_id, arr);
    }
  }
  // Forest roots = loaded nodes whose parent isn't in the set.
  const roots = nodes
    .filter((n) => !n.parent_id || !inSet.has(n.parent_id))
    .map((n) => n.id);
  // Pre-order traversal, then reverse → every child is processed before its parent.
  const order: string[] = [];
  const stack = [...roots];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    order.push(id);
    const kids = childrenByParent.get(id);
    if (kids) for (const c of kids) stack.push(c);
  }
  order.reverse();

  const agg = new Map<string, PersonalFunnel>();
  for (const id of order) {
    const base = personal.get(id) ?? ZERO_FUNNEL;
    const a: PersonalFunnel = {
      prospects: base.prospects,
      businessInfo: base.businessInfo,
      iscrizioni: base.iscrizioni,
    };
    const kids = childrenByParent.get(id);
    if (kids) {
      for (const c of kids) {
        const ca = agg.get(c);
        if (!ca) continue;
        a.prospects += ca.prospects;
        a.businessInfo += ca.businessInfo;
        a.iscrizioni += ca.iscrizioni;
      }
    }
    agg.set(id, a);
  }
  return agg;
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
      const personal = await fetchPersonalFunnel(supabase, [node.id]);
      return { data: stampFunnel(withCounts([node], counts), personal)[0], demo: false };
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
        const personal = await fetchPersonalFunnel(supabase, [node.id]);
        return { data: stampFunnel(withCounts([node], counts), personal)[0], demo: false };
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
    const ids = nodes.map((n) => n.id);
    const counts = await fetchTeamCounts(supabase, ids);
    // Direct children loaded lazily → show each child's PERSONAL funnel (their full
    // subtree roll-up is computed by getSubtree when the whole tree is loaded).
    const personal = await fetchPersonalFunnel(supabase, ids);
    return { data: stampFunnel(withCounts(nodes, counts), personal), demo: false };
  } catch {
    return { data: [], demo: false };
  }
}

/**
 * Default subtree depth — effectively UNLIMITED (any realistic binary org is far
 * shallower than this). The real cost is the descendant COUNT, not this number, so
 * a large value just means "load the whole visible subtree". The genealogy viewer
 * (and attendance / seven-whys, which need the full team) rely on this.
 */
export const TREE_LOAD_DEPTH = 1000;

/**
 * Subtree for a scope. Uses the `get_subtree` read-RPC (doc 09 §3.10), then filters
 * by `branch_leg` for LEFT/RIGHT views (doc 14 §4). The root row is always
 * included; for branch scopes only the chosen-leg descendants are kept. By default
 * loads the FULL subtree (no artificial 4-level cap).
 */
export async function getSubtree(
  rootId: string,
  scope: BranchScope,
  maxDepth = TREE_LOAD_DEPTH,
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

    // get_subtree already returns team sizes; enrich with the funnel KPIs the RPC
    // doesn't compute. Each node shows its WHOLE-SUBTREE roll-up (team prospects +
    // team-wide conversion), so the tree reads as a leader's overview.
    const nodes = filtered.map(toTreeNode);
    const personal = await fetchPersonalFunnel(supabase, nodes.map((n) => n.id));
    const agg = aggregateSubtree(nodes, personal);
    return { data: stampFunnel(nodes, agg), demo: false };
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
    // Stamp the PERSONAL funnel (prospect in ballo + monthly BI/iscrizioni) so the
    // /team/[id] profile shows the SAME "prospect" number the tree shows for this
    // node's personal value — both flow through `funnel_counts` (one definition).
    const personal = await fetchPersonalFunnel(supabase, [node.id]);
    return {
      data: stampFunnel(withCounts([node], counts), personal)[0],
      demo: false,
    };
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
