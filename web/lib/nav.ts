import {
  LayoutDashboard,
  Network,
  Users,
  KanbanSquare,
  Phone,
  ListChecks,
  HelpCircle,
  FileText,
  BarChart3,
  Trophy,
  FileBarChart,
  Bell,
  Settings,
  ShieldCheck,
  UserPlus,
  KeyRound,
  Medal,
  ScrollText,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import {
  RANK_ORDER,
  type MarketerRank,
  type MembershipRole,
} from '@/lib/types/db';

/**
 * Sidebar navigation model — the canonical ADR-008 route map (doc 16), grouped
 * into the four authoritative sections (principale, crm, analisi, admin). Each
 * item declares its rank/role gating so the shell can render a filtered model;
 * `labelKey` points into messages/it.json `nav.*` and `titleKey` into
 * `nav.section.*`. Italian slugs are the stable contract (paths are NOT
 * translated per-locale).
 */

export interface NavGate {
  /** Minimum membership role required (role hierarchy below). Omit = any. */
  minRole?: MembershipRole;
  /** Minimum marketer rank required (RANK_ORDER). Omit = any. */
  minRank?: MarketerRank;
  /** Require an active CRM-access flag. */
  requireCrmAccess?: boolean;
}

export interface NavItem {
  href: string;
  /** i18n key under the `nav` namespace. */
  labelKey: string;
  icon: LucideIcon;
  gate?: NavGate;
}

export interface NavSection {
  /** i18n key under the `nav.section` namespace. */
  titleKey: string;
  items: NavItem[];
  /** Section-level gate (applied on top of per-item gates). */
  gate?: NavGate;
}

/** Role hierarchy (low → high) for `minRole` comparisons. */
export const ROLE_ORDER: readonly MembershipRole[] = [
  'member',
  'manager',
  'admin',
  'owner',
];

export const navSections: NavSection[] = [
  {
    titleKey: 'principale',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
      { href: '/genealogia', labelKey: 'tree', icon: Network },
      { href: '/notifiche', labelKey: 'notifications', icon: Bell },
    ],
  },
  {
    titleKey: 'crm',
    gate: { requireCrmAccess: true },
    items: [
      { href: '/contatti', labelKey: 'contacts', icon: Users },
      { href: '/percorso-prospect', labelKey: 'prospects', icon: KanbanSquare },
      { href: '/chiamate', labelKey: 'calls', icon: Phone },
      { href: '/centos', labelKey: 'centos', icon: ListChecks },
      { href: '/sette-perche', labelKey: 'seven_whys', icon: HelpCircle },
      { href: '/documenti', labelKey: 'documents', icon: FileText },
    ],
  },
  {
    titleKey: 'analisi',
    items: [
      { href: '/analytics', labelKey: 'analytics', icon: BarChart3 },
      { href: '/classifiche', labelKey: 'leaderboards', icon: Trophy },
      { href: '/report', labelKey: 'reports', icon: FileBarChart },
    ],
  },
  {
    titleKey: 'admin',
    // Whole section is admin/owner; the Attivazioni item additionally accepts
    // rank ≥ team_leader within own subtree (ADR-003) — see `attivazioniGate`.
    gate: { minRole: 'admin' },
    items: [
      { href: '/admin', labelKey: 'admin_dashboard', icon: ShieldCheck },
      { href: '/admin/marketer', labelKey: 'admin_marketer', icon: Users },
      {
        href: '/admin/marketer/nuovo',
        labelKey: 'admin_marketer_new',
        icon: UserPlus,
      },
      {
        href: '/admin/attivazioni',
        labelKey: 'admin_activations',
        icon: KeyRound,
        // Overrides the section gate: admin/owner OR rank ≥ team_leader.
        gate: { minRank: 'team_leader' },
      },
      { href: '/admin/ranghi', labelKey: 'admin_ranks', icon: Medal },
      { href: '/admin/audit', labelKey: 'admin_audit', icon: ScrollText },
      {
        href: '/admin/impostazioni-org',
        labelKey: 'admin_org_settings',
        icon: Building2,
      },
    ],
  },
];

/** Footer items rendered below the sections (always present). */
export const navFooterItems: NavItem[] = [
  { href: '/impostazioni', labelKey: 'settings', icon: Settings },
];

/* ───────────────────────── gating helpers ───────────────────────── */

export interface NavViewer {
  role: MembershipRole;
  rank: MarketerRank;
  crmAccess: boolean;
}

function roleAtLeast(role: MembershipRole, min: MembershipRole): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);
}

function rankAtLeast(rank: MarketerRank, min: MarketerRank): boolean {
  return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(min);
}

/** True when the viewer satisfies a single gate. */
export function passesGate(viewer: NavViewer, gate?: NavGate): boolean {
  if (!gate) return true;
  if (gate.requireCrmAccess && !viewer.crmAccess) return false;
  // role OR rank: a gate that names both is satisfied by EITHER (admin OR
  // rank≥team_leader for Attivazioni). A gate naming only one requires that one.
  if (gate.minRole && gate.minRank) {
    return (
      roleAtLeast(viewer.role, gate.minRole) ||
      rankAtLeast(viewer.rank, gate.minRank)
    );
  }
  if (gate.minRole && !roleAtLeast(viewer.role, gate.minRole)) return false;
  if (gate.minRank && !rankAtLeast(viewer.rank, gate.minRank)) return false;
  return true;
}

/**
 * Compute the viewer's visible sidebar model. An item is shown when it passes
 * BOTH its section gate and its own gate — except an item-level gate that names
 * a rank/role overrides (widens) the section gate for that item (Attivazioni).
 */
export function visibleNavSections(viewer: NavViewer): NavSection[] {
  return navSections
    .map((section) => {
      const items = section.items.filter((item) => {
        // Item gate present → it is the authority for that item (it may widen
        // access beyond the section gate, e.g. rank≥team_leader on Attivazioni).
        if (item.gate) return passesGate(viewer, item.gate);
        return passesGate(viewer, section.gate);
      });
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
}
