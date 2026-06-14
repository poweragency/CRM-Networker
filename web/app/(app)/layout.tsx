import { redirect } from 'next/navigation';
import { getCurrentClaims } from '@/lib/data/session';
import { getNode } from '@/lib/data/genealogy';
import { listNotifications } from '@/lib/data/notifications';
import { getOrgIdentity } from '@/lib/data/org-identity';
import { isSupabaseConfigured, isDemoAllowed } from '@/lib/env';
import { AppShell } from '@/components/shell/app-shell';
import { ServiceSuspended } from '@/components/platform/service-suspended';
import type { NavViewer } from '@/lib/nav';
import type { TopbarUser } from '@/components/shell/topbar';

/**
 * (app) authenticated CRM shell (doc 08 §2 / ADR-008).
 *
 * Server component. Reads the caller's JWT claims via `getCurrentClaims()`, which
 * is demo-safe: when Supabase env is missing OR there is no session it returns a
 * deterministic DEMO claim set instead of throwing, so the shell renders fully in
 * "modalità demo" and `next build` succeeds with no env (RESILIENCE).
 *
 * Authenticated routing: only when Supabase IS configured and the call resolves
 * to demo (no real session) do we bounce to /accedi — in pure no-env demo mode
 * we render the shell so the product is explorable.
 *
 * The derived viewer (rank/role/crm_access) drives the gated sidebar; identity
 * (org name, display name) feeds the topbar. All gating is computed here once and
 * passed down — the client shell never re-reads claims.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { claims, demo, email } = await getCurrentClaims();

  // Platform super-admin is external to every org and has no marketer/org context:
  // never render the app shell — send it to its dedicated panel.
  if (claims.is_platform_admin) {
    redirect('/organizzazioni');
  }

  // Require login whenever there is no real session — EXCEPT in genuine local
  // demo mode (no env + demo allowed). In production with missing env we fail
  // closed here instead of rendering a fake owner shell (see env.isDemoAllowed).
  if (demo && (isSupabaseConfigured || !isDemoAllowed)) {
    redirect('/accedi');
  }

  const viewer: NavViewer = {
    role: claims.role,
    rank: claims.rank,
    crmAccess: claims.crm_access,
  };

  // Resolve a friendly display name: the caller's own marketer profile (demo
  // tree falls back gracefully), else the email local-part, else a default.
  const { data: self } = await getNode(claims.marketer_id);
  const displayName =
    self?.display_name ??
    (email ? email.split('@')[0]! : 'Marketer');

  const user: TopbarUser = {
    displayName,
    email,
    rank: claims.rank,
    role: claims.role,
    avatarUrl: null,
  };

  // Live unread count from the notifications feed (includes team birthdays).
  const { unread: unreadCount } = await listNotifications();

  // Org identity (name + logo) for the shell brand; placeholders when unset.
  const identity = (await getOrgIdentity()).data;

  // Org sospesa (mancato rinnovo): blocca l'accesso di TUTTI i membri con il
  // messaggio di servizio non attivo. I dati restano intatti (solo gate UI).
  if (!demo && identity?.suspended) {
    return <ServiceSuspended />;
  }

  const orgName = demo ? 'Networker · Demo' : identity?.name || 'Workspace';
  const orgLogoUrl = identity?.logoUrl ?? null;

  return (
    <AppShell
      viewer={viewer}
      user={user}
      orgName={orgName}
      orgLogoUrl={orgLogoUrl}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
