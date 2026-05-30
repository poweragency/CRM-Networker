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

/* ════════════════════════════════════════════════════════════════════════
 * CRM DOMAIN (doc 01 §4 contacts/centos/whys/documents, §5 prospects/calls)
 * Enum *values* mirror the canonical DB strings; Italian labels resolve via
 * the *_LABELS maps below (same convention as the genealogy enums above).
 * ════════════════════════════════════════════════════════════════════════ */

/* ───────────────────────── Contacts (doc 01 §4.1) ───────────────────────── */

/** `contact_status` — CRM lifecycle of a contact. */
export type ContactStatus =
  | 'nuovo'
  | 'in_lavorazione'
  | 'qualificato'
  | 'non_qualificato'
  | 'cliente'
  | 'perso';

export const CONTACT_STATUS_ORDER: readonly ContactStatus[] = [
  'nuovo',
  'in_lavorazione',
  'qualificato',
  'non_qualificato',
  'cliente',
  'perso',
] as const;

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  nuovo: 'Nuovo',
  in_lavorazione: 'In lavorazione',
  qualificato: 'Qualificato',
  non_qualificato: 'Non qualificato',
  cliente: 'Cliente',
  perso: 'Perso',
};

/** Semantic UI tone per status (maps to Badge/StatusPill variants). */
export const CONTACT_STATUS_TONE: Record<
  ContactStatus,
  'default' | 'info' | 'success' | 'warning' | 'danger' | 'secondary'
> = {
  nuovo: 'info',
  in_lavorazione: 'warning',
  qualificato: 'default',
  non_qualificato: 'secondary',
  cliente: 'success',
  perso: 'danger',
};

/** `contact_source` — how the contact entered the book. */
export type ContactSource =
  | 'centos_list'
  | 'referral'
  | 'social'
  | 'evento'
  | 'cold'
  | 'altro';

export const CONTACT_SOURCE_ORDER: readonly ContactSource[] = [
  'centos_list',
  'referral',
  'social',
  'evento',
  'cold',
  'altro',
] as const;

export const CONTACT_SOURCE_LABELS: Record<ContactSource, string> = {
  centos_list: 'Lista Centos',
  referral: 'Referral',
  social: 'Social',
  evento: 'Evento',
  cold: 'Contatto a freddo',
  altro: 'Altro',
};

/** A row of `contacts`. */
export interface Contact {
  id: string;
  org_id: string;
  owner_marketer_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: ContactStatus;
  source: ContactSource;
  tags: string[];
  next_follow_up_at: string | null;
  last_interaction_at: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/* ───────────────────── Prospect journey (doc 01 §5.1/§5.2) ───────────────────── */

/** THE 6 CANONICAL, ORDERED prospect journey stages (doc 11 / 01 §5, LOCKED). */
export type ProspectStage =
  | 'conoscitiva'
  | 'business_info'
  | 'follow_up'
  | 'closing'
  | 'check_soldi'
  | 'iscrizione';

/** Canonical funnel order (1 → 6). Use for ordering columns / progress. */
export const STAGE_ORDER: readonly ProspectStage[] = [
  'conoscitiva',
  'business_info',
  'follow_up',
  'closing',
  'check_soldi',
  'iscrizione',
] as const;

/** Italian display labels for the 6 stages. */
export const STAGE_LABELS: Record<ProspectStage, string> = {
  conoscitiva: 'Conoscitiva',
  business_info: 'Business Info',
  follow_up: 'Follow-up',
  closing: 'Closing',
  check_soldi: 'Check Soldi',
  iscrizione: 'Iscrizione',
};

/** Short helper sentence per stage (used in tooltips / board headers). */
export const STAGE_DESCRIPTIONS: Record<ProspectStage, string> = {
  conoscitiva: 'Primo contatto e scoperta',
  business_info: 'Presentazione del business',
  follow_up: 'Follow-up e gestione obiezioni',
  closing: 'Chiusura della trattativa',
  check_soldi: 'Verifica disponibilità economica',
  iscrizione: 'Iscrizione completata',
};

/** Index (1..6) of a stage in the canonical funnel. */
export function stageIndex(stage: ProspectStage): number {
  return STAGE_ORDER.indexOf(stage) + 1;
}

/** `prospect_outcome` — funnel result. */
export type ProspectOutcome = 'open' | 'enrolled' | 'lost' | 'on_hold';

export const PROSPECT_OUTCOME_LABELS: Record<ProspectOutcome, string> = {
  open: 'In corso',
  enrolled: 'Iscritto',
  lost: 'Perso',
  on_hold: 'In pausa',
};

export const PROSPECT_OUTCOME_TONE: Record<
  ProspectOutcome,
  'default' | 'success' | 'danger' | 'warning'
> = {
  open: 'default',
  enrolled: 'success',
  lost: 'danger',
  on_hold: 'warning',
};

/** A row of `prospects` (current stage denormalized; history in events). */
export interface Prospect {
  id: string;
  org_id: string;
  owner_marketer_id: string;
  contact_id: string | null;
  full_name: string;
  current_stage: ProspectStage;
  outcome: ProspectOutcome;
  current_stage_since: string;
  entered_funnel_at: string;
  closed_at: string | null;
  expected_value: number | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A row of `prospect_journey_events` (stage transition history). */
export interface ProspectJourneyEvent {
  id: string;
  org_id: string;
  prospect_id: string;
  responsible_marketer_id: string;
  from_stage: ProspectStage | null;
  to_stage: ProspectStage;
  entered_at: string;
  exited_at: string | null;
  /** Generated server-side; null while this is the current (open) stage. */
  time_in_stage_secs: number | null;
  notes: string | null;
  created_at: string;
}

/** A prospect joined with its ordered journey history (detail view). */
export interface ProspectWithJourney extends Prospect {
  journey: ProspectJourneyEvent[];
}

/* ───────────────────────────── Calls (doc 01 §5.3) ───────────────────────────── */

/** `call_type`. */
export type CallType = 'inbound' | 'outbound' | 'video' | 'whatsapp';

export const CALL_TYPE_ORDER: readonly CallType[] = [
  'outbound',
  'inbound',
  'video',
  'whatsapp',
] as const;

export const CALL_TYPE_LABELS: Record<CallType, string> = {
  inbound: 'In entrata',
  outbound: 'In uscita',
  video: 'Videochiamata',
  whatsapp: 'WhatsApp',
};

/** `call_outcome`. */
export type CallOutcome =
  | 'connesso'
  | 'no_risposta'
  | 'richiamare'
  | 'appuntamento'
  | 'non_interessato'
  | 'iscritto';

export const CALL_OUTCOME_ORDER: readonly CallOutcome[] = [
  'connesso',
  'no_risposta',
  'richiamare',
  'appuntamento',
  'non_interessato',
  'iscritto',
] as const;

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  connesso: 'Connesso',
  no_risposta: 'Nessuna risposta',
  richiamare: 'Da richiamare',
  appuntamento: 'Appuntamento',
  non_interessato: 'Non interessato',
  iscritto: 'Iscritto',
};

export const CALL_OUTCOME_TONE: Record<
  CallOutcome,
  'default' | 'info' | 'success' | 'warning' | 'danger' | 'secondary'
> = {
  connesso: 'info',
  no_risposta: 'secondary',
  richiamare: 'warning',
  appuntamento: 'default',
  non_interessato: 'danger',
  iscritto: 'success',
};

/** A row of `calls`. */
export interface Call {
  id: string;
  org_id: string;
  marketer_id: string;
  prospect_id: string | null;
  contact_id: string | null;
  call_type: CallType;
  outcome: CallOutcome;
  duration_secs: number;
  occurred_at: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A call enriched with the resolved target name (list display convenience). */
export interface CallWithTarget extends Call {
  target_name: string | null;
}

/** Aggregate call stats for the header strip (doc 01 §6 daily metrics shape). */
export interface CallStats {
  total: number;
  connected: number;
  /** total talk time in seconds across the window. */
  duration_secs: number;
  appointments: number;
  enrollments: number;
  /** 0..1 connected / total. */
  connect_rate: number;
}

/* ─────────────────────── Centos List (doc 01 §4.2) ─────────────────────── */

/**
 * Derived UI status for a Centos entry (the table stores `contacted` +
 * `promoted_contact_id`; we project a single status for filtering/badges).
 */
export type CentosStatus = 'da_contattare' | 'contattato' | 'promosso';

export const CENTOS_STATUS_LABELS: Record<CentosStatus, string> = {
  da_contattare: 'Da contattare',
  contattato: 'Contattato',
  promosso: 'Promosso a contatto',
};

export const CENTOS_STATUS_TONE: Record<
  CentosStatus,
  'default' | 'secondary' | 'success'
> = {
  da_contattare: 'secondary',
  contattato: 'default',
  promosso: 'success',
};

/** A row of `centos_list_entries`. */
export interface CentosEntry {
  id: string;
  org_id: string;
  owner_marketer_id: string;
  position: number;
  full_name: string;
  phone: string | null;
  relationship: string | null;
  /** 1..5 prospect-quality score. */
  rating: number | null;
  contacted: boolean;
  promoted_contact_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Project the stored flags into the single {@link CentosStatus}. */
export function centosStatus(entry: CentosEntry): CentosStatus {
  if (entry.promoted_contact_id) return 'promosso';
  if (entry.contacted) return 'contattato';
  return 'da_contattare';
}

/* ─────────────────────── Sette Perché (doc 01 §4.3) ─────────────────────── */

/** A row of `seven_whys` (one per marketer). */
export interface SevenWhys {
  id: string;
  org_id: string;
  marketer_id: string;
  /** The motivating subject/headline (denormalized convenience, optional). */
  subject: string | null;
  why_1: string | null;
  why_2: string | null;
  why_3: string | null;
  why_4: string | null;
  why_5: string | null;
  why_6: string | null;
  why_7: string | null;
  /** Which of 1..7 is the core driver. */
  primary_why_index: number | null;
  created_at: string;
  updated_at: string;
}

/** Italian ordinal labels for the seven "why" slots. */
export const WHY_LABELS: readonly string[] = [
  'Primo perché',
  'Secondo perché',
  'Terzo perché',
  'Quarto perché',
  'Quinto perché',
  'Sesto perché',
  'Settimo perché',
] as const;

/** The seven `why_*` keys in order (helps iterate the form generically). */
export const WHY_KEYS = [
  'why_1',
  'why_2',
  'why_3',
  'why_4',
  'why_5',
  'why_6',
  'why_7',
] as const;

export type WhyKey = (typeof WHY_KEYS)[number];

/* ───────────────── Internal documents (doc 01 §4.4 / ADR-009 #5) ───────────────── */

/** `document_category`. */
export type DocumentCategory =
  | 'formazione'
  | 'script'
  | 'procedura'
  | 'marketing'
  | 'onboarding'
  | 'altro';

export const DOCUMENT_CATEGORY_ORDER: readonly DocumentCategory[] = [
  'formazione',
  'script',
  'procedura',
  'marketing',
  'onboarding',
  'altro',
] as const;

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  formazione: 'Formazione',
  script: 'Script',
  procedura: 'Procedura',
  marketing: 'Marketing',
  onboarding: 'Onboarding',
  altro: 'Altro',
};

/** `document_status`. */
export type DocumentStatus = 'draft' | 'published' | 'archived';

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Bozza',
  published: 'Pubblicato',
  archived: 'Archiviato',
};

export const DOCUMENT_STATUS_TONE: Record<
  DocumentStatus,
  'secondary' | 'success' | 'warning'
> = {
  draft: 'secondary',
  published: 'success',
  archived: 'warning',
};

/**
 * Tiptap/ProseMirror document JSON (ADR-009 #5). Kept structurally loose — the
 * editor owns the precise shape; the data layer only needs a JSON-serializable
 * node tree with a `type` root ("doc") and optional `content` array.
 */
export interface TiptapDoc {
  type: 'doc';
  content?: TiptapNode[];
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

/** A row of `internal_documents` (rich-text body, NO file uploads). */
export interface InternalDocument {
  id: string;
  org_id: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  /** Tiptap/ProseMirror JSON. */
  body: TiptapDoc;
  current_version: number;
  duplicated_from_id: string | null;
  tags: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

/** A row of `document_versions` (immutable snapshot). */
export interface DocumentVersion {
  id: string;
  org_id: string;
  document_id: string;
  version_no: number;
  title: string;
  body: TiptapDoc;
  change_note: string | null;
  created_by: string | null;
  created_at: string;
}
