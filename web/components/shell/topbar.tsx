'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, LogOut, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Top bar (scaffold). Search palette, branch switcher and notifications popover
 * are stubbed as static affordances; the logout action is wired to Supabase.
 */
export function TopBar({ userEmail }: { userEmail: string | null }) {
  const t = useTranslations('topbar');
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace('/accedi');
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b bg-card px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Search className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{t('search_placeholder')}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted"
          aria-label={t('notifications')}
        >
          <Bell className="h-4 w-4" aria-hidden />
        </button>

        {userEmail && (
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {userEmail}
          </span>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t('logout')}</span>
        </button>
      </div>
    </header>
  );
}
