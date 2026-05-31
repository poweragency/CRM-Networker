import 'server-only';
import { getClient } from '@/lib/data/crm-shared';
import type {
  AccountInvitation,
  InvitationStatus,
  MembershipRole,
} from '@/lib/types/db';
import { demoId } from '@/lib/data/mock/_shared';
import { mockInvitations } from '@/lib/data/mock/admin';
import { getMarketerOptions } from '@/lib/data/admin';

/**
 * Account-invitation data access (server-only) for /admin/attivazioni — the
 * "Activate CRM Access" workflow (doc 01 §3, ADR-003). Listing reads
 * `account_invitations`; creation/revocation are demo-safe. Creating the real
 * invitation (mint + hash a single-use token, send the email) is done by the
 * `create-invitation` Edge Function — here it is optimistic/simulated, while
 * revoke uses the `revoke_invitation` RPC when configured.
 */

export interface InvitationsResult {
  data: AccountInvitation[];
  demo: boolean;
}

export async function listInvitations(
  limit = 50,
): Promise<InvitationsResult> {
  const supabase = getClient();
  if (!supabase) return { data: mockInvitations(), demo: true };
  try {
    const { data, error } = await supabase
      .from('account_invitations')
      .select('id,marketer_id,email,role,status,expires_at,accepted_at,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return { data: mockInvitations(), demo: true };

    // Resolve profile names from the marketer options map (avoids FK-embed guesswork).
    const names = new Map<string, string>();
    const opts = await getMarketerOptions();
    for (const o of opts.data) names.set(o.id, o.display_name);

    const rows: AccountInvitation[] = (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      marketer_id: String(r.marketer_id),
      marketer_name: names.get(String(r.marketer_id)) ?? '—',
      email: String(r.email),
      role: r.role as MembershipRole,
      status: r.status as InvitationStatus,
      invited_by_name: null,
      expires_at: String(r.expires_at),
      accepted_at: (r.accepted_at as string | null) ?? null,
      created_at: String(r.created_at),
    }));
    return { data: rows, demo: false };
  } catch {
    return { data: mockInvitations(), demo: true };
  }
}

export interface CreateInvitationInput {
  marketerId: string;
  marketerName: string;
  email: string;
  role: MembershipRole;
  crmAccess: boolean;
}

export interface CreateInvitationResult {
  invitation: AccountInvitation;
  demo: boolean;
  ok: boolean;
}

/**
 * Issue an activation invitation. With env, invokes the `create-invitation` Edge
 * Function (mint + hash token, `create_invitation` RPC under the caller's JWT,
 * optional email); the returned id stamps the optimistic row. Demo-safe: with no
 * env, or on any error, it returns a SIMULATED `pending` row and never throws.
 */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const base: AccountInvitation = {
    id: demoId('inv'),
    marketer_id: input.marketerId,
    marketer_name: input.marketerName,
    email: input.email,
    role: input.role,
    status: 'pending',
    invited_by_name: null,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    accepted_at: null,
    created_at: new Date().toISOString(),
  };

  const supabase = getClient();
  if (!supabase) return { invitation: base, demo: true, ok: true };

  try {
    const { data, error } = await supabase.functions.invoke('create-invitation', {
      body: {
        marketer_id: input.marketerId,
        email: input.email,
        role: input.role,
        crm_access: input.crmAccess,
      },
    });
    const invitationId = (data as { invitation_id?: string } | null)?.invitation_id;
    if (error || !invitationId) {
      // Edge Function not deployed / call failed → simulate so the UI flows.
      return { invitation: base, demo: true, ok: true };
    }
    return { invitation: { ...base, id: String(invitationId) }, demo: false, ok: true };
  } catch {
    return { invitation: base, demo: true, ok: true };
  }
}

export interface RevokeInvitationResult {
  demo: boolean;
  ok: boolean;
}

/** Revoke a pending invitation (`revoke_invitation` RPC; demo-safe). */
export async function revokeInvitation(
  id: string,
): Promise<RevokeInvitationResult> {
  const supabase = getClient();
  if (!supabase) return { demo: true, ok: true };
  try {
    const { error } = await supabase.rpc('revoke_invitation', {
      p_invitation_id: id,
    });
    return { demo: false, ok: !error };
  } catch {
    return { demo: true, ok: true };
  }
}
