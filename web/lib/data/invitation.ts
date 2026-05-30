import 'server-only';

import type { MarketerRank, MembershipRole } from '@/lib/types/db';
import { mockNode } from '@/lib/data/mock-genealogy';
import { createClient } from '@/lib/supabase/server';

/**
 * Invited-profile context resolved from an invitation token (doc 09 — invitation
 * / activation flow). This is the read side: it tells the activation landing
 * page *who* is being activated so the user can confirm before setting a
 * password. The write side (accepting + setting the password) happens client-
 * side via the activation RPC.
 *
 * Resilience: when Supabase env is missing OR the lookup fails, we return a
 * deterministic demo profile derived from the mock genealogy so /invito/[token]
 * renders fully without a backend (RESILIENCE requirement).
 */
export interface InvitationContext {
  /** Marketer profile the invitation targets (existing profile — doc: profile != account). */
  marketerId: string;
  displayName: string;
  email: string | null;
  rank: MarketerRank;
  role: MembershipRole;
  orgName: string;
}

export interface InvitationResult {
  /** Resolved context, or null when the token is unknown/expired/used. */
  context: InvitationContext | null;
  /** True when served from mock data (env missing or query fell back). */
  demo: boolean;
}

/** Build a deterministic demo invitation from the mock tree (a pending node). */
function mockInvitation(token: string): InvitationContext {
  // Prefer a genuinely "pending" demo node so the context reads realistically;
  // fall back to a stable node so the page always has data.
  const node = mockNode('nLLLR') ?? mockNode('nroot')!;
  return {
    marketerId: node.id,
    displayName: node.display_name,
    email: `${node.first_name}.${node.last_name}`
      .toLowerCase()
      .replace(/\s+/g, '')
      .concat('@demo.crmnetworker.it'),
    rank: node.rank,
    role: 'member',
    orgName: 'Demo Organization',
  };
}

/**
 * Resolve the invitation context for a token. Server-only; safe to call from an
 * RSC. Never throws — returns `{ context: null }` for an invalid/expired token
 * and falls back to a demo context when env is missing or the query errors.
 */
export async function getInvitation(token: string): Promise<InvitationResult> {
  const supabase = createClient();

  if (!supabase) {
    return { context: mockInvitation(token), demo: true };
  }

  try {
    // doc 09: an invitation row carries the target marketer + org + role.
    // RLS allows an anonymous read scoped to a valid, unexpired token.
    const { data, error } = await supabase
      .from('invitations')
      .select(
        'marketer_id, role, expires_at, accepted_at, marketers(display_name, email, rank), organizations(name)',
      )
      .eq('token', token)
      .maybeSingle();

    if (error || !data) {
      return { context: null, demo: false };
    }

    // Reject expired or already-accepted invitations.
    const expired =
      typeof data.expires_at === 'string' &&
      new Date(data.expires_at).getTime() < Date.now();
    if (expired || data.accepted_at) {
      return { context: null, demo: false };
    }

    // Supabase embeds to-one relations as objects (or arrays depending on FK
    // shape); normalize defensively without assuming generated types.
    const marketer = Array.isArray(data.marketers)
      ? data.marketers[0]
      : data.marketers;
    const org = Array.isArray(data.organizations)
      ? data.organizations[0]
      : data.organizations;

    if (!marketer) {
      return { context: null, demo: false };
    }

    return {
      context: {
        marketerId: data.marketer_id as string,
        displayName: (marketer.display_name as string) ?? '—',
        email: (marketer.email as string | null) ?? null,
        rank: (marketer.rank as MarketerRank) ?? 'executive',
        role: (data.role as MembershipRole) ?? 'member',
        orgName: (org?.name as string) ?? '—',
      },
      demo: false,
    };
  } catch {
    // Schema not present / network error → degrade to demo rather than crash.
    return { context: mockInvitation(token), demo: true };
  }
}
