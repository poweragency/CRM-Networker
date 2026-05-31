'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, LogOut, Menu, Settings, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ScopeSwitcher } from '@/components/scope-switcher';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROLE_LABELS, type MarketerRank, type MembershipRole } from '@/lib/types/db';

/**
 * Top application bar — premium "glass plane" shared with the sidebar.
 * Three clusters: LEFT = mobile hamburger + workspace pill (brand mark + org
 * name); RIGHT = context (Scope switcher) | hairline divider | system (theme,
 * notifications bell with unread count, account menu with rank + "Esci").
 * Gap scale (gap-1 within a group, gap-3 between groups) keeps the actions from
 * collapsing into a wall of icons.
 *
 * Pure presentational identity (org name / display name / rank / role) is passed
 * down from the server layout so this client component never re-reads claims.
 */

export interface TopbarUser {
  displayName: string;
  email: string | null;
  rank: MarketerRank;
  role: MembershipRole;
  avatarUrl?: string | null;
}

export interface TopbarProps {
  orgName: string;
  user: TopbarUser;
  /** Static for now — wired to the notifications feed in a later phase. */
  unreadCount?: number;
  onOpenMobileNav: () => void;
}

export function Topbar({ orgName, user, unreadCount = 0, onOpenMobileNav }: TopbarProps) {
  const t = useTranslations('topbar');
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace('/accedi');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-card/70 px-3 backdrop-blur-md sm:px-4">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label={t('open_menu')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/* Workspace pill: brand mark + org name */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground shadow-sm"
          aria-hidden
        >
          {orgInitials(orgName)}
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
            {t('workspace')}
          </span>
          <span
            className="block max-w-[12rem] truncate text-sm font-semibold leading-tight text-foreground"
            title={orgName}
          >
            {orgName}
          </span>
        </span>
      </div>

      {/* Right clusters: context (scope) | divider | system */}
      <div className="ml-auto flex items-center gap-2">
        <ScopeSwitcher className="hidden sm:inline-flex" />

        <span className="hidden h-6 w-px bg-border/70 sm:block" aria-hidden />

        <div className="flex items-center gap-0.5">
        <ThemeToggle />

        {/* Notifications */}
        <Link
          href="/notifiche"
          aria-label={
            unreadCount > 0
              ? `${t('notifications')} — ${t('notifications_unread', { count: unreadCount })}`
              : t('notifications')
          }
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white"
              aria-hidden
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('user_menu')}
              className="flex items-center gap-2 rounded-full p-0.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:rounded-lg sm:py-1 sm:pl-1 sm:pr-2"
            >
              <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
              <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                <span className="max-w-[10rem] truncate text-sm font-medium text-foreground">
                  {user.displayName}
                </span>
                <span className="max-w-[10rem] truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[user.role]}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.displayName}
                </p>
                {user.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
              <RankBadge rank={user.rank} />
              <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('user_menu')}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push('/impostazioni')}>
              <UserRound className="h-4 w-4" aria-hidden />
              {t('my_profile')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/impostazioni')}>
              <Settings className="h-4 w-4" aria-hidden />
              {t('account_settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              disabled={signingOut}
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {t('logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/** Up-to-2-letter initials from the org name for the brand mark. */
function orgInitials(name: string): string {
  const parts = name.replace(/[·.]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CN';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
