'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/**
 * Small client sign-out button. Mirrors the topbar logout (signOut → /accedi).
 * Used by the platform (super-admin) header and the suspended-service screen,
 * neither of which mounts the full app shell.
 */
export function LogoutButton({
  className,
  label = 'Esci',
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    setBusy(true);
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.replace('/accedi');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
