import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { ConfigNotice } from '@/components/config-notice';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/topbar';

/**
 * (app) authenticated CRM shell (doc 08 §2 / ADR-008).
 * Server component: reads the session and bounces unauthenticated requests to
 * /accedi. The full CRM gate (effective_crm_access) and rank/role sidebar
 * filtering are layered in a later phase — this scaffold gates only on session.
 *
 * When env is missing the app must not crash: it renders a config notice shell.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <ConfigNotice />
      </main>
    );
  }

  const supabase = createClient();
  // `supabase` is non-null here because isSupabaseConfigured is true.
  const {
    data: { user },
  } = await supabase!.auth.getUser();

  if (!user) {
    redirect('/accedi');
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userEmail={user.email ?? null} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
