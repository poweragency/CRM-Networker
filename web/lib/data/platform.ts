import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getCurrentClaims } from '@/lib/data/session';
import { logError } from '@/lib/log';
import { passwordWeakness } from '@/lib/password';

/**
 * Platform (super-admin) data layer. The super-admin is external to every org
 * (ADR-009 #3): it lists ALL organizations, creates a new org together with its
 * first owner login + root marketer node, and suspends/reactivates an org on
 * (non-)renewal. Creation/suspension use the service-role admin client (bypasses
 * RLS, manages auth users); listing uses the RLS client (the platform RPC
 * self-gates on is_platform_admin). Every entry point re-checks the caller is a
 * platform admin server-side — the UI gate is not a security boundary.
 */

export interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  suspendedAt: string | null;
  createdAt: string;
  memberCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
}

async function isPlatformAdmin(): Promise<boolean> {
  const { claims } = await getCurrentClaims();
  return claims.is_platform_admin === true;
}

/** All organizations (platform super-admin only). Empty list when not authorized. */
export async function listOrgsForPlatform(): Promise<{ data: PlatformOrg[]; demo: boolean }> {
  const supabase = createClient();
  if (!supabase) return { data: [], demo: true };
  if (!(await isPlatformAdmin())) return { data: [], demo: false };
  try {
    const { data, error } = await supabase.rpc('platform_list_orgs');
    if (error) {
      logError('listOrgsForPlatform', error);
      return { data: [], demo: false };
    }
    const rows = ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      status: (r.status === 'suspended' ? 'suspended' : 'active') as 'active' | 'suspended',
      suspendedAt: (r.suspended_at as string | null) ?? null,
      createdAt: String(r.created_at),
      memberCount: Number(r.member_count ?? 0),
      ownerName: (r.owner_name as string | null) ?? null,
      ownerEmail: (r.owner_email as string | null) ?? null,
    } satisfies PlatformOrg));
    return { data: rows, demo: false };
  } catch (e) {
    logError('listOrgsForPlatform', e);
    return { data: [], demo: false };
  }
}

export type CreateOrgError =
  | 'forbidden'
  | 'service_missing'
  | 'invalid'
  | 'slug_taken'
  | 'email_taken'
  | 'weak_password'
  | 'failed';

export interface CreateOrgInput {
  name: string;
  slug: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface CreateOrgResult {
  ok: boolean;
  error?: CreateOrgError;
  orgId?: string;
}

/** Slug: lowercase, alnum + dashes, 2..63 chars (matches organizations_slug_len). */
export function normalizeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * Create a new org + its first OWNER login + root marketer node, transactionally
 * enough to roll back on failure. Service-role only. The owner can sign in
 * immediately with the temporary password and change it from the app.
 */
export async function createOrgWithOwner(input: CreateOrgInput): Promise<CreateOrgResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: 'forbidden' };
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: 'service_missing' };

  const name = input.name.trim();
  const slug = normalizeSlug(input.slug || input.name);
  const ownerFirst = input.ownerFirstName.trim();
  const ownerLast = input.ownerLastName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!name || slug.length < 2 || !ownerFirst || !ownerLast || !ownerEmail) {
    return { ok: false, error: 'invalid' };
  }
  if (passwordWeakness(input.ownerPassword)) return { ok: false, error: 'weak_password' };

  // Slug must be free (admin bypasses RLS).
  const { data: dupe } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (dupe) return { ok: false, error: 'slug_taken' };

  // 1) Org row.
  const { data: orgRow, error: orgErr } = await admin
    .from('organizations')
    .insert({ name, slug })
    .select('id')
    .single();
  if (orgErr || !orgRow) {
    logError('createOrgWithOwner.org', orgErr);
    return { ok: false, error: 'failed' };
  }
  const orgId = String((orgRow as { id: string }).id);

  // 2) Root marketer (top rank, active) via the operator-driven RPC.
  const { data: rootId, error: rootErr } = await admin.rpc('place_marketer', {
    p_org_id: orgId,
    p_parent_id: null,
    p_leg: null,
    p_sponsor_id: null,
    p_name: ownerFirst,
    p_surname: ownerLast,
    p_rank: 'vice_president',
    p_status: 'active',
    p_created_by: null,
  });
  if (rootErr || !rootId) {
    logError('createOrgWithOwner.root', rootErr);
    await admin.from('organizations').delete().eq('id', orgId); // cascade
    return { ok: false, error: 'failed' };
  }

  // 3) Owner login (auto-confirmed: no email round-trip).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: input.ownerPassword,
    email_confirm: true,
  });
  const userId = created?.user?.id;
  if (createErr || !userId) {
    logError('createOrgWithOwner.createUser', createErr);
    await admin.from('organizations').delete().eq('id', orgId);
    const msg = (createErr?.message ?? '').toLowerCase();
    const weak =
      msg.includes('weak') || msg.includes('leaked') || msg.includes('pwned') || msg.includes('breach');
    const taken = msg.includes('already') || msg.includes('exists') || msg.includes('registered');
    return { ok: false, error: weak ? 'weak_password' : taken ? 'email_taken' : 'failed' };
  }

  // 4) Owner membership (active, full CRM perms).
  const { error: memErr } = await admin.from('memberships').insert({
    org_id: orgId,
    user_id: userId,
    marketer_id: String(rootId),
    role: 'owner',
    status: 'active',
    permissions: {
      crm_access: true,
      export_enabled: true,
      manage_documents: true,
      view_branch_comparison: true,
    },
  });
  if (memErr) {
    logError('createOrgWithOwner.membership', memErr);
    await admin.auth.admin.deleteUser(userId);
    await admin.from('organizations').delete().eq('id', orgId);
    return { ok: false, error: 'failed' };
  }

  return { ok: true, orgId };
}

/**
 * Suspend (non-renewal) or reactivate an org. Data is never touched. Uses the
 * RLS client (NOT the service-role): the platform admin already has UPDATE rights
 * on organizations via RLS (organizations_admin_update → is_platform_admin), so
 * this works even when the service-role key isn't configured.
 */
export async function setOrgStatus(
  orgId: string,
  suspend: boolean,
): Promise<{ ok: boolean; error?: 'forbidden' | 'failed' }> {
  if (!(await isPlatformAdmin())) return { ok: false, error: 'forbidden' };
  const supabase = createClient();
  if (!supabase) return { ok: false, error: 'failed' };
  try {
    const { data, error } = await supabase
      .from('organizations')
      .update({
        status: suspend ? 'suspended' : 'active',
        suspended_at: suspend ? new Date().toISOString() : null,
      })
      .eq('id', orgId)
      .select('id')
      .maybeSingle();
    // No row back ⇒ RLS blocked it (or the org is gone) — surface as a failure
    // instead of a false success.
    if (error || !data) {
      logError('setOrgStatus', error ?? new Error('no row updated'), { orgId });
      return { ok: false, error: 'failed' };
    }
    return { ok: true };
  } catch (e) {
    logError('setOrgStatus', e);
    return { ok: false, error: 'failed' };
  }
}
