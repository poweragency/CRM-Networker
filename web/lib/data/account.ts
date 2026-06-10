import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getCurrentClaims } from '@/lib/data/session';
import { logError } from '@/lib/log';
import { sendWelcomeEmail } from '@/lib/email/welcome';
import { passwordWeakness } from '@/lib/password';
import { RANK_ORDER, type SessionClaims } from '@/lib/types/db';

/**
 * Caller authority for service-role account operations (ADR-003): admin/owner OR
 * rank >= consultant. Consultants and up may onboard (add + activate) people in
 * their own subtree — recruiting is the core activity, not an admin-only one. This
 * is enforced SERVER-SIDE here — the UI gate is not a security boundary, and these
 * helpers wield the service-role client (bypasses RLS), so they must self-authorize
 * before any privileged call. (Account REVOCATION stays gated upstream by
 * remove_marketer, which still requires Team Leader+.)
 */
function canManageAccounts(claims: Pick<SessionClaims, 'role' | 'rank'>): boolean {
  if (claims.role === 'owner' || claims.role === 'admin') return true;
  return RANK_ORDER.indexOf(claims.rank) >= RANK_ORDER.indexOf('consultant');
}

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
  // Authority check: only admins/team-leaders may revoke a login (mirrors the
  // remove_marketer RPC gate; defense in depth alongside RLS).
  if (!canManageAccounts(claims)) return { ok: false };
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
    } catch (e) {
      logError('revokeAccountForMarketer.deleteUser', e, { marketerId });
      return { ok: false };
    }
  }

  return { ok: true };
}

export type ActivateError =
  | 'forbidden'
  | 'service_missing'
  | 'email_taken'
  | 'weak_password'
  | 'failed';

/**
 * Classify a Supabase Auth createUser error so the UI can show the RIGHT message.
 * With "leaked password protection" on, a weak/breached password is rejected with
 * a `weak_password` code — distinct from an email already in use.
 */
function classifyAuthError(err: { code?: string; message?: string } | null): ActivateError {
  const code = (err?.code ?? '').toLowerCase();
  const msg = (err?.message ?? '').toLowerCase();
  if (
    code === 'weak_password' ||
    msg.includes('weak') ||
    msg.includes('leaked') ||
    msg.includes('pwned') ||
    msg.includes('breach') ||
    msg.includes('compromis')
  ) {
    return 'weak_password';
  }
  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    msg.includes('already') ||
    msg.includes('registered') ||
    msg.includes('exists')
  ) {
    return 'email_taken';
  }
  return 'failed';
}

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

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

/** Find an auth user id by email via the admin API (paged). null if not found. */
async function findAuthUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < 200) break; // last page reached
  }
  return null;
}

/**
 * If `email` is held by an ORPHANED login — an auth user with NO membership anywhere
 * (a leftover from a prior deletion / data wipe) — hard-delete that login so the
 * email becomes reusable, and return true. A login that STILL has any membership is
 * a real account and is left untouched (returns false). This is what makes account
 * deletion effectively definitive: a removed person's email can be onboarded again.
 */
async function reclaimOrphanEmail(admin: AdminClient, email: string): Promise<boolean> {
  const userId = await findAuthUserIdByEmail(admin, email);
  if (!userId) return false;
  const { data: mem } = await admin
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (mem) return false; // still linked → real account, not an orphan
  try {
    await admin.auth.admin.deleteUser(userId);
    return true;
  } catch (e) {
    logError('reclaimOrphanEmail.deleteUser', e, { email });
    return false;
  }
}

export async function activateCrmAccess(
  targetMarketerId: string,
  email: string,
  password: string,
  fullName?: string,
): Promise<ActivateResult> {
  const { claims } = await getCurrentClaims();
  const orgId = claims.org_id;
  if (!orgId) return { ok: false, error: 'forbidden' };
  // Authority check FIRST: provisioning a login is a privileged op (service-role,
  // attacker-chosen credentials). Require admin/owner OR rank >= team_leader.
  // The UI gate is NOT a security boundary.
  if (!canManageAccounts(claims)) return { ok: false, error: 'forbidden' };

  // Reject trivially-weak/common passwords server-side too (the action is
  // POST-dispatchable, so the client check isn't a boundary). Supabase's optional
  // leaked-password protection is the breach check on top.
  if (passwordWeakness(password)) return { ok: false, error: 'weak_password' };

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
  let { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;

  // If the email is "taken" by an ORPHANED login (a leftover from a prior deletion
  // or a data wipe — no membership anywhere), reclaim it (hard-delete the stale
  // login) and retry, so a previously-removed person's email can be reused. A login
  // that still has a membership is a real account and is left untouched.
  if ((createErr || !userId) && classifyAuthError(createErr) === 'email_taken') {
    if (await reclaimOrphanEmail(admin, email)) {
      const retry = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      created = retry.data;
      createErr = retry.error;
      userId = retry.data?.user?.id;
    }
  }

  if (createErr || !userId) {
    if (createErr) logError('activateCrmAccess.createUser', createErr);
    // Distinguish weak/leaked password from email-already-in-use so the UI can
    // tell the admin exactly what to change (audit: was always 'email_taken').
    return {
      ok: false,
      error: createErr ? classifyAuthError(createErr) : 'failed',
    };
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
    logError('activateCrmAccess.membership', memErr, { targetMarketerId });
    // Roll back the orphaned auth user (best effort).
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: 'failed' };
  }

  // Welcome email (best-effort: never blocks/fails the account creation). We DO
  // await it on purpose: on Vercel serverless a fire-and-forget promise can be
  // dropped when the function freezes after the response, so awaiting is what
  // actually guarantees delivery (the ~Resend latency is fine for an admin action).
  await sendWelcomeEmail(email, fullName ?? '');

  return { ok: true };
}
