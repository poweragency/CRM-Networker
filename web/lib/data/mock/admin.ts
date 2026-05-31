import type {
  AccountInvitation,
  AccountStatus,
  AdminMarketerRow,
  AuditLogEntry,
  MembershipRole,
  OrgSettings,
  RankHistoryEntry,
} from '@/lib/types/db';
import { RANK_ORDER } from '@/lib/types/db';
import { MOCK_NODES, MOCK_ROOT_ID } from '@/lib/data/mock-genealogy';
import { daysAgo } from '@/lib/data/mock/_shared';

/**
 * Deterministic demo admin datasets so the /admin/* surfaces render fully with
 * no env (RESILIENCE). Marketer rows are projected from the genealogy demo tree
 * (so the registry agrees with /genealogia); invitations, rank history, the audit
 * trail and org settings are hand-authored. Pure — safe to import from the
 * server-only data layer.
 */

/** CRM-eligible = consultant..vice_president (rank index >= 1). */
function crmEligible(rankIndex: number): boolean {
  return rankIndex >= 1;
}

function email(first: string, last: string): string {
  return `${first}.${last}`.toLowerCase().replace(/\s+/g, '') + '@networker-demo.it';
}

// Per-node account projection (role / account status). Hand-tuned so the registry
// reads like a real org: leaders have logins, a couple are invited, the rest have
// no account yet, and the suspended profile shows a suspended account.
const ACCOUNT: Record<string, { status: AccountStatus; role: MembershipRole | null }> = {
  nroot: { status: 'active', role: 'owner' },
  nL: { status: 'active', role: 'admin' },
  nR: { status: 'active', role: 'manager' },
  nLL: { status: 'active', role: 'member' },
  nLR: { status: 'active', role: 'member' },
  nRL: { status: 'active', role: 'member' },
  nLLL: { status: 'active', role: 'member' },
  nLLR: { status: 'invited', role: 'member' },
  nRLL: { status: 'invited', role: 'member' },
  nRR: { status: 'suspended', role: 'member' },
};

export function mockMarketerRows(): AdminMarketerRow[] {
  return MOCK_NODES.map((n) => {
    const acct = ACCOUNT[n.id] ?? { status: 'none' as AccountStatus, role: null };
    const rankIndex = RANK_ORDER.indexOf(n.rank);
    const hasAccount = acct.status !== 'none';
    return {
      id: n.id,
      display_name: n.display_name,
      first_name: n.first_name,
      last_name: n.last_name,
      email: hasAccount ? email(n.first_name, n.last_name) : null,
      rank: n.rank,
      status: n.status,
      account_status: acct.status,
      role: acct.role,
      crm_access: acct.status === 'active' && crmEligible(rankIndex),
      team_size: n.team_size,
      registration_date: daysAgo(120 - rankIndex * 8).slice(0, 10),
      created_at: daysAgo(120 - rankIndex * 8),
    };
  });
}

/** A marketer picker option list (placement parent / sponsor selection). */
export interface MarketerOption {
  id: string;
  display_name: string;
  rank: AdminMarketerRow['rank'];
}

export function mockMarketerOptions(): MarketerOption[] {
  return MOCK_NODES.map((n) => ({
    id: n.id,
    display_name: n.display_name,
    rank: n.rank,
  }));
}

export function mockInvitations(): AccountInvitation[] {
  return [
    {
      id: 'inv-1',
      marketer_id: 'nLLR',
      marketer_name: 'Matteo Gallo',
      email: 'matteo.gallo@networker-demo.it',
      role: 'member',
      status: 'pending',
      invited_by_name: 'Giulia Bianchi',
      expires_at: daysAgo(-5),
      accepted_at: null,
      created_at: daysAgo(2),
    },
    {
      id: 'inv-2',
      marketer_id: 'nRLL',
      marketer_name: 'Simone Marino',
      email: 'simone.marino@networker-demo.it',
      role: 'member',
      status: 'pending',
      invited_by_name: 'Luca Ferrari',
      expires_at: daysAgo(-6),
      accepted_at: null,
      created_at: daysAgo(1),
    },
    {
      id: 'inv-3',
      marketer_id: 'nLLL',
      marketer_name: 'Anna Costa',
      email: 'anna.costa@networker-demo.it',
      role: 'member',
      status: 'accepted',
      invited_by_name: 'Sara Conti',
      expires_at: daysAgo(8),
      accepted_at: daysAgo(12),
      created_at: daysAgo(15),
    },
    {
      id: 'inv-4',
      marketer_id: 'nRLR',
      marketer_name: 'Federica Lombardi',
      email: 'federica.lombardi@networker-demo.it',
      role: 'member',
      status: 'expired',
      invited_by_name: 'Elena Moretti',
      expires_at: daysAgo(3),
      accepted_at: null,
      created_at: daysAgo(11),
    },
    {
      id: 'inv-5',
      marketer_id: 'nLRL',
      marketer_name: 'Chiara Fontana',
      email: 'chiara.fontana@networker-demo.it',
      role: 'member',
      status: 'revoked',
      invited_by_name: 'Davide Greco',
      expires_at: daysAgo(1),
      accepted_at: null,
      created_at: daysAgo(9),
    },
  ];
}

export function mockRankHistory(): RankHistoryEntry[] {
  return [
    {
      id: 'rh-1',
      marketer_id: 'nLL',
      marketer_name: 'Sara Conti',
      previous_rank: 'consultant',
      new_rank: 'team_leader',
      changed_at: daysAgo(6),
      changed_by_name: 'Giulia Bianchi',
      notes: 'Raggiunto il volume di team richiesto.',
    },
    {
      id: 'rh-2',
      marketer_id: 'nLLL',
      marketer_name: 'Anna Costa',
      previous_rank: 'executive',
      new_rank: 'consultant',
      changed_at: daysAgo(20),
      changed_by_name: 'Sara Conti',
      notes: null,
    },
    {
      id: 'rh-3',
      marketer_id: 'nR',
      marketer_name: 'Luca Ferrari',
      previous_rank: 'team_leader',
      new_rank: 'senior_team_leader',
      changed_at: daysAgo(34),
      changed_by_name: 'Marco De Santis',
      notes: 'Promozione trimestrale.',
    },
    {
      id: 'rh-4',
      marketer_id: 'nL',
      marketer_name: 'Giulia Bianchi',
      previous_rank: 'senior_team_leader',
      new_rank: 'executive_team_leader',
      changed_at: daysAgo(48),
      changed_by_name: 'Marco De Santis',
      notes: null,
    },
  ];
}

export function mockAuditLog(): AuditLogEntry[] {
  return [
    { id: 'al-1', actor_name: 'Giulia Bianchi', action: 'invitation.create', entity_type: 'account_invitations', entity_id: 'inv-1', created_at: daysAgo(0, 2) },
    { id: 'al-2', actor_name: 'Marco De Santis', action: 'rank.change', entity_type: 'marketers', entity_id: 'nLL', created_at: daysAgo(0, 6) },
    { id: 'al-3', actor_name: 'Sara Conti', action: 'prospect.stage_change', entity_type: 'prospects', entity_id: 'p-002', created_at: daysAgo(1, 1) },
    { id: 'al-4', actor_name: 'Anna Costa', action: 'account.activate', entity_type: 'memberships', entity_id: 'nLLL', created_at: daysAgo(1, 4) },
    { id: 'al-5', actor_name: 'Marco De Santis', action: 'organization.update', entity_type: 'organizations', entity_id: 'demo-org', created_at: daysAgo(2, 3) },
    { id: 'al-6', actor_name: 'Luca Ferrari', action: 'marketer.place', entity_type: 'marketers', entity_id: 'nRLL', created_at: daysAgo(3, 2) },
    { id: 'al-7', actor_name: 'Giulia Bianchi', action: 'contacts.bulk_update', entity_type: 'contacts', entity_id: null, created_at: daysAgo(3, 7) },
    { id: 'al-8', actor_name: 'Davide Greco', action: 'invitation.revoke', entity_type: 'account_invitations', entity_id: 'inv-5', created_at: daysAgo(4, 1) },
    { id: 'al-9', actor_name: 'Marco De Santis', action: 'membership.role_change', entity_type: 'memberships', entity_id: 'nR', created_at: daysAgo(5, 5) },
    { id: 'al-10', actor_name: 'Elena Moretti', action: 'document.publish', entity_type: 'internal_documents', entity_id: 'doc-3', created_at: daysAgo(6, 2) },
    { id: 'al-11', actor_name: null, action: 'auth.refresh_reuse', entity_type: 'auth', entity_id: null, created_at: daysAgo(7, 8) },
    { id: 'al-12', actor_name: 'Marco De Santis', action: 'marketer.status_change', entity_type: 'marketers', entity_id: 'nRR', created_at: daysAgo(8, 3) },
  ];
}

export function mockOrgSettings(): OrgSettings {
  return {
    id: 'demo-org',
    name: 'Networker · Demo',
    slug: 'networker-demo',
    locale: 'it',
    timezone: 'Europe/Rome',
    bottleneck: {
      inactivity_days: 14,
      followup_overdue_count: 5,
      min_volume_conoscitiva: 10,
    },
  };
}
