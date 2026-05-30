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
  type LucideIcon,
} from 'lucide-react';

/**
 * Sidebar navigation model — links only (scaffold).
 *
 * Routes and Italian slugs are taken from the AUTHORITATIVE ADR-008 route map
 * (doc 16), which supersedes the `/rete/*`, `/crm/*`, `/analisi/*` vocabulary of
 * docs 05/08. `labelKey` points into messages/it.json `nav.*`.
 *
 * The (admin) and (platform) groups are intentionally NOT rendered in this
 * member shell — they get their own gated shells in a later phase.
 */

export interface NavItem {
  href: string;
  /** i18n key under the `nav` namespace. */
  labelKey: string;
  icon: LucideIcon;
}

export interface NavSection {
  /** i18n key under the `nav.section` namespace. */
  titleKey: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    titleKey: 'overview',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
      { href: '/notifiche', labelKey: 'notifications', icon: Bell },
    ],
  },
  {
    titleKey: 'network',
    items: [
      { href: '/genealogia', labelKey: 'tree', icon: Network },
    ],
  },
  {
    titleKey: 'crm',
    items: [
      { href: '/contatti', labelKey: 'contacts', icon: Users },
      { href: '/percorso-prospect', labelKey: 'prospects', icon: KanbanSquare },
      { href: '/chiamate', labelKey: 'calls', icon: Phone },
      { href: '/centos', labelKey: 'centos', icon: ListChecks },
      { href: '/sette-perche', labelKey: 'seven_whys', icon: HelpCircle },
    ],
  },
  {
    titleKey: 'resources',
    items: [
      { href: '/documenti', labelKey: 'documents', icon: FileText },
    ],
  },
  {
    titleKey: 'analytics',
    items: [
      { href: '/analytics', labelKey: 'analytics', icon: BarChart3 },
      { href: '/classifiche', labelKey: 'leaderboards', icon: Trophy },
      { href: '/report', labelKey: 'reports', icon: FileBarChart },
    ],
  },
];

/** Footer items rendered below the sections (always present). */
export const navFooterItems: NavItem[] = [
  { href: '/impostazioni', labelKey: 'settings', icon: Settings },
];
