import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';

/**
 * Org identity (name + logo) data access. The name + logo are shown in the shell
 * brand (sidebar, top-left). Reads are allowed to any member; writes are admin/
 * owner-only (RLS `organizations_admin_update`). Demo-safe.
 */

export interface OrgIdentity {
  name: string;
  logoUrl: string | null;
  /** Org sospesa (mancato rinnovo): i membri vanno bloccati con un messaggio. */
  suspended: boolean;
}

/** The current org's display name + logo url + suspension flag (null in demo / when unset). */
export async function getOrgIdentity(): Promise<{ data: OrgIdentity | null; demo: boolean }> {
  const supabase = getClient();
  if (!supabase) return { data: null, demo: true };
  try {
    const { orgId } = await getOwnerContext();
    const { data } = await supabase
      .from('organizations')
      .select('name,logo_url,status')
      .eq('id', orgId)
      .maybeSingle<{ name: string; logo_url: string | null; status: string | null }>();
    if (!data) return { data: null, demo: false };
    return {
      data: {
        name: data.name,
        logoUrl: data.logo_url ?? null,
        suspended: data.status === 'suspended',
      },
      demo: false,
    };
  } catch {
    return { data: null, demo: false };
  }
}

export interface SaveIdentityResult {
  ok: boolean;
  demo: boolean;
}

/** Update the org name and/or logo url (admin-only via RLS). */
export async function updateOrgIdentity(patch: {
  name?: string;
  logo_url?: string | null;
}): Promise<SaveIdentityResult> {
  const supabase = getClient();
  if (!supabase) return { ok: true, demo: true };
  try {
    const { orgId } = await getOwnerContext();
    const upd: Record<string, unknown> = {};
    if (typeof patch.name === 'string') upd.name = patch.name;
    if (patch.logo_url !== undefined) upd.logo_url = patch.logo_url;
    if (Object.keys(upd).length === 0) return { ok: true, demo: false };
    const { error } = await supabase.from('organizations').update(upd).eq('id', orgId);
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
