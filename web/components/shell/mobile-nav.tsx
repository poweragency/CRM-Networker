'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Network, X } from 'lucide-react';
import type { NavViewer } from '@/lib/nav';
import { SidebarNav } from '@/components/shell/sidebar-nav';
import { cn } from '@/lib/utils';

/**
 * Mobile navigation drawer (< md). A slide-in panel + scrim, controlled by the
 * topbar's hamburger via {@link AppShell}. Locks body scroll while open, closes
 * on Escape, scrim click, route change, or link selection. Reuses the same gated
 * {@link SidebarNav} as the desktop rail so the two surfaces never drift.
 */

export interface MobileNavProps {
  viewer: NavViewer;
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ viewer, open, onClose }: MobileNavProps) {
  const tc = useTranslations('common');
  const t = useTranslations('topbar');
  const pathname = usePathname();

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
        role="dialog"
        aria-modal="true"
        aria-label={tc('appName')}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r bg-card shadow-xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClose}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Network className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight text-card-foreground">
              {tc('appName')}
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close_menu')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <SidebarNav viewer={viewer} onNavigate={onClose} />
      </div>
    </div>
  );
}
