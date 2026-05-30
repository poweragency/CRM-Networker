'use client';

import * as React from 'react';
import { ScopeProvider } from '@/lib/scope/scope-provider';
import { Sidebar } from '@/components/shell/sidebar';
import { MobileNav } from '@/components/shell/mobile-nav';
import { Topbar, type TopbarUser } from '@/components/shell/topbar';
import type { NavViewer } from '@/lib/nav';

/**
 * Client shell that wires the sidebar, mobile drawer and topbar together and owns
 * the UI state they share: the desktop rail's collapsed flag (persisted to
 * localStorage) and the mobile drawer's open flag.
 *
 * Mounts {@link ScopeProvider} so the topbar's ScopeSwitcher can read/write the
 * `?scope=` URL param; because that provider calls `useSearchParams()`, it lives
 * inside a Suspense boundary (Next.js prerender requirement).
 *
 * All identity/gating inputs (`viewer`, `user`, `orgName`) are computed once on
 * the server and passed down, so no claims are re-read on the client.
 */

const COLLAPSE_KEY = 'crmn.sidebar.collapsed';

export interface AppShellProps {
  viewer: NavViewer;
  user: TopbarUser;
  orgName: string;
  unreadCount?: number;
  children: React.ReactNode;
}

export function AppShell({
  viewer,
  user,
  orgName,
  unreadCount = 0,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Restore the persisted collapsed preference after mount (avoids hydration
  // mismatch — the server always renders the expanded rail).
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    } catch {
      /* localStorage unavailable (private mode) — keep default */
    }
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const closeMobile = React.useCallback(() => setMobileOpen(false), []);
  const openMobile = React.useCallback(() => setMobileOpen(true), []);

  return (
    <React.Suspense fallback={<ShellFallback>{children}</ShellFallback>}>
      <ScopeProvider>
        <div className="flex min-h-screen bg-background">
          <Sidebar
            viewer={viewer}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />

          <MobileNav viewer={viewer} open={mobileOpen} onClose={closeMobile} />

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              orgName={orgName}
              user={user}
              unreadCount={unreadCount}
              onOpenMobileNav={openMobile}
            />
            <main className="flex-1 overflow-x-hidden">
              <div className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </div>
            </main>
          </div>
        </div>
      </ScopeProvider>
    </React.Suspense>
  );
}

/** Minimal fallback while the Suspense-bound scope provider resolves. */
function ShellFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden w-64 shrink-0 border-r bg-card md:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 border-b bg-card" />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
