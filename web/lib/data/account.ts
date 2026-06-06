import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getCurrentClaims } from '@/lib/data/session';

/**
 * CRM-access activation: create a login (auth user) for an EXISTING marketer and
 * activate a membership linking it. The UI gates the affordance (consultant+
 * target, admin/team_leader caller); here we ALSO verify the caller can SEE the
 * target via the RLS-bound client (own subtree / admin) BEFORE using the
 * service-role admin client (which bypasses RLS) to create the user + membership.
 * Never throws.
 */

export interface RevokeResult {
  ok: boolean;
}

/**
 * Revoke the login of a marketer that has just been removed from the tree: delete
 * the membership AND the auth user, so the removed person can no longer sign in.
 *
 * Authorization is enforced UPSTREAM by `remove_marketer` (RLS, Team Leader+);
 * the caller invokes this only after that RLS-gated removal succeeded. Uses the
 * service-role admin client (bypasses RLS). Best-effort — each step is isolated so
 * a failure on one doesn't block the other; never throws.
 */
export async function revokeAccountForMarketer(
  marketerId: string,
): Promise<RevokeResult> {
  const { claims } = await getCurrentClaims();
  const orgId = claims.org_id;
  const admin = getAdminClient();
  if (!admin || !orgId) return { ok: false };

  let userId: string | null = null;
  try {
    const { data } = await admin
      .from('memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('marketer_id', marketerId)
      .maybeSingle();
    userId = (data as { user_id: string | null } | null)?.user_id ?? null;
  } catch {
    /* ignore — proceed to best-effort cleanup */
  }

  // Remove the membership row (login link) first.
  try {
    await admin
      .from('memberships')
      .delete()
      .eq('org_id', orgId)
      .eq('marketer_id', marketerId);
  } catch {
    /* ignore */
  }

  // Delete the auth user → the account can no longer authenticate.
  if (userId) {
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      return { ok: false };
    }
  }

  return { ok: true };
}

export type ActivateError = 'forbidden' | 'service_missing' | 'email_taken' | 'failed';

export interface ActivateResult {
  ok: boolean;
  error?: ActivateError;
}

const BASE_PERMS = {
  crm_access: true,
  export_enabled: false,
  manage_documents: false,
  view_branch_comparison: false,
};

export async function activateCrmAccess(
  targetMarketerId: string,
  email: string,
  password: string,
): Promise<ActivateResult> {
  const { claims } = await getCurrentClaims();
  const orgId = claims.org_id;
  if (!orgId) return { ok: false, error: 'forbidden' };

  // 1) Authorize via RLS: the target must be visible to the caller (subtree/admin).
  const rls = createClient();
  if (!rls) return { ok: false, error: 'failed' };
  const { data: target } = await rls
    .from('marketers')
    .select('id,org_id')
    .eq('id', targetMarketerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!target || (target as { org_id: string }).org_id !== orgId) {
    return { ok: false, error: 'forbidden' };
  }

  // 2) Service-role admin client (must be configured server-side).
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: 'service_missing' };

  // Already has a login?
  const { data: existing } = await admin
    .from('memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('marketer_id', targetMarketerId)
    .maybeSingle();
  if (existing && (existing as { user_id: string | null }).user_id) {
    return { ok: false, error: 'email_taken' };
  }

  // Create the auth user (auto-confirmed: no email round-trip needed).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  const userId = created?.user?.id;
  if (createErr || !userId) {
    return { ok: false, error: 'email_taken' };
  }

  // Activate the membership (insert, or adopt a pre-existing placeholder row).
  const { error: memErr } = await admin.from('memberships').upsert(
    {
      org_id: orgId,
      user_id: userId,
      marketer_id: targetMarketerId,
      role: 'member',
      status: 'active',
      permissions: BASE_PERMS,
    },
    { onConflict: 'org_id,marketer_id' },
  );
  if (memErr) {
    // Roll back the orphaned auth user (best effort).
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: 'failed' };
  }

  return { ok: true };
}
