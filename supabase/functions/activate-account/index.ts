// =============================================================================
// activate-account — profile-preserving CRM-access activation (doc 07 §4.1).
//
// Invoked UNAUTHENTICATED by an invitee from /invito/[token]. In one flow:
//   1) hash the raw token, look up the (pending, unexpired) invitation to get the
//      invitee email (service role — the invitee has no session yet),
//   2) create the auth.users login with the chosen password (admin API),
//   3) call accept_invitation(token_hash, user_id) which (SECURITY DEFINER)
//      activates the memberships row against the EXISTING marketers profile and
//      consumes the invitation. The marketers row is never touched.
// Idempotent: a retry where the login already exists / invitation already
// accepted returns the same membership id.
//
// Request  (POST, verify_jwt=false): { token: string, password: string }
// Response (200): { membership_id: uuid, email: string }
// =============================================================================
import { preflight } from '../_shared/cors.ts';
import { json, error, mapPgError } from '../_shared/http.ts';
import { sha256Hex } from '../_shared/token.ts';
import { adminClient } from '../_shared/supabase.ts';

interface Body {
  token?: string;
  password?: string;
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

  const token = body.token?.trim();
  const password = body.password ?? '';
  if (!token) return error('token_required', 400);
  if (password.length < 8) return error('password_too_short', 400);

  const tokenHash = await sha256Hex(token);
  const admin = adminClient();

  // 1) Resolve the invitee email from the (still-pending) invitation.
  const { data: inv, error: invErr } = await admin
    .from('account_invitations')
    .select('email,status,expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (invErr) return error('lookup_failed', 500, invErr.message);
  if (!inv) return error('invalid_token', 404);
  if (inv.status !== 'pending' && inv.status !== 'accepted')
    return error('invitation_not_pending', 409);
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now())
    return error('invitation_expired', 410);

  const email = String(inv.email);

  // 2) Create (or resolve) the auth.users login.
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.data?.user) {
    userId = created.data.user.id;
  } else {
    // Already registered (retry / pre-existing login): find the user by email.
    const list = await admin.auth.admin.listUsers();
    userId =
      list.data?.users.find(
        (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
      )?.id ?? null;
    if (!userId) {
      return error('user_create_failed', 500, created.error?.message);
    }
  }

  // 3) Activate the membership (profile-preserving, idempotent).
  const { data: membershipId, error: acceptErr } = await admin.rpc(
    'accept_invitation',
    { p_token_hash: tokenHash, p_user_id: userId },
  );

  if (acceptErr) {
    const { status, code } = mapPgError(acceptErr.message);
    return error(code, status, acceptErr.message);
  }

  return json({ membership_id: membershipId, email });
});
