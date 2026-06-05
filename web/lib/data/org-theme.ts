import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import type { OrgTheme } from '@/lib/theme';

/**
 * Org theme persistence (server-only). Stored under `organizations.settings.theme`
 * (JSONB). Reading is allowed to any org member (RLS `organizations_select`);
 * writing is admin/owner-only and enforced by RLS (`organizations_admin_update`).
 * Demo-safe: no env → read returns null, write simulates success.
 */

function parseTheme(settings: Record<string, unknown> | null | undefined): OrgTheme | null {
  const t = (settings?.theme ?? null) as Partial<OrgTheme> | null;
  if (t && typeof t.background === 'string' && typeof t.navbar === 'string') {
    return { background: t.background, navbar: t.navbar };
  }
  return null;
}

/** The current org's theme (or null if none set / demo). */
export async function getOrgTheme(): Promise<OrgTheme | null> {
  const supabase = getClient();
  if (!supabase) return null;
  try {
    const { orgId } = await getOwnerContext();
    const { data } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle<Record<string, unknown>>();
    return parseTheme(data?.settings as Record<string, unknown> | undefined);
  } catch {
    return null;
  }
}

export interface SaveThemeResult {
  ok: boolean;
  /** true only when simulated (pure demo mode). */
  demo: boolean;
}

/** Save (or clear, when null) the org theme. Admin-only via RLS. */
export async function saveOrgTheme(theme: OrgTheme | null): Promise<SaveThemeResult> {
  const supabase = getClient();
  if (!supabase) return { ok: true, demo: true };
  try {
    const { orgId } = await getOwnerContext();
    // Read-modify-write so we never clobber other settings keys (bottleneck…).
    const { data: cur } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle<Record<string, unknown>>();
    const settings = { ...((cur?.settings as Record<string, unknown>) ?? {}) };
    if (theme) settings.theme = theme;
    else delete settings.theme;
    const { error } = await supabase
      .from('organizations')
      .update({ settings })
      .eq('id', orgId);
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
