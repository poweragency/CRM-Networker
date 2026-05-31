-- =============================================================================
-- File 0021 — invitation_context() — anon-safe activation-landing resolver.
-- Purpose: the /invito/[token] landing must show WHO is being activated (profile
--          name, rank, role, org) BEFORE the invitee has any session, so they can
--          confirm before setting a password. The RAW token is the bearer proof;
--          the DB only stores its SHA-256 hash (account_invitations.token_hash),
--          so this resolver is keyed by p_token_hash and returns a row ONLY for a
--          PENDING, UNEXPIRED invitation. SECURITY DEFINER so it can read the
--          invitation + its marketer/org irrespective of the (anonymous) caller's
--          RLS, while leaking nothing without possession of the 256-bit token.
--
-- Pairs with the activate-account Edge Function (write side, accept_invitation).
--
-- Depends on: 0007_account_lifecycle.sql (account_invitations),
--             0004_marketers_tree.sql     (marketers),
--             0003_tenancy_identity.sql   (organizations, membership_role).
--
-- Security notes:
--   * No enumeration risk: lookup is by the secret 256-bit token_hash, not by id
--     or email; an attacker without the raw token cannot guess a hash.
--   * Returns ONLY a non-sensitive preview (display_name, email, rank, role, org
--     name) and ONLY while status='pending' AND expires_at > now() — an accepted,
--     revoked or expired invitation resolves to zero rows.
--   * STABLE + SECURITY DEFINER + pinned search_path (no mutation, no injection).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.invitation_context(p_token_hash text)
RETURNS TABLE (
  marketer_id  uuid,
  display_name text,
  email        text,
  rank         marketer_rank,
  role         membership_role,
  org_name     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ai.marketer_id,
    m.display_name,
    m.email,
    m.rank,
    ai.role,
    o.name AS org_name
  FROM public.account_invitations ai
  JOIN public.marketers     m ON m.id = ai.marketer_id AND m.deleted_at IS NULL
  JOIN public.organizations o ON o.id = ai.org_id
  WHERE ai.token_hash = p_token_hash
    AND ai.status     = 'pending'
    AND ai.expires_at > now()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.invitation_context(text) IS
  'Anon-safe /invito landing resolver (doc 07 §4): given a single-use token''s SHA-256 hash, returns the invited profile preview (name/email/rank/role + org) ONLY for a pending, unexpired invitation. SECURITY DEFINER; no enumeration risk (keyed by the secret 256-bit token_hash). Pairs with the activate-account Edge Function.';

-- The landing page is unauthenticated → grant EXECUTE to anon (and authenticated).
GRANT EXECUTE ON FUNCTION public.invitation_context(text) TO anon, authenticated;
