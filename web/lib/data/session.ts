import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured, isDemoAllowed } from '@/lib/env';
import { logError } from '@/lib/log';
import type {
  MarketerRank,
  MembershipRole,
  SessionClaims,
} from '@/lib/types/db';
import { MOCK_ROOT_ID } from '@/lib/data/mock-genealogy';

/**
 * Reads the caller's JWT custom claims (doc 09 §6) server-side and projects them
 * into {@link SessionClaims}. When env is missing OR no session exists, returns a
 * deterministic DEMO claim set (admin/owner-ish, CRM enabled) so gated UI is
 * still navigable in "modalità demo". The returned `demo` flag lets the shell
 * surface the config-notice pattern.
 *
 * Claim placement note: the access-token hook stamps `org_id`/`marketer_id` at
 * the top level and the app role at `app_metadata.app_role` (doc 09 §6); we read
 * both shapes defensively.
 */

export interface SessionResult {
  claims: SessionClaims;
  demo: boolean;
  email: string | null;
}

const DEMO_CLAIMS: SessionClaims = {
  org_id: 'demo-org',
  marketer_id: MOCK_ROOT_ID,
  role: 'owner',
  rank: 'vice_president',
  crm_access: true,
  is_platform_admin: false,
};

/**
 * Non-privileged fallback used when we must NOT impersonate an owner: production
 * with missing env, or a configured session that fails/has unstamped claims. It
 * carries no org/marketer and the lowest privileges, and is always paired with
 * `demo: true` so the (app) layout bounces it to /accedi (fail closed).
 */
const UNAUTH_CLAIMS: SessionClaims = {
  org_id: '',
  marketer_id: '',
  role: 'member',
  rank: 'executive',
  crm_access: false,
  is_platform_admin: false,
};

/** The fallback identity to hand out when there is no real session. */
function fallbackResult(email: string | null = null): SessionResult {
  // Only the explicit demo mode gets the rich owner persona; everywhere else we
  // fail closed with a non-privileged identity (still demo:true → layout redirect).
  return {
    claims: isDemoAllowed && !isSupabaseConfigured ? DEMO_CLAIMS : UNAUTH_CLAIMS,
    demo: true,
    email,
  };
}

function asRole(value: unknown): MembershipRole {
  return value === 'owner' ||
    value === 'admin' ||
    value === 'co_admin' ||
    value === 'manager' ||
    value === 'member'
    ? value
    : 'member';
}

function asRank(value: unknown): MarketerRank {
  const ranks: MarketerRank[] = [
    'cliente',
    'no_rank',
    'executive',
    'consultant',
    'team_leader',
    'senior_team_leader',
    'executive_team_leader',
    'vice_president',
  ];
  return ranks.includes(value as MarketerRank)
    ? (value as MarketerRank)
    : 'executive';
}

export const getCurrentClaims = cache(async function getCurrentClaims(): Promise<SessionResult> {
  if (!isSupabaseConfigured) {
    return fallbackResult();
  }

  try {
    const supabase = createClient();
    if (!supabase) return fallbackResult();

    // SECURITY (audit FINDING #2): validate the session against the Supabase Auth
    // server BEFORE trusting any claim. `getSession()` alone only reads the local
    // cookie and never verifies the JWT signature/revocation, so app-level authz
    // (currentIsOrgAdmin / canManageAccounts / getOwnerContext) must not rely on it
    // directly. `getUser()` re-validates the token server-side; once it confirms the
    // token is authentic, decoding that SAME token locally for the custom claims is
    // safe (no second round-trip). Deduped per request by the React cache() wrapper.
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) return fallbackResult();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return fallbackResult(user.email ?? null);

    // Decode the (now server-validated) JWT claim set. The custom claims live in the
    // access-token payload stamped by the access-token hook (no extra round-trip).
    const payload = decodeJwt(session.access_token);
    const appMeta =
      (payload?.app_metadata as Record<string, unknown> | undefined) ?? {};

    const claims: SessionClaims = {
      org_id: String(payload?.org_id ?? appMeta.org_id ?? ''),
      marketer_id: String(payload?.marketer_id ?? appMeta.marketer_id ?? ''),
      // App role is the dedicated `app_role` claim — NOT the top-level `role`
      // claim, which must stay 'authenticated' for PostgREST (see migration 0030).
      role: asRole(payload?.app_role ?? appMeta.app_role),
      rank: asRank(payload?.rank ?? appMeta.rank),
      crm_access: Boolean(
        (appMeta.permissions as Record<string, unknown> | undefined)
          ?.crm_access ??
          payload?.crm_access ??
          false,
      ),
      is_platform_admin: Boolean(
        payload?.is_platform_admin ?? appMeta.is_platform_admin ?? false,
      ),
    };

    // Platform super-admin legitimately has NO org/marketer (external to all orgs):
    // do NOT fail closed for them. For everyone else, an unstamped org/marketer
    // means the hook hasn't run yet → fail closed (the layout redirects to /accedi).
    if (!claims.is_platform_admin && (!claims.org_id || !claims.marketer_id)) {
      return fallbackResult(session.user.email ?? null);
    }

    return { claims, demo: false, email: session.user.email ?? null };
  } catch (e) {
    // Let Next.js control-flow signals (dynamic-usage probe, redirect, notFound)
    // propagate — swallowing them would break dynamic-route detection.
    if (isNextControlFlowError(e)) throw e;
    // A configured session that throws is a real fault (not demo) — surface it in
    // the logs instead of silently failing closed.
    logError('getCurrentClaims', e);
    return fallbackResult();
  }
});

/** True for Next.js internal control-flow errors that must NOT be swallowed. */
function isNextControlFlowError(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest !== 'string') return false;
  return (
    digest === 'DYNAMIC_SERVER_USAGE' ||
    digest === 'NEXT_NOT_FOUND' ||
    digest.startsWith('NEXT_REDIRECT') ||
    digest.startsWith('NEXT_HTTP_ERROR_FALLBACK')
  );
}

/** Minimal, dependency-free JWT payload decoder (base64url → JSON). */
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
