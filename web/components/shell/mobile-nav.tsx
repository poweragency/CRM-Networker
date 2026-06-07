'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { NavViewer } from '@/lib/nav';
import { SidebarNav } from '@/components/shell/sidebar-nav';
import { GlobalSearch } from '@/components/shell/global-search';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/lib/use-focus-trap';

/**
 * Mobile navigation drawer (< md). A slide-in panel + scrim, controlled by the
 * topbar's hamburger via {@link AppShell}. Locks body scroll while open, closes
 * on Escape, scrim click, route change, or link selection. Reuses the same gated
 * {@link SidebarNav} as the desktop rail so the two surfaces never drift.
 */

export interface MobileNavProps {
  viewer: NavViewer;
  orgName: string;
  orgLogoUrl?: string | null;
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ viewer, orgName, orgLogoUrl, open, onClose }: MobileNavProps) {
  const t = useTranslations('topbar');
  const pathname = usePathname();
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  // Close when the route changes (link inside the drawer was followed).
  const lastPath = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  // Escape to close + body scroll lock while open.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <div
      className={cn('md:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={orgName}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-nav-foreground/10 bg-nav text-nav-foreground shadow-xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-nav-foreground/10 px-4">
          <Link
            href="/impostazioni"
            className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClose}
          >
            {orgLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={orgLogoUrl}
                alt={orgName}
                className="h-8 w-8 shrink-0 rounded-lg object-contain shadow-sm"
              />
            ) : (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm"
                aria-hidden
              >
                {orgName.charAt(0).toUpperCase() || 'G'}
              </span>
            )}
            <span className="truncate text-sm font-semibold tracking-tight text-nav-foreground">
              {orgName}
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close_menu')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-nav-foreground/60 outline-none transition-colors hover:bg-nav-foreground/10 hover:text-nav-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        {/* Global search — find team members + prospects by name. */}
        <div className="shrink-0 border-b border-nav-foreground/10 px-3 py-2.5">
          <GlobalSearch onNavigate={onClose} />
        </div>

        <SidebarNav viewer={viewer} onNavigate={onClose} />
      </div>
    </div>
  );
}
