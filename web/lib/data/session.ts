import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
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
};

function asRole(value: unknown): MembershipRole {
  return value === 'owner' ||
    value === 'admin' ||
    value === 'manager' ||
    value === 'member'
    ? value
    : 'member';
}

function asRank(value: unknown): MarketerRank {
  const ranks: MarketerRank[] = [
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

export async function getCurrentClaims(): Promise<SessionResult> {
  if (!isSupabaseConfigured) {
    return { claims: DEMO_CLAIMS, demo: true, email: null };
  }

  try {
    const supabase = createClient();
    if (!supabase) return { claims: DEMO_CLAIMS, demo: true, email: null };

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return { claims: DEMO_CLAIMS, demo: true, email: null };

    // Decode the JWT claim set. `getSession()` returns the access token; the
    // custom claims live in its payload (no extra network round-trip).
    const payload = decodeJwt(session.access_token);
    const appMeta =
      (payload?.app_metadata as Record<string, unknown> | undefined) ?? {};

    const claims: SessionClaims = {
      org_id: String(payload?.org_id ?? appMeta.org_id ?? ''),
      marketer_id: String(payload?.marketer_id ?? appMeta.marketer_id ?? ''),
      role: asRole(payload?.role ?? appMeta.app_role),
      rank: asRank(payload?.rank ?? appMeta.rank),
      crm_access: Boolean(
        (appMeta.permissions as Record<string, unknown> | undefined)
          ?.crm_access ??
          payload?.crm_access ??
          false,
      ),
    };

    // If the hook hasn't stamped org/marketer yet, degrade to demo so the UI
    // never renders an empty/broken shell.
    if (!claims.org_id || !claims.marketer_id) {
      return {
        claims: DEMO_CLAIMS,
        demo: true,
        email: session.user.email ?? null,
      };
    }

    return { claims, demo: false, email: session.user.email ?? null };
  } catch {
    return { claims: DEMO_CLAIMS, demo: true, email: null };
  }
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
