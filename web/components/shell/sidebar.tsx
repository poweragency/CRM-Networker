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
        // Pinned to the viewport, same "glass plane" as the topbar.
        'sticky top-0 hidden h-screen shrink-0 self-start border-r border-border/70 bg-card/70 backdrop-blur-md transition-[width] duration-base ease-standard md:flex md:flex-col',
        collapsed ? 'w-rail' : 'w-side',
      )}
      data-collapsed={collapsed}
    >
      {/* Brand header */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-border/70',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {collapsed ? (
          // Collapsed rail: the header IS the expand control, so reopening sits
          // exactly where the collapse button was (top), not hidden at the bottom.
          <CollapseButton
            collapsed={collapsed}
            label={t('open_menu')}
            onClick={onToggleCollapsed}
          />
        ) : (
          <>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={tc('appName')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105">
                <Network className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="truncate text-sm font-semibold tracking-tight text-card-foreground">
                {tc('appName')}
              </span>
            </Link>

            <CollapseButton
              collapsed={collapsed}
              label={t('toggle_sidebar')}
              onClick={onToggleCollapsed}
            />
          </>
        )}
      </div>

      <SidebarNav viewer={viewer} collapsed={collapsed} />
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
