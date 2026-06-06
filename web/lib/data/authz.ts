import 'server-only';
import { getCurrentClaims } from '@/lib/data/session';
import type { SessionClaims } from '@/lib/types/db';

/**
 * Application-layer authorization helpers (audit A2). RLS is the data boundary;
 * these add DEFENSE-IN-DEPTH for pages/layouts and Server Actions (which are
 * POST-dispatchable to any route, bypassing middleware path-gating). Fail-closed.
 */

/** Org admins = owner or admin role (mirrors the DB is_org_admin()). */
export function isOrgAdmin(claims: Pick<SessionClaims, 'role'>): boolean {
  return claims.role === 'owner' || claims.role === 'admin';
}

/** Server-side admin check for use inside Server Actions. Fail-closed. */
export async function currentIsOrgAdmin(): Promise<boolean> {
  try {
    const { claims } = await getCurrentClaims();
    return isOrgAdmin(claims);
  } catch {
    return false;
  }
}
