'use server';

import { revalidatePath } from 'next/cache';
import { saveOrgTheme, type SaveThemeResult } from '@/lib/data/org-theme';
import { setMemberRole, type SetRoleResult } from '@/lib/data/roles';
import { currentIsOrgAdmin } from '@/lib/data/authz';
import {
  createZoomCall,
  deleteZoomCall,
  type CallInput,
  type CallResult,
} from '@/lib/data/zoom-calls';
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
  // Role changes are admin-only. Re-check server-side: this action lives in the
  // /impostazioni module that limited members can open, so middleware won't block
  // a direct POST.
  if (!(await currentIsOrgAdmin())) return { ok: false, demo: false };
  const res = await setMemberRole(marketerId, role);
  if (res.ok && !res.demo) revalidatePath('/impostazioni');
  return res;
}

/** Create a zoom call (admin → org/team; co-admin → team, RLS-enforced). */
export async function createZoomCallAction(input: CallInput): Promise<CallResult> {
  const res = await createZoomCall(input);
  if (res.ok && !res.demo) {
    revalidatePath('/impostazioni');
    revalidatePath('/presenze');
  }
  return res;
}

/** Delete a zoom call (admin → any; co-admin → own, RLS-enforced). */
export async function deleteZoomCallAction(id: string): Promise<CallResult> {
  const res = await deleteZoomCall(id);
  if (res.ok && !res.demo) {
    revalidatePath('/impostazioni');
    revalidatePath('/presenze');
  }
  return res;
}
