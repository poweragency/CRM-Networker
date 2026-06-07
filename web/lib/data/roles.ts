import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { logError } from '@/lib/log';
import { RANK_ORDER, type MarketerRank, type MembershipRole } from '@/lib/types/db';

/** Co-admin requires Team Leader or higher. */
export function canBeCoAdmin(rank: MarketerRank): boolean {
  return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf('team_leader');
}

/**
 * Org role management (server-only). Lists the org's accounts with their app
 * role and lets an admin promote/demote the co-admin role. Reads + writes go
 * through RLS: `memberships_select` (admins see all) and `memberships_admin_write`
 * (admin/owner only) enforce that only an admin can change roles. Demo-safe.
 */

export interface OrgRoleRow {
  marketer_id: string;
  display_name: string;
  rank: MarketerRank;
  role: MembershipRole;
}

function mockRoles(): OrgRoleRow[] {
  return [
    { marketer_id: 'demo-omar', display_name: 'Omar Bouzriba', rank: 'team_leader', role: 'member' },
    { marketer_id: 'demo-fra', display_name: "Francesco D'agostino", rank: 'consultant', role: 'co_admin' },
  ];
}

/** All accounts (memberships) in the caller's org with their role. */
export async function listOrgRoles(): Promise<{ data: OrgRoleRow[]; demo: boolean }> {
  const supabase = getClient();
  if (!supabase) return { data: mockRoles(), demo: true };
  try {
    const { orgId } = await getOwnerContext();
    const { data, error } = await supabase
      .from('memberships')
      .select('marketer_id, role, marketers(display_name, rank)')
      .eq('org_id', orgId)
      .is('deleted_at', null);
    if (error || !data) return { data: [], demo: false };
    const rows = (data as Record<string, unknown>[])
      .map((r) => {
        const mk = (r.marketers ?? {}) as { display_name?: string; rank?: string };
        return {
          marketer_id: String(r.marketer_id),
          display_name: mk.display_name ?? '—',
          rank: (mk.rank as MarketerRank) ?? 'executive',
          role: (r.role as MembershipRole) ?? 'member',
        };
      })
      // Only Team Leader and above are eligible for co-admin — hide everyone else
      // so the Roles list stays readable at scale.
      .filter((row) => canBeCoAdmin(row.rank))
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));
    return { data: rows, demo: false };
  } catch {
    return { data: [], demo: false };
  }
}

export interface SetRoleResult {
  ok: boolean;
  demo: boolean;
}

/** Set a member's app role (admin-only via RLS). */
export async function setMemberRole(
  marketerId: string,
  role: MembershipRole,
): Promise<SetRoleResult> {
  const supabase = getClient();
  if (!supabase) return { ok: true, demo: true };
  try {
    const { orgId } = await getOwnerContext();
    // Co-admin can be granted only to Team Leader or higher.
    if (role === 'co_admin') {
      const { data: mk } = await supabase
        .from('marketers')
        .select('rank')
        .eq('id', marketerId)
        .maybeSingle<{ rank: MarketerRank }>();
      if (!mk?.rank || !canBeCoAdmin(mk.rank)) {
        return { ok: false, demo: false };
      }
    }
    // .select() so an RLS-denied UPDATE (0 rows, NO error) is reported as a real
    // failure instead of a silent false success.
    const { data: updated, error } = await supabase
      .from('memberships')
      .update({ role })
      .eq('org_id', orgId)
      .eq('marketer_id', marketerId)
      .select('marketer_id');
    if (error) {
      logError('setMemberRole', error, { marketerId, role });
      return { ok: false, demo: false };
    }
    return { ok: (updated?.length ?? 0) > 0, demo: false };
  } catch (e) {
    logError('setMemberRole', e, { marketerId, role });
    return { ok: false, demo: false };
  }
}
