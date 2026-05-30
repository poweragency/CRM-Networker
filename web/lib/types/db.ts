/**
 * Hand-written domain types mirroring `01-database-schema.md` and the tree data
 * contract in `14-genealogy-tree-architecture.md §7`. These are the shared types
 * the Auth, Shell and Genealogy slices import. No generated Supabase types yet —
 * when they arrive, these stay as the curated, UI-facing view of the schema.
 *
 * Convention: enum *values* are the canonical (English) DB strings; Italian
 * labels are resolved at render time via next-intl / the *_LABELS maps below.
 */

/* ───────────────────────────── Enums ───────────────────────────── */

/** `marketer_rank` — ordered ascending by seniority (index = rank order). */
export type MarketerRank =
  | 'executive'
  | 'consultant'
  | 'team_leader'
  | 'senior_team_leader'
  | 'executive_team_leader'
  | 'vice_president';

/** Canonical seniority order (low → high). Use for `>=` rank gating. */
export const RANK_ORDER: readonly MarketerRank[] = [
  'executive',
  'consultant',
  'team_leader',
  'senior_team_leader',
  'executive_team_leader',
  'vice_president',
] as const;

/** Italian display labels for ranks (mirrors `ranks_meta.label_it`). */
export const RANK_LABELS: Record<MarketerRank, string> = {
  executive: 'Executive',
  consultant: 'Consultant',
  team_leader: 'Team Leader',
  senior_team_leader: 'Senior Team Leader',
  executive_team_leader: 'Executive Team Leader',
  vice_president: 'Vice President',
};

/** `marketer_status` — lifecycle of a marketer profile. */
export type MarketerStatus = 'pending' | 'active' | 'inactive' | 'suspended';

export const STATUS_LABELS: Record<MarketerStatus, string> = {
  pending: 'In attesa',
  active: 'Attivo',
  inactive: 'Inattivo',
  suspended: 'Sospeso',
};

/** `membership_role` — the application role on a membership (NOT the DB role). */
export type MembershipRole = 'owner' | 'admin' | 'manager' | 'member';

export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: 'Titolare',
  admin: 'Amministratore',
  manager: 'Manager',
  member: 'Membro',
};

/** `placement_leg` — binary leg under a parent. */
export type PlacementLeg = 'LEFT' | 'RIGHT';

/** `branch_side` — view scope for Global / Left / Right surfaces. */
export type BranchScope = 'GLOBAL' | 'LEFT' | 'RIGHT';

/** Lowercase URL form of {@link BranchScope} used in `?scope=` query params. */
export type ScopeParam = 'global' | 'left' | 'right';

/** Node health badge rolled up from activity (doc 14 §7.2). */
export type ActivityIndicator = 'hot' | 'warm' | 'cold' | 'dormant';

/** The five membership permission flags (doc 03 §3.1 / memberships.permissions). */
export interface MembershipPermissions {
  crm_access: boolean;
  export_enabled: boolean;
  manage_documents: boolean;
  view_branch_comparison: boolean;
  can_invite: boolean;
}

/* ──────────────────────────── Entities ─────────────────────────── */

/** A row of `marketers` (placement profile; NOT an account/login). */
export interface Marketer {
  id: string;
  org_id: string;
  parent_id: string | null;
  leg: PlacementLeg | null;
  sponsor_id: string | null;
  path: string;
  first_name: string;
  last_name: string;
  display_name: string;
  external_code: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  rank: MarketerRank;
  status: MarketerStatus;
  registration_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A row of `memberships` (links an `auth.users` login to a marketer profile). */
export interface Membership {
  id: string;
  org_id: string;
  marketer_id: string;
  user_id: string | null;
  role: MembershipRole;
  status: 'active' | 'invited' | 'suspended' | 'disabled';
  permissions: MembershipPermissions;
  created_at: string;
  updated_at: string;
}

/* ─────────────── Genealogy tree data contract (doc 14 §7) ─────────────── */

/** Per-node KPI block (subtree-inclusive, scope-parameterized). */
export interface TreeNodeKpis {
  /** prospects in pipeline (doc contract: prospects / newProspectsLast30d). */
  prospects: number;
  calls: number;
  /** enrollments (Italian domain term "iscrizioni"). */
  iscrizioni: number;
  /** 0..1 conversion ratio. */
  conversion_rate: number;
}

/**
 * The per-node payload served by every tree endpoint. Field shape follows the
 * task's contract: a compact node used by lists, mini-cards and the binary
 * layout. (The richer wire `GenealogyNode` in doc 14 §7.1 is a superset; this is
 * the curated UI view the FE renders.)
 */
export interface TreeNode {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;

  /** Placement edges (binary). */
  parent_id: string | null;
  leg: PlacementLeg | null;
  sponsor_id: string | null;

  rank: MarketerRank;
  status: MarketerStatus;

  /** Closure-derived team aggregates (doc 14 §6). */
  team_size: number;
  left_count: number;
  right_count: number;

  /** Slot availability for placement/expand UI. */
  has_left_child: boolean;
  has_right_child: boolean;

  /** Rolled-up health badge (doc 14 §7.2). */
  activity: ActivityIndicator;

  kpis: TreeNodeKpis;

  /** Lazy-loading hint: false → children must be fetched on expand. */
  children_loaded: boolean;
}

/** Flat tree response envelope (pre-order node list + adjacency via parent_id). */
export interface TreeResponse {
  rootId: string;
  scope: BranchScope;
  nodes: TreeNode[];
}

/** JWT-derived session claims used for gating across the app (doc 09 §6). */
export interface SessionClaims {
  org_id: string;
  marketer_id: string;
  role: MembershipRole;
  rank: MarketerRank;
  crm_access: boolean;
}
