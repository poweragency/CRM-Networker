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

/**
 * `marketer_rank` — ordered ascending by seniority (index = rank order).
 * `cliente` and `no_rank` sit BELOW `executive` (a customer / a not-yet-ranked
 * marketer); they are NOT a starting package (those are {@link StartingPackage}).
 */
export type MarketerRank =
  | 'cliente'
  | 'no_rank'
  | 'executive'
  | 'consultant'
  | 'team_leader'
  | 'senior_team_leader'
  | 'executive_team_leader'
  | 'vice_president';

/** Canonical seniority order (low → high). Use for `>=` rank gating. */
export const RANK_ORDER: readonly MarketerRank[] = [
  'cliente',
  'no_rank',
  'executive',
  'consultant',
  'team_leader',
  'senior_team_leader',
  'executive_team_leader',
  'vice_president',
] as const;

/** Italian display labels for ranks (mirrors `ranks_meta.label_it`). */
export const RANK_LABELS: Record<MarketerRank, string> = {
  cliente: 'Cliente',
  no_rank: 'No Rank',
  executive: 'Executive',
  consultant: 'Consultant',
  team_leader: 'Team Leader',
  senior_team_leader: 'Senior Team Leader',
  executive_team_leader: 'Executive Team Leader',
  vice_president: 'Vice President',
};

/* ─────────────────── Marketer profile extras (anagrafica) ─────────────────── */

/**
 * `starting_package` — the membership pack chosen at enrolment, highest → lowest.
 * NOTE: a package is NOT a rank (see {@link MarketerRank}); the two are
 * independent dimensions of a profile.
 */
export type StartingPackage = 'signature' | 'premium' | 'standard' | 'starter';

/** Starting packages, highest → lowest (display order). */
export const STARTING_PACKAGE_ORDER: readonly StartingPackage[] = [
  'signature',
  'premium',
  'standard',
  'starter',
] as const;

export const STARTING_PACKAGE_LABELS: Record<StartingPackage, string> = {
  signature: 'Signature',
  premium: 'Premium',
  standard: 'Standard',
  starter: 'Starter',
};

/** What the member currently does (studia/lavora) — free anagrafica field. */
export type Occupation = 'studia' | 'lavora' | 'entrambi' | 'nessuno';

export const OCCUPATION_ORDER: readonly Occupation[] = [
  'studia',
  'lavora',
  'entrambi',
  'nessuno',
] as const;

export const OCCUPATION_LABELS: Record<Occupation, string> = {
  studia: 'Studia',
  lavora: 'Lavora',
  entrambi: 'Studia e lavora',
  nessuno: 'Né studia né lavora',
};

/**
 * The editable, per-marketer anagrafica extras shown on /team/[id]. Frontend +
 * mock only for now (no DB columns yet) — see `lib/data/team.ts`. The base
 * identity (nome/cognome/sponsor/rank/data iscrizione) comes from the genealogy
 * node + registry; these are the additional fields the profile collects.
 */
export interface MarketerExtra {
  starting_package: StartingPackage | null;
  /** Free text for now (the addon catalogue is defined later). */
  addon: string | null;
  /** "click" — accesso alla piattaforma aziendale (sì/no). */
  platform_click: boolean;
  /** Città di provenienza. */
  city: string | null;
  region: string | null;
  /** ISO `YYYY-MM-DD`. */
  birth_date: string | null;
  occupation: Occupation | null;
  /** Note a parte (campo libero). */
  notes: string | null;
}

/** Full team-member profile = identity + sponsor/registration + {@link MarketerExtra}. */
export interface TeamMemberProfile extends MarketerExtra {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  rank: MarketerRank;
  status: MarketerStatus;
  sponsor_id: string | null;
  sponsor_name: string | null;
  registration_date: string | null;
}

/** One row of the Statistiche roster (compact, clickable → /team/[id]). */
export interface TeamMemberRow {
  id: string;
  display_name: string;
  rank: MarketerRank;
  status: MarketerStatus;
  starting_package: StartingPackage | null;
  city: string | null;
  region: string | null;
  registration_date: string | null;
  team_size: number;
}

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

/* ════════════════════════════════════════════════════════════════════════
 * ANALYTICS DOMAIN (doc 11 / doc 15). Mirrors the analytics fact layer
 * (`0016`), the secured scope functions (`subtree_metrics`, `branch_metrics`,
 * `funnel_totals_subtree`, `stage_conversion_subtree`), the leaderboard /
 * bottleneck tables (`0018`), the reporting tables (`0019`) and the
 * `notifications` inbox (`0014`). Enum *values* are the canonical DB strings.
 * ════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────── Activity / subtree metrics ─────────────────────── */

/**
 * The scope-aggregated activity totals returned by `subtree_metrics()` /
 * `branch_metrics()` over a period (doc 11 §4.2). One stage column per funnel
 * stage = entries INTO that stage (additive throughput), plus call activity and
 * recruiting. All counts are non-negative integers.
 */
export interface SubtreeMetrics {
  calls_total: number;
  calls_connected: number;
  calls_duration_secs: number;
  new_prospects: number;
  conoscitiva: number;
  business_info: number;
  follow_up: number;
  closing: number;
  check_soldi: number;
  iscrizione: number;
  new_recruits: number;
}

/** Per-stage entry counts of a {@link SubtreeMetrics}, in canonical funnel order. */
export function stageThroughput(m: SubtreeMetrics): Record<ProspectStage, number> {
  return {
    conoscitiva: m.conoscitiva,
    business_info: m.business_info,
    follow_up: m.follow_up,
    closing: m.closing,
    check_soldi: m.check_soldi,
    iscrizione: m.iscrizione,
  };
}

/** Derived 0..1 connect rate (connected / total calls). */
export function connectRate(m: SubtreeMetrics): number {
  return m.calls_total > 0 ? m.calls_connected / m.calls_total : 0;
}

/**
 * Derived 0..1 overall funnel conversion = iscrizione / conoscitiva (doc 11
 * §9.2 `conv_overall`). Guards a zero denominator.
 */
export function overallConversion(m: SubtreeMetrics): number {
  return m.conoscitiva > 0 ? m.iscrizione / m.conoscitiva : 0;
}

/** A node's branch breakdown: one {@link SubtreeMetrics} per branch side. */
export type BranchMetrics = Record<BranchScope, SubtreeMetrics>;

/** A single day of activity for the trend chart (own/subtree aggregate). */
export interface MetricDayPoint {
  /** Org-local calendar day (ISO `YYYY-MM-DD`). */
  date: string;
  calls: number;
  new_prospects: number;
  iscrizioni: number;
}

/* ───────────────────────── Funnel & conversion ───────────────────────── */

/** Current funnel occupancy: how many OPEN prospects sit in each stage now. */
export interface FunnelStageOccupancy {
  stage: ProspectStage;
  /** Open prospects currently parked in this stage. */
  open: number;
  /** Cumulative prospects that ever reached this stage (entries, throughput). */
  reached: number;
}

/** Per-stage conversion totals (from `stage_conversion_subtree`, doc 11 §5.4). */
export interface StageConversion {
  stage: ProspectStage;
  entered: number;
  exited: number;
  avg_time_in_stage_secs: number;
}

/* ───────────────────────── Leaderboards (doc 11 §11) ───────────────────────── */

/** `leaderboard_metric` — the ranked dimension. */
export type LeaderboardMetric =
  | 'calls'
  | 'new_prospects'
  | 'conversion_rate'
  | 'enrollments'
  | 'team_growth';

export const LEADERBOARD_METRIC_ORDER: readonly LeaderboardMetric[] = [
  'enrollments',
  'new_prospects',
  'calls',
  'conversion_rate',
  'team_growth',
] as const;

export const LEADERBOARD_METRIC_LABELS: Record<LeaderboardMetric, string> = {
  calls: 'Chiamate',
  new_prospects: 'Nuovi prospect',
  conversion_rate: 'Tasso di conversione',
  enrollments: 'Iscrizioni',
  team_growth: 'Crescita team',
};

/** True when the metric value is a 0..1 ratio (→ render as a percentage). */
export function isRatioMetric(metric: LeaderboardMetric): boolean {
  return metric === 'conversion_rate';
}

/** `leaderboard_scope` — the population ranked. */
export type LeaderboardScope = 'org' | 'team' | 'branch';

export const LEADERBOARD_SCOPE_LABELS: Record<LeaderboardScope, string> = {
  org: 'Organizzazione',
  team: 'Il mio team',
  branch: 'Per ramo',
};

/** One ranked marketer in a leaderboard snapshot (doc 01 §6.5). */
export interface LeaderboardEntry {
  marketer_id: string;
  display_name: string;
  rank: MarketerRank;
  rank_position: number;
  value: number;
  /** Marks the viewer's own row so the UI can highlight it. */
  is_self: boolean;
}

/* ─────────────────────── Bottlenecks (doc 11 §10) ─────────────────────── */

/** `bottleneck_type` — the detected weakness category. */
export type BottleneckType =
  | 'weak_conversion'
  | 'stage_delay'
  | 'inactivity'
  | 'followup_overdue';

export const BOTTLENECK_TYPE_LABELS: Record<BottleneckType, string> = {
  weak_conversion: 'Conversione debole',
  stage_delay: 'Fase in stallo',
  inactivity: 'Inattività',
  followup_overdue: 'Follow-up in ritardo',
};

/** `bottleneck_severity`. */
export type BottleneckSeverity = 'info' | 'warning' | 'critical';

export const BOTTLENECK_SEVERITY_LABELS: Record<BottleneckSeverity, string> = {
  info: 'Informativo',
  warning: 'Attenzione',
  critical: 'Critico',
};

export const BOTTLENECK_SEVERITY_TONE: Record<
  BottleneckSeverity,
  'info' | 'warning' | 'danger'
> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

/** A row of `bottleneck_findings` (enriched with the affected marketer name). */
export interface BottleneckFinding {
  id: string;
  marketer_id: string;
  marketer_name: string | null;
  type: BottleneckType;
  severity: BottleneckSeverity;
  stage: ProspectStage | null;
  metric_value: number | null;
  threshold_value: number | null;
  title_it: string;
  recommendation_it: string;
  detected_at: string;
  period_start: string;
  period_end: string;
  resolved_at: string | null;
}

/* ─────────────────────── Notifications (doc 01 §6.7) ─────────────────────── */

/** `notification_type`. */
export type NotificationType =
  | 'follow_up_due'
  | 'rank_changed'
  | 'bottleneck_alert'
  | 'monthly_report_ready'
  | 'invitation'
  | 'system';

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  follow_up_due: 'Follow-up in scadenza',
  rank_changed: 'Cambio di grado',
  bottleneck_alert: 'Avviso collo di bottiglia',
  monthly_report_ready: 'Report disponibile',
  invitation: 'Invito',
  system: 'Sistema',
};

/** A row of `notifications` (in-app inbox, Realtime-subscribed). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title_it: string;
  body_it: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

/**
 * Resolve a click-through href from a notification's type + payload deep-link
 * refs (doc 01 §6.7). Falls back to the section index for the type.
 */
export function notificationHref(n: AppNotification): string {
  const p = n.payload ?? {};
  const prospectId = typeof p.prospect_id === 'string' ? p.prospect_id : null;
  const reportId = typeof p.report_id === 'string' ? p.report_id : null;
  switch (n.type) {
    case 'follow_up_due':
      return prospectId ? `/percorso-prospect/${prospectId}` : '/percorso-prospect';
    case 'bottleneck_alert':
      return '/analytics';
    case 'monthly_report_ready':
      return reportId ? `/report?id=${reportId}` : '/report';
    case 'rank_changed':
      return '/genealogia';
    case 'invitation':
      return '/admin/attivazioni';
    case 'system':
    default:
      return '/notifiche';
  }
}

/* ───────────────────── Reporting & export (doc 15) ───────────────────── */

/** `report_period`. */
export type ReportPeriod = 'monthly' | 'quarterly';

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  monthly: 'Mensile',
  quarterly: 'Trimestrale',
};

/** `export_format` — rendered artifact format. */
export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

export const EXPORT_FORMAT_ORDER: readonly ExportFormat[] = [
  'pdf',
  'xlsx',
  'csv',
] as const;

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF',
  xlsx: 'Excel',
  csv: 'CSV',
};

/** `export_status` — async export job lifecycle. */
export type ExportStatus =
  | 'queued'
  | 'rendering'
  | 'ready'
  | 'failed'
  | 'expired';

export const EXPORT_STATUS_LABELS: Record<ExportStatus, string> = {
  queued: 'In coda',
  rendering: 'In elaborazione',
  ready: 'Pronto',
  failed: 'Errore',
  expired: 'Scaduto',
};

export const EXPORT_STATUS_TONE: Record<
  ExportStatus,
  'secondary' | 'info' | 'success' | 'danger' | 'warning'
> = {
  queued: 'secondary',
  rendering: 'info',
  ready: 'success',
  failed: 'danger',
  expired: 'warning',
};

/**
 * The doc 11 §9.2 fixed-key metrics payload stored on `monthly_reports.metrics`
 * (produced by `subtree_metrics_json()`). Numeric throughout; `conv_overall` is
 * a 0..1 ratio.
 */
export interface MetricsPayload {
  calls_total: number;
  calls_connected: number;
  calls_duration_secs: number;
  new_prospects: number;
  conoscitiva: number;
  business_info: number;
  follow_up: number;
  closing: number;
  check_soldi: number;
  iscrizione: number;
  enrollments: number;
  new_recruits: number;
  team_size: number;
  active_members: number;
  conv_overall: number;
}

/** A row of `monthly_reports` (immutable per-subject performance snapshot). */
export interface MonthlyReport {
  id: string;
  marketer_id: string | null;
  /** Resolved subject name; null for the org-level roll-up. */
  subject_name: string | null;
  period: ReportPeriod;
  period_start: string;
  period_end: string;
  metrics: MetricsPayload;
  previous_metrics: MetricsPayload | null;
  /** Absolute MoM/QoQ diff per numeric key (null when no prior snapshot). */
  deltas: Partial<Record<keyof MetricsPayload, number>> | null;
  /** % MoM/QoQ change per numeric key (0..1-ish ratio, null when no prior). */
  delta_pct: Partial<Record<keyof MetricsPayload, number>> | null;
  generated_at: string;
}

/** A row of `report_export_jobs` (async large-export queue, doc 15 §11.2). */
export interface ExportJob {
  id: string;
  report_type: string;
  format: ExportFormat;
  status: ExportStatus;
  row_count: number | null;
  bytes: number | null;
  error_code: string | null;
  created_at: string;
  finished_at: string | null;
  expires_at: string | null;
}

/* ════════════════════════════════════════════════════════════════════════
 * ADMIN DOMAIN (doc 01 §1–3 / §6.8 / doc 10). Mirrors `organizations`,
 * `memberships`, `account_invitations` (`0007`), `rank_history` (`0004`) and
 * `audit_log` (`0015`). Enum *values* are the canonical DB strings.
 * ════════════════════════════════════════════════════════════════════════ */

/* ─────────────── Account / membership account status ─────────────── */

/**
 * Account status of a marketer profile = its `memberships.status`, with an extra
 * `none` for profiles that have no login yet (pre-registered, not invited).
 */
export type AccountStatus =
  | 'active'
  | 'invited'
  | 'suspended'
  | 'disabled'
  | 'none';

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Attivo',
  invited: 'Invitato',
  suspended: 'Sospeso',
  disabled: 'Disabilitato',
  none: 'Nessun accesso',
};

export const ACCOUNT_STATUS_TONE: Record<
  AccountStatus,
  'success' | 'info' | 'warning' | 'danger' | 'secondary'
> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  disabled: 'danger',
  none: 'secondary',
};

/** A marketer registry row for /admin/marketer (profile + account projection). */
export interface AdminMarketerRow {
  id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  rank: MarketerRank;
  status: MarketerStatus;
  account_status: AccountStatus;
  role: MembershipRole | null;
  crm_access: boolean;
  team_size: number;
  registration_date: string | null;
  created_at: string;
}

/* ─────────────────────── Invitations (doc 01 §3) ─────────────────────── */

/** `invitation_status`. */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'In attesa',
  accepted: 'Accettato',
  expired: 'Scaduto',
  revoked: 'Revocato',
};

export const INVITATION_STATUS_TONE: Record<
  InvitationStatus,
  'info' | 'success' | 'secondary' | 'danger'
> = {
  pending: 'info',
  accepted: 'success',
  expired: 'secondary',
  revoked: 'danger',
};

/** A row of `account_invitations` (enriched with profile + issuer names). */
export interface AccountInvitation {
  id: string;
  marketer_id: string;
  marketer_name: string;
  email: string;
  role: MembershipRole;
  status: InvitationStatus;
  invited_by_name: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

/* ─────────────────────── Rank history (doc 01 §2) ─────────────────────── */

/** A row of `rank_history` (immutable rank-change audit, enriched with names). */
export interface RankHistoryEntry {
  id: string;
  marketer_id: string;
  marketer_name: string;
  previous_rank: MarketerRank | null;
  new_rank: MarketerRank;
  changed_at: string;
  changed_by_name: string | null;
  notes: string | null;
}

/* ─────────────────────── Audit log (doc 01 §6.8 / doc 10 §5) ─────────────────────── */

/** `audit_action` — the canonical sensitive-action vocabulary. */
export type AuditAction =
  | 'marketer.create'
  | 'marketer.place'
  | 'marketer.move'
  | 'marketer.status_change'
  | 'rank.change'
  | 'prospect.stage_change'
  | 'invitation.create'
  | 'invitation.revoke'
  | 'account.activate'
  | 'membership.role_change'
  | 'membership.permissions_change'
  | 'membership.status_change'
  | 'contacts.bulk_update'
  | 'contacts.bulk_delete'
  | 'document.publish'
  | 'document.archive'
  | 'organization.update'
  | 'auth.email_change'
  | 'auth.refresh_reuse';

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'marketer.create': 'Profilo creato',
  'marketer.place': 'Profilo posizionato',
  'marketer.move': 'Profilo spostato',
  'marketer.status_change': 'Stato profilo modificato',
  'rank.change': 'Cambio di grado',
  'prospect.stage_change': 'Cambio fase prospect',
  'invitation.create': 'Invito creato',
  'invitation.revoke': 'Invito revocato',
  'account.activate': 'Accesso CRM attivato',
  'membership.role_change': 'Cambio ruolo',
  'membership.permissions_change': 'Permessi modificati',
  'membership.status_change': 'Stato account modificato',
  'contacts.bulk_update': 'Aggiornamento contatti in blocco',
  'contacts.bulk_delete': 'Eliminazione contatti in blocco',
  'document.publish': 'Documento pubblicato',
  'document.archive': 'Documento archiviato',
  'organization.update': 'Impostazioni organizzazione',
  'auth.email_change': 'Cambio email di accesso',
  'auth.refresh_reuse': 'Riuso token rilevato',
};

/** Coarse category of an audit action (drives the timeline icon/tone). */
export type AuditCategory =
  | 'marketer'
  | 'rank'
  | 'prospect'
  | 'invitation'
  | 'account'
  | 'membership'
  | 'contacts'
  | 'document'
  | 'organization'
  | 'auth';

export function auditCategory(action: AuditAction): AuditCategory {
  return action.split('.')[0] as AuditCategory;
}

/** A row of `audit_log` (enriched with the actor's display name). */
export interface AuditLogEntry {
  id: string;
  actor_name: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

/* ─────────────────────── Organization settings (doc 01 §1.1) ─────────────────────── */

/** Bottleneck-engine thresholds (org override of the ADR-009 #8 defaults). */
export interface BottleneckThresholds {
  inactivity_days: number;
  followup_overdue_count: number;
  min_volume_conoscitiva: number;
}

/** A projection of `organizations` (+ the bottleneck settings sub-object). */
export interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  locale: string;
  timezone: string;
  bottleneck: BottleneckThresholds;
}
