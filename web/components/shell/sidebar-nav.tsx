'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';
import { visibleNavSections, navFooterItems, type NavViewer } from '@/lib/nav';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Shared navigation list rendered inside both the desktop {@link Sidebar} and the
 * mobile drawer. Driven entirely by `visibleNavSections(viewer)` so rank/role/
 * crm-access gating (lib/nav.ts) decides what the caller sees — the admin group
 * is dropped for non admin/owner, CRM items require the crm_access flag, etc.
 *
 * `collapsed` collapses the desktop rail to icons-only (label moves into a
 * tooltip). `onNavigate` lets the mobile drawer close itself on link selection.
 */

export interface SidebarNavProps {
  viewer: NavViewer;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ viewer, collapsed = false, onNavigate }: SidebarNavProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const sections = visibleNavSections(viewer);

  function isActive(href: string): boolean {
    // Exact match, or a nested route — but guard against `/admin` swallowing
    // `/admin/marketer` highlighting both: prefer the longest matching href.
    if (pathname === href) return true;
    if (!pathname.startsWith(`${href}/`)) return false;
    // A more specific sibling owns the highlight if it also matches.
    return !sections
      .flatMap((s) => s.items)
      .concat(navFooterItems)
      .some(
        (other) =>
          other.href !== href &&
          other.href.startsWith(`${href}/`) &&
          (pathname === other.href || pathname.startsWith(`${other.href}/`)),
      );
  }

  return (
    <div className="flex h-full flex-col">
      <nav
        className={cn(
          'flex-1 space-y-5 overflow-y-auto py-4',
          collapsed ? 'px-2' : 'px-3',
          '[scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]',
          '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent',
        )}
        aria-label={t('platform')}
      >
        {sections.map((section) => (
          <div key={section.titleKey}>
            {!collapsed && (
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {t(`section.${section.titleKey}`)}
              </p>
            )}
            {collapsed && (
              <div className="mx-2 mb-2 h-px bg-border/70" aria-hidden />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    label={t(item.labelKey)}
                    Icon={item.icon}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('border-t py-3', collapsed ? 'px-2' : 'px-3')}>
        <ul className="space-y-0.5">
          {navFooterItems.map((item) => (
            <li
              key={item.href}
              className={cn(item.separatorBefore && 'mt-2 border-t pt-2')}
            >
              <NavLink
                href={item.href}
                label={t(item.labelKey)}
                Icon={item.icon}
                active={isActive(item.href)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface NavLinkProps {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}

function NavLink({ href, label, Icon, active, collapsed, onNavigate }: NavLinkProps) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center rounded-lg text-sm font-medium outline-none transition-colors duration-base ease-standard focus-visible:ring-2 focus-visible:ring-ring',
        collapsed ? 'h-9 w-9 justify-center' : 'gap-2.5 px-2.5 py-2',
        active
          ? 'bg-primary/[0.08] text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {/* active rail accent — present in BOTH states (cross-collapse continuity) */}
      {active && (
        <span
          className={cn(
            'absolute left-0 w-0.5 rounded-full bg-primary',
            collapsed ? 'inset-y-1.5' : 'inset-y-1',
          )}
          aria-hidden
        />
      )}
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
        )}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{label}</span>}
      {collapsed && <span className="sr-only">{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip content={label} side="right">
        {link}
      </Tooltip>
    );
  }
  return link;
}
