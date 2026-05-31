// =============================================================================
// create-invitation — issue an "Activate CRM Access" invitation (doc 07 §4 / ADR-003).
//
// Invoked by an authenticated admin/owner or a rank>=team_leader leader. Mints a
// single-use raw token, stores only its SHA-256 hash via the create_invitation
// RPC (which enforces the ADR-003 eligibility/authority gate under the caller's
// JWT), builds the invite link and — when RESEND_API_KEY is set — emails it.
// The raw token is returned in the response (so an admin can copy the link even
// without email configured); it is NEVER persisted.
//
// Request  (POST, verify_jwt=true):
//   { marketer_id: uuid, email: string, role?: 'member'|'manager'|'admin',
//     crm_access?: boolean, expires_at?: ISO8601 }
// Response (200): { invitation_id: uuid, invite_url: string, emailed: boolean }
// =============================================================================
import { preflight } from '../_shared/cors.ts';
import { json, error, mapPgError } from '../_shared/http.ts';
import { mintToken, sha256Hex } from '../_shared/token.ts';
import { userClient, siteUrl } from '../_shared/supabase.ts';

interface Body {
  marketer_id?: string;
  email?: string;
  role?: 'member' | 'manager' | 'admin';
  crm_access?: boolean;
  expires_at?: string;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return error('method_not_allowed', 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return error('invalid_json', 400);
  }

  const marketerId = body.marketer_id?.trim();
  const email = body.email?.trim();
  if (!marketerId) return error('marketer_id_required', 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return error('email_invalid', 400);

  const rawToken = mintToken();
  const tokenHash = await sha256Hex(rawToken);

  const supabase = userClient(req);
  const { data, error: rpcError } = await supabase.rpc('create_invitation', {
    p_marketer_id: marketerId,
    p_email: email,
    p_token_hash: tokenHash,
    p_role: body.role ?? 'member',
    p_permissions: body.crm_access ? { crm_access: true } : {},
    p_expires_at: body.expires_at ?? null,
  });

  if (rpcError) {
    const { status, code } = mapPgError(rpcError.message);
    return error(code, status, rpcError.message);
  }

  const inviteUrl = `${siteUrl(req)}/invito/${rawToken}`;

  // Best-effort email via Resend (optional). Failure to email does not fail the
  // invitation — the admin can still copy invite_url from the response.
  let emailed = false;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromAddr = Deno.env.get('INVITE_FROM_EMAIL');
  if (resendKey && fromAddr) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: email,
          subject: 'Attiva il tuo accesso CRM',
          html:
            `<p>Sei stato invitato ad attivare il tuo accesso CRM.</p>` +
            `<p><a href="${inviteUrl}">Attiva l'accesso</a></p>` +
            `<p>Il link scade tra 7 giorni.</p>`,
        }),
      });
      emailed = res.ok;
    } catch {
      emailed = false;
    }
  }

  return json({ invitation_id: data, invite_url: inviteUrl, emailed }, 201);
});
