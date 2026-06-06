import {
  LayoutDashboard,
  Network,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  UserRound,
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
  /** Render a divider line above this item (used in the footer group). */
  separatorBefore?: boolean;
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
  'co_admin',
  'manager',
  'admin',
  'owner',
];

/**
 * The sidebar is intentionally reduced to four destinations (product decision):
 *   1. Dashboard      — best marketers of the month, by category
 *   2. Genealogia     — the binary tree viewer (unchanged)
 *   3. Statistiche    — the team roster (each member → /team/[id])
 *   4. Presenze Zoom  — per-day attendance for the 3 calls (own subtree)
 * Informativa + Impostazioni live in the footer group at the very bottom
 * (Informativa above Impostazioni, separated by a divider). 100's list, Sette
 * Perché and i percorsi informativi are PER-PERSON files and live INSIDE the
 * single marketer profile (/team/[id]), not in the menu. The legacy
 * CRM/Analisi/Admin pages still exist in the codebase but are no longer surfaced.
 */
export const navSections: NavSection[] = [
  {
    titleKey: 'principale',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
      { href: '/genealogia', labelKey: 'tree', icon: Network },
      { href: '/statistiche', labelKey: 'statistics', icon: BarChart3 },
      { href: '/presenze', labelKey: 'attendance', icon: ClipboardCheck },
    ],
  },
];

/**
 * Footer items pinned at the bottom: Informativa, then Impostazioni below a
 * divider so the two read as elegantly separated.
 */
const INFORMATIVA_ITEM: NavItem = {
  href: '/informativa',
  labelKey: 'informativa',
  icon: BookOpen,
};
const PROFILE_ITEM: NavItem = {
  href: '/impostazioni',
  labelKey: 'profile',
  icon: UserRound,
};

export const navFooterItems: NavItem[] = [
  INFORMATIVA_ITEM,
  { ...PROFILE_ITEM, separatorBefore: true },
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
 * Limited members (cliente / no_rank / executive with a plain `member` role) get
 * a reduced shell — only their Profilo + the Informativa. Anyone co-admin+ OR
 * rank consultant+ sees the full app.
 */
export function isLimitedViewer(viewer: NavViewer): boolean {
  return !(
    roleAtLeast(viewer.role, 'co_admin') || rankAtLeast(viewer.rank, 'consultant')
  );
}

/** Footer items for the viewer — empty for limited members (moved into the rail). */
export function visibleNavFooter(viewer: NavViewer): NavItem[] {
  return isLimitedViewer(viewer) ? [] : navFooterItems;
}

/**
 * Compute the viewer's visible sidebar model. An item is shown when it passes
 * BOTH its section gate and its own gate — except an item-level gate that names
 * a rank/role overrides (widens) the section gate for that item (Attivazioni).
 */
export function visibleNavSections(viewer: NavViewer): NavSection[] {
  // Limited members: a minimal rail — Profilo first, then Informativa.
  if (isLimitedViewer(viewer)) {
    return [{ titleKey: 'principale', items: [PROFILE_ITEM, INFORMATIVA_ITEM] }];
  }
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
