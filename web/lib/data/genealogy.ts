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

  // Primary: server-aggregated team sizes via `team_counts`, chunked (≤500 ids/call)
  // so the result never hits the row cap — even the org root (whose closure has one
  // row per descendant) can't truncate, since the count happens inside SQL.
  try {
    const CHUNK = 500;
    let okAll = true;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await supabase.rpc('team_counts', { p_ids: slice });
      if (error || !Array.isArray(data)) {
        okAll = false;
        break;
      }
      for (const r of data as {
        marketer_id: string;
        team: number;
        lft: number;
        rgt: number;
      }[]) {
        counts.set(r.marketer_id, {
          team: Number(r.team) || 0,
          left: Number(r.lft) || 0,
          right: Number(r.rgt) || 0,
        });
      }
    }
    if (okAll) return counts;
  } catch {
    /* fall through to the closure fallback */
  }

  // Fallback (RPC unavailable): direct closure read (cap-limited on huge subtrees,
  // but better than zeros). Reset first so a partial RPC fill can't double-count.
  for (const id of ids) counts.set(id, { team: 0, left: 0, right: 0 });
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
  /** Prospects still "in ballo" RIGHT NOW — OPEN prospects in the kanban funnel.
   *  A live snapshot (NOT monthly): excludes enrolled AND deleted. Lista-100 entries
   *  are pre-funnel contacts (not in the kanban) and are NOT counted. */
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
 * `prospects` = how many are "in ballo" right now — OPEN prospects in the kanban
 * funnel (`prospects` table, outcome='open'). Excludes enrolled AND deleted. NOT
 * time-scoped — an open prospect stays "in ballo". Lista-100 entries are pre-funnel
 * contacts (not in the kanban) and are NOT counted.
 *
 * `iscrizioni` + `businessInfo` are MONTHLY (reset on the 1st): they count only
 * prospects whose `entered_funnel_at` is in the current month (same cohort the
 * dashboard uses), so the conversion = monthly iscritti / monthly business-info.
 *
 * Primary path is the `funnel_counts` RPC (server-aggregated); this fallback only
 * runs if the RPC is unavailable. RLS scopes each read to the caller.
 */
async function fetchPersonalFunnel(
  supabase: SupabaseServerClient,
  ids: string[],
): Promise<Map<string, PersonalFunnel>> {
  const out = new Map<string, PersonalFunnel>();
  for (const id of ids) out.set(id, { ...ZERO_FUNNEL });
  if (ids.length === 0) return out;

  // Primary path: the `funnel_counts` RPC aggregates server-side, so the counts are
  // EXACT (the old client-side `.in(ids)` reads were capped by PostgREST's row limit).
  // It owns the single "prospect in ballo" definition — OPEN prospects in the kanban
  // funnel only (Lista-100 entries are pre-funnel contacts, not counted) — plus this
  // month's BI/iscrizioni cohort. The RPC returns ONE row per id, so we CHUNK the id
  // list (≤500/call) to stay under the same row cap no matter how big the org grows.
  try {
    const CHUNK = 500;
    let okAll = true;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await supabase.rpc('funnel_counts', { p_ids: slice });
      if (error || !Array.isArray(data)) {
        okAll = false;
        break;
      }
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
    }
    if (okAll) return out;
  } catch {
    /* fall through to the client-side fallback below */
  }

  // Fallback (RPC unavailable): same definition, computed client-side. Reset first so
  // a partially-filled map from the RPC attempt can't double-count.
  for (const id of ids) out.set(id, { ...ZERO_FUNNEL });
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

  // NOTE: Lista-100 entries are PRE-funnel contacts (not in the kanban), so they are
  // NOT counted as "in ballo" — only open prospects in the kanban count. Mirrors the
  // `funnel_counts` RPC (migration 0062).

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
  opts: { funnel?: boolean } = {},
): Promise<GenealogyResult<TreeNode[]>> {
  const withFunnel = opts.funnel !== false;
  if (!isSupabaseConfigured) {
    return { data: mockSubtree(rootId, scope), demo: true };
  }
  try {
    const supabase = createClient();
    if (!supabase) return { data: mockSubtree(rootId, scope), demo: true };

    // The `get_subtree` RPC returns a TABLE → PostgREST RE-RUNS the whole function for
    // every .range() page. So instead of blind paging (which re-scanned 3× for a
    // 1000-node org), we read the authoritative subtree size from the closure (cheap,
    // indexed) and request exactly that many rows in ONE call. Only if the platform
    // row cap truncates the response (subtree > cap) do we fetch the remainder.
    let total = 0;
    try {
      const { count } = await supabase
        .from('marketer_tree_closure')
        .select('descendant_id', { count: 'exact', head: true })
        .eq('ancestor_id', rootId);
      total = count ?? 0;
    } catch {
      /* total stays 0 → fall back to incremental short-page detection */
    }

    const rows: MarketerRow[] = [];
    for (;;) {
      const want = total > 0 ? total - rows.length : 1000;
      if (want <= 0) break;
      const { data, error } = await supabase
        .rpc('get_subtree', { node_id: rootId, max_depth: maxDepth })
        .range(rows.length, rows.length + want - 1);
      if (error) {
        if (rows.length === 0) return { data: [], demo: false };
        break;
      }
      const batch = (data ?? []) as MarketerRow[];
      rows.push(...batch);
      if (batch.length === 0) break;
      if (total > 0) {
        if (rows.length >= total) break;
      } else if (batch.length < want) {
        break; // unknown total → a short page means we're done
      }
    }

    if (rows.length === 0) {
      // Env IS configured → an empty subtree is the REAL state (no visible downline).
      return { data: [], demo: false };
    }

    const filtered =
      scope === 'GLOBAL'
        ? rows
        : rows.filter((r) => r.id === rootId || r.branch_leg === scope);

    const nodes = filtered.map(toTreeNode);
    // Funnel KPIs are only needed by the tree viewer/profile. Callers that just need
    // the member list (e.g. Presenze) pass funnel:false to skip the extra aggregation.
    if (!withFunnel) return { data: nodes, demo: false };

    // get_subtree already returns team sizes; enrich with the funnel KPIs the RPC
    // doesn't compute. Each node shows its WHOLE-SUBTREE roll-up (team prospects +
    // team-wide conversion), so the tree reads as a leader's overview.
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
