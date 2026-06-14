import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, KeyRound } from 'lucide-react';
import { getCurrentClaims } from '@/lib/data/session';
import { isSupabaseConfigured, isDemoAllowed } from '@/lib/env';
import { LogoutButton } from '@/components/platform/logout-button';

/**
 * (platform) — the super-admin shell, EXTERNAL to every org (ADR-009 #3). No app
 * nav, no org context, no marketer data: only the "Organizzazioni" panel. Gated
 * strictly to platform admins; a normal member is bounced to their dashboard, a
 * demo/anon session to the login (fail closed in production).
 */
export const dynamic = 'force-dynamic';

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { claims, demo } = await getCurrentClaims();

  const gated = isSupabaseConfigured || !isDemoAllowed;
  if (gated && (demo || !claims.is_platform_admin)) {
    redirect(demo ? '/accedi' : '/dashboard');
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-foreground">Organizzazioni</p>
              <p className="text-[11px] text-muted-foreground">Pannello super-admin</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/reimposta-password"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Cambia password
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
