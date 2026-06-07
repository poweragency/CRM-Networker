import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import type {
  AccountStatus,
  AdminMarketerRow,
  AuditAction,
  AuditLogEntry,
  MarketerRank,
  MarketerStatus,
  MembershipRole,
  OrgSettings,
  PlacementLeg,
  RankHistoryEntry,
} from '@/lib/types/db';
import { RANK_ORDER } from '@/lib/types/db';
import {
  mockAuditLog,
  mockMarketerOptions,
  mockMarketerRows,
  mockOrgSettings,
  mockRankHistory,
  type MarketerOption,
} from '@/lib/data/mock/admin';
import { matchesText } from '@/lib/data/crm-shared';

/**
 * Admin data access (server-only) for the /admin/* surfaces: the marketer
 * registry, pre-registration (`place_marketer`), rank distribution + history,
 * the audit timeline and org settings. Every read attempts Supabase (RLS scopes
 * to the caller's org/subtree; admin policies widen to org-wide) and FALLS BACK
 * to the demo dataset when env is missing OR the query fails (RESILIENCE). Writes
 * are demo-safe & never throw.
 */

export interface AdminResult<T> {
  data: T;
  demo: boolean;
}

export interface MarketerFilter {
  q?: string;
  status?: MarketerStatus | 'all';
  account?: AccountStatus | 'all';
}

interface MembershipEmbed {
  role?: MembershipRole;
  status?: string;
  permissions?: { crm_access?: boolean } | null;
}

function rowToAdminMarketer(r: Record<string, unknown>): AdminMarketerRow {
  const embeds = (r.memberships ?? []) as MembershipEmbed[] | MembershipEmbed;
  const mem = Array.isArray(embeds) ? embeds[0] : embeds;
  const accountStatus = (mem?.status as AccountStatus | undefined) ?? 'none';
  const display =
    (r.display_name as string | null) ??
    `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
  return {
    id: String(r.id),
    display_name: display,
    first_name: String(r.first_name ?? ''),
    last_name: String(r.last_name ?? ''),
    email: (r.email as string | null) ?? null,
    rank: r.rank as MarketerRank,
    status: r.status as MarketerStatus,
    account_status: accountStatus,
    role: (mem?.role as MembershipRole | undefined) ?? null,
    crm_access: Boolean(mem?.permissions?.crm_access) && accountStatus === 'active',
    team_size: Number(r.team_size ?? 0),
    registration_date: (r.registration_date as string | null) ?? null,
    created_at: String(r.created_at ?? ''),
  };
}

function applyFilter(rows: AdminMarketerRow[], filter?: MarketerFilter): AdminMarketerRow[] {
  let out = rows;
  if (filter?.q) {
    const q = filter.q;
    out = out.filter(
      (r) => matchesText(r.display_name, q) || matchesText(r.email, q),
    );
  }
  if (filter?.status && filter.status !== 'all') {
    out = out.filter((r) => r.status === filter.status);
  }
  if (filter?.account && filter.account !== 'all') {
    out = out.filter((r) => r.account_status === filter.account);
  }
  return out;
}

/** The org's marketer registry (profiles + account projection). */
export async function listMarketers(
  filter?: MarketerFilter,
): Promise<AdminResult<AdminMarketerRow[]>> {
  const supabase = getClient();
  if (!supabase) {
    return { data: applyFilter(mockMarketerRows(), filter), demo: true };
  }
  try {
    const { data, error } = await supabase
      .from('marketers')
      .select(
        'id,first_name,last_name,display_name,email,rank,status,registration_date,created_at,memberships(role,status,permissions)',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error || !data) return { data: applyFilter(mockMarketerRows(), filter), demo: true };
    const rows = (data as Record<string, unknown>[]).map(rowToAdminMarketer);
    // Backfill team_size from the closure — the `marketers` table has no such
    // column (it's derived), so without this it stays 0 in the roster/registry.
    // One round-trip; RLS scopes closure rows to the caller's visible subtree.
    try {
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: cl } = await supabase
          .from('marketer_tree_closure')
          .select('ancestor_id')
          .in('ancestor_id', ids)
          .gte('depth', 1);
        const counts = new Map<string, number>();
        for (const c of (cl ?? []) as { ancestor_id: string }[]) {
          counts.set(c.ancestor_id, (counts.get(c.ancestor_id) ?? 0) + 1);
        }
        for (const r of rows) r.team_size = counts.get(r.id) ?? 0;
      }
    } catch {
      /* best-effort: leave team_size at 0 if the closure read fails */
    }
    return { data: applyFilter(rows, filter), demo: false };
  } catch {
    return { data: applyFilter(mockMarketerRows(), filter), demo: true };
  }
}

/** Marketer picker options (placement parent / sponsor selection). */
export async function getMarketerOptions(): Promise<AdminResult<MarketerOption[]>> {
  const supabase = getClient();
  if (!supabase) return { data: mockMarketerOptions(), demo: true };
  try {
    const { data, error } = await supabase
      .from('marketers')
      .select('id,display_name,first_name,last_name,rank')
      .is('deleted_at', null)
      .order('display_name', { ascending: true })
      .limit(500);
    if (error || !data) return { data: mockMarketerOptions(), demo: true };
    const opts: MarketerOption[] = (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      display_name:
        (r.display_name as string | null) ??
        `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      rank: r.rank as MarketerRank,
    }));
    return { data: opts, demo: false };
  } catch {
    return { data: mockMarketerOptions(), demo: true };
  }
}

export interface CreateMarketerInput {
  firstName: string;
  lastName: string;
  parentId: string | null;
  leg: PlacementLeg | null;
  sponsorId: string | null;
  rank: MarketerRank;
  status: MarketerStatus;
}

export interface CreateMarketerResult {
  id: string | null;
  demo: boolean;
  ok: boolean;
}

/**
 * Pre-register a marketer profile. Direct RLS-bound INSERT into `marketers`:
 * the BEFORE INSERT trigger computes the ltree path, the AFTER INSERT triggers
 * build the closure + write the audit/rank-history rows, and the partial unique
 * index enforces the one-child-per-leg (no-spillover) rule. The full rank set —
 * including `cliente` / `no_rank` (the lowest, below `executive`) — is stored
 * as-is (the enum + ranks_meta carry these values).
 */
export async function createMarketer(
  input: CreateMarketerInput,
): Promise<CreateMarketerResult> {
  const supabase = getClient();
  if (!supabase) return { id: `m-${input.lastName.toLowerCase()}`, demo: true, ok: true };
  try {
    const { orgId, marketerId } = await getOwnerContext();
    const rank: MarketerRank = input.rank;
    // Generate the id server-side so we DON'T need RETURNING (`.select`): a
    // non-admin can't yet SELECT the brand-new row (its visibility closure is
    // built by an AFTER trigger), so RETURNING would trip the SELECT RLS policy
    // with 42501. With an explicit id we just return it after a plain insert.
    const id = crypto.randomUUID();
    const { error } = await supabase.from('marketers').insert({
      id,
      org_id: orgId,
      first_name: input.firstName,
      last_name: input.lastName,
      parent_id: input.parentId,
      leg: input.leg,
      sponsor_id: input.sponsorId,
      rank,
      status: input.status,
      created_by: marketerId,
      updated_by: marketerId,
    });
    if (error) return { id: null, demo: false, ok: false };
    return { id, demo: false, ok: true };
  } catch {
    return { id: null, demo: false, ok: false };
  }
}

export interface RemoveMarketerResult {
  ok: boolean;
  demo: boolean;
}

/**
 * Remove a marketer from the binary tree (RPC `remove_marketer`): soft-deletes
 * the node and reattaches its single downline to the parent in the vacated leg.
 * The RPC refuses when both legs are occupied / it's the root / it's the caller,
 * and is visibility-gated. Demo-safe.
 */
export async function removeMarketer(nodeId: string): Promise<RemoveMarketerResult> {
  const supabase = getClient();
  if (!supabase) return { ok: true, demo: true };
  try {
    const { marketerId } = await getOwnerContext();
    const { error } = await supabase.rpc('remove_marketer', {
      p_node: nodeId,
      p_actor: marketerId,
    });
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}

/** Count of profiles per rank (for the distribution chart). */
export async function getRankDistribution(): Promise<
  AdminResult<{ rank: MarketerRank; count: number }[]>
> {
  const { data, demo } = await listMarketers();
  const counts = new Map<MarketerRank, number>();
  for (const rank of RANK_ORDER) counts.set(rank, 0);
  for (const row of data) counts.set(row.rank, (counts.get(row.rank) ?? 0) + 1);
  return {
    data: RANK_ORDER.map((rank) => ({ rank, count: counts.get(rank) ?? 0 })),
    demo,
  };
}

/** Recent rank changes (immutable `rank_history`, newest first). */
export async function listRankHistory(
  limit = 30,
): Promise<AdminResult<RankHistoryEntry[]>> {
  const supabase = getClient();
  if (!supabase) return { data: mockRankHistory(), demo: true };
  try {
    const { data, error } = await supabase
      .from('rank_history')
      .select(
        'id,marketer_id,previous_rank,new_rank,changed_at,notes,marketers!rank_history_marketer_id_fkey(display_name)',
      )
      .order('changed_at', { ascending: false })
      .limit(limit);
    if (error || !data) return { data: mockRankHistory(), demo: true };
    const rows: RankHistoryEntry[] = (data as Record<string, unknown>[]).map((r) => {
      const m = (r.marketers ?? null) as { display_name?: string } | null;
      return {
        id: String(r.id),
        marketer_id: String(r.marketer_id),
        marketer_name: m?.display_name ?? '—',
        previous_rank: (r.previous_rank as MarketerRank | null) ?? null,
        new_rank: r.new_rank as MarketerRank,
        changed_at: String(r.changed_at),
        changed_by_name: null,
        notes: (r.notes as string | null) ?? null,
      };
    });
    return { data: rows, demo: false };
  } catch {
    return { data: mockRankHistory(), demo: true };
  }
}

/** The org audit timeline (newest first), optionally filtered by action. */
export async function listAuditLog(
  action?: AuditAction,
  limit = 50,
): Promise<AdminResult<AuditLogEntry[]>> {
  const supabase = getClient();
  if (!supabase) {
    const all = mockAuditLog();
    return { data: action ? all.filter((e) => e.action === action) : all, demo: true };
  }
  try {
    let query = supabase
      .from('audit_log')
      .select(
        'id,action,entity_type,entity_id,created_at,marketers!audit_log_actor_marketer_id_fkey(display_name)',
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (action) query = query.eq('action', action);
    const { data, error } = await query;
    if (error || !data) {
      const all = mockAuditLog();
      return { data: action ? all.filter((e) => e.action === action) : all, demo: true };
    }
    const rows: AuditLogEntry[] = (data as Record<string, unknown>[]).map((r) => {
      const m = (r.marketers ?? null) as { display_name?: string } | null;
      return {
        id: String(r.id),
        actor_name: m?.display_name ?? null,
        action: r.action as AuditAction,
        entity_type: String(r.entity_type),
        entity_id: (r.entity_id as string | null) ?? null,
        created_at: String(r.created_at),
      };
    });
    return { data: rows, demo: false };
  } catch {
    const all = mockAuditLog();
    return { data: action ? all.filter((e) => e.action === action) : all, demo: true };
  }
}

/** The caller's org settings (name/locale/timezone + bottleneck thresholds). */
export async function getOrgSettings(): Promise<AdminResult<OrgSettings>> {
  const supabase = getClient();
  if (!supabase) return { data: mockOrgSettings(), demo: true };
  try {
    const { orgId } = await getOwnerContext();
    const { data, error } = await supabase
      .from('organizations')
      .select('id,name,slug,locale,timezone,settings')
      .eq('id', orgId)
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return { data: mockOrgSettings(), demo: true };
    const settings = (data.settings ?? {}) as Record<string, unknown>;
    const bn = (settings.bottleneck ?? {}) as Record<string, unknown>;
    const def = mockOrgSettings().bottleneck;
    return {
      data: {
        id: String(data.id),
        name: String(data.name ?? ''),
        slug: String(data.slug ?? ''),
        locale: String(data.locale ?? 'it'),
        timezone: String(data.timezone ?? 'Europe/Rome'),
        bottleneck: {
          inactivity_days: Number(bn.inactivity_days ?? def.inactivity_days),
          followup_overdue_count: Number(bn.followup_overdue_count ?? def.followup_overdue_count),
          min_volume_conoscitiva: Number(bn.min_volume_conoscitiva ?? def.min_volume_conoscitiva),
        },
      },
      demo: false,
    };
  } catch {
    return { data: mockOrgSettings(), demo: true };
  }
}

export interface UpdateOrgSettingsInput {
  name: string;
  timezone: string;
  bottleneck: OrgSettings['bottleneck'];
}

export interface UpdateOrgSettingsResult {
  data: OrgSettings;
  demo: boolean;
  ok: boolean;
}

/** Update org name/timezone + bottleneck thresholds (demo-safe). */
export async function updateOrgSettings(
  input: UpdateOrgSettingsInput,
): Promise<UpdateOrgSettingsResult> {
  const supabase = getClient();
  const current = await getOrgSettings();
  const next: OrgSettings = {
    ...current.data,
    name: input.name,
    timezone: input.timezone,
    bottleneck: input.bottleneck,
  };
  if (!supabase) return { data: next, demo: true, ok: true };
  try {
    const { orgId } = await getOwnerContext();
    // Merge into existing settings so we never clobber other keys (e.g. theme).
    const { data: cur } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle<Record<string, unknown>>();
    const settings = {
      ...((cur?.settings as Record<string, unknown>) ?? {}),
      bottleneck: input.bottleneck,
    };
    const { error } = await supabase
      .from('organizations')
      .update({
        name: input.name,
        timezone: input.timezone,
        settings,
      })
      .eq('id', orgId);
    return { data: next, demo: false, ok: !error };
  } catch {
    return { data: next, demo: true, ok: true };
  }
}
