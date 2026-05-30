'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Network, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { NavViewer } from '@/lib/nav';
import { SidebarNav } from '@/components/shell/sidebar-nav';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Desktop primary sidebar (≥ md). Collapsible to an icons-only rail; the
 * collapsed/expanded state is owned by the parent {@link AppShell} so the
 * content area can reflow. Hidden below `md` — the mobile drawer takes over.
 *
 * The navigation list is gated by `viewer` (rank/role/crm_access) via
 * {@link SidebarNav}; this component only owns the brand header and the collapse
 * affordance.
 */

export interface SidebarProps {
  viewer: NavViewer;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({ viewer, collapsed, onToggleCollapsed }: SidebarProps) {
  const t = useTranslations('topbar');
  const tc = useTranslations('common');

  return (
    <aside
      className={cn(
        'hidden shrink-0 border-r bg-card transition-[width] duration-200 ease-out md:flex md:flex-col',
        collapsed ? 'w-[4.25rem]' : 'w-64',
      )}
      data-collapsed={collapsed}
    >
      {/* Brand header */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={tc('appName')}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Network className="h-[18px] w-[18px]" aria-hidden />
          </span>
          {!collapsed && (
            <span className="truncate text-sm font-semibold tracking-tight text-card-foreground">
              {tc('appName')}
            </span>
          )}
        </Link>

        {!collapsed && (
          <CollapseButton
            collapsed={collapsed}
            label={t('toggle_sidebar')}
            onClick={onToggleCollapsed}
          />
        )}
      </div>

      <SidebarNav viewer={viewer} collapsed={collapsed} />

      {/* Expand affordance pinned at the bottom when collapsed */}
      {collapsed && (
        <div className="flex justify-center border-t px-2 py-3">
          <CollapseButton
            collapsed={collapsed}
            label={t('open_menu')}
            onClick={onToggleCollapsed}
          />
        </div>
      )}
    </aside>
  );
}

function CollapseButton({
  collapsed,
  label,
  onClick,
}: {
  collapsed: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Tooltip content={label} side={collapsed ? 'right' : 'bottom'}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </button>
    </Tooltip>
  );
}
