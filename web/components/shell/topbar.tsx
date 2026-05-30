'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, LogOut, Menu, Search, Settings, UserRound } from 'lucide-react';
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
 * Top application bar. Left: mobile hamburger + workspace identity. Center
 * (≥ lg): a search affordance that opens nothing yet (palette lands later) but
 * reads as a real control. Right: the first-class Scope switcher, theme toggle,
 * a notifications bell with a static unread count, and the account menu (avatar
 * + name + rank, with "Esci" wired to Supabase signOut).
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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-4">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label={t('open_menu')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/* Workspace identity */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
          {t('workspace')}
        </span>
        <span
          className="truncate text-sm font-semibold text-foreground"
          title={orgName}
        >
          {orgName}
        </span>
      </div>

      {/* Search affordance */}
      <div className="ml-2 hidden flex-1 justify-center lg:flex">
        <button
          type="button"
          aria-label={t('search_aria')}
          className="group inline-flex w-full max-w-md items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:border-ring/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{t('search_hint')}</span>
          <kbd className="ml-auto hidden items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground xl:inline-flex">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        {/* Search icon (small screens) */}
        <button
          type="button"
          aria-label={t('search_aria')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Search className="h-[18px] w-[18px]" aria-hidden />
        </button>

        <ScopeSwitcher className="hidden sm:inline-flex" />

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
    </header>
  );
}
