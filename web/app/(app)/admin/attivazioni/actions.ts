'use server';

import {
  createInvitation,
  revokeInvitation,
  type CreateInvitationInput,
  type CreateInvitationResult,
  type RevokeInvitationResult,
} from '@/lib/data/admin-invitations';
import { currentIsOrgAdmin } from '@/lib/data/authz';

/**
 * Server Actions backing /admin/attivazioni. Delegate to the server-only data
 * layer, which is demo-safe: create is optimistic (the real token mint/email is
 * the `create-invitation` Edge Function), revoke uses the `revoke_invitation`
 * RPC. Both return a `demo` flag the client uses for the right toast.
 */

export async function createInvitationAction(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  // Only an org admin may grant an ELEVATED role. A non-admin (the action is
  // POST-dispatchable) is coerced down to 'member' so it can never mint an admin
  // invitation for an email it controls and self-escalate on acceptance. The DB
  // eligibility guard enforces the same cap — this is defense-in-depth.
  const role =
    input.role !== 'member' && !(await currentIsOrgAdmin()) ? 'member' : input.role;
  return createInvitation({ ...input, role });
}

export async function revokeInvitationAction(
  id: string,
): Promise<RevokeInvitationResult> {
  return revokeInvitation(id);
}
