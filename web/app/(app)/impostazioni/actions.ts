'use server';

import { revalidatePath } from 'next/cache';
import { saveOrgTheme, type SaveThemeResult } from '@/lib/data/org-theme';
import { setMemberRole, type SetRoleResult } from '@/lib/data/roles';
import type { OrgTheme } from '@/lib/theme';
import type { MembershipRole } from '@/lib/types/db';

/**
 * Server action backing the Tema settings card. Persists (or clears) the org
 * theme, then revalidates the app layout so the new CSS variables apply for
 * everyone on next load.
 */
export async function saveOrgThemeAction(
  theme: OrgTheme | null,
): Promise<SaveThemeResult> {
  const res = await saveOrgTheme(theme);
  if (res.ok && !res.demo) revalidatePath('/', 'layout');
  return res;
}

/**
 * Promote/demote the co-admin role for a member. Admin-only (enforced by the
 * `memberships_admin_write` RLS policy). The target must log out/in to refresh
 * their JWT app_role.
 */
export async function setMemberRoleAction(
  marketerId: string,
  role: MembershipRole,
): Promise<SetRoleResult> {
  const res = await setMemberRole(marketerId, role);
  if (res.ok && !res.demo) revalidatePath('/impostazioni');
  return res;
}
