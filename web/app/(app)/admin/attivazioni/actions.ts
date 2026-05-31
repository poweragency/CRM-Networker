'use server';

import {
  createInvitation,
  revokeInvitation,
  type CreateInvitationInput,
  type CreateInvitationResult,
  type RevokeInvitationResult,
} from '@/lib/data/admin-invitations';

/**
 * Server Actions backing /admin/attivazioni. Delegate to the server-only data
 * layer, which is demo-safe: create is optimistic (the real token mint/email is
 * the `create-invitation` Edge Function), revoke uses the `revoke_invitation`
 * RPC. Both return a `demo` flag the client uses for the right toast.
 */

export async function createInvitationAction(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  return createInvitation(input);
}

export async function revokeInvitationAction(
  id: string,
): Promise<RevokeInvitationResult> {
  return revokeInvitation(id);
}
