import { RANK_ORDER } from '@/lib/types/db';
import { ROLE_ORDER } from '@/lib/nav';
import type { MarketerRank, MembershipRole, SessionClaims } from '@/lib/types/db';

/**
 * "Attiva accesso CRM" authorization (doc 03 §3 / ADR-003): the action targets an
 * EXISTING marketer profile and is allowed for role admin/owner OR rank ≥
 * team_leader (within the caller's own subtree). The subtree constraint is
 * enforced server-side by RLS on the activation RPC; the UI gates on role/rank so
 * the affordance only appears for callers who could plausibly perform it.
 *
 * The target node must itself be a *profile without CRM access* (status pending /
 * inactive being the typical "needs activation" states). A node that is already
 * `active` is treated as already having access and the action is hidden.
 */

const MIN_RANK_FOR_ACTIVATION: MarketerRank = 'consultant';

function roleAtLeast(role: MembershipRole, min: MembershipRole): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);
}

function rankAtLeast(rank: MarketerRank, min: MarketerRank): boolean {
  return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(min);
}

/** Can the viewer perform "Attiva accesso CRM" at all (role/rank capability)? */
export function canActivateCrm(claims: Pick<SessionClaims, 'role' | 'rank'>): boolean {
  return (
    roleAtLeast(claims.role, 'admin') ||
    rankAtLeast(claims.rank, MIN_RANK_FOR_ACTIVATION)
  );
}

/**
 * Adding a member from the tree creates the node AND activates its CRM login, so
 * the affordance must match the SAME capability the server enforces for account
 * creation (`canManageAccounts`): admin/owner OR rank ≥ consultant. Showing the
 * "+" to everyone made it a dead control for sub-consultant ranks (the submit
 * failed at activation with a generic error). Placement is still scoped to the
 * caller's visible subtree by RLS.
 */
export function canAddMember(claims: Pick<SessionClaims, 'role' | 'rank'>): boolean {
  return canActivateCrm(claims);
}
