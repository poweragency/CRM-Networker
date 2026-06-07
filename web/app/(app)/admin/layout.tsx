import { redirect } from 'next/navigation';
import { getCurrentClaims } from '@/lib/data/session';
import { isOrgAdmin } from '@/lib/data/authz';

/**
 * Server-side gate for the ENTIRE /admin section (audit A2). Only org admins
 * (owner/admin) may render any admin page; everyone else is redirected. This is
 * defense-in-depth on top of RLS (the data boundary) and the middleware — a
 * non-admin who navigates straight to /admin no longer sees the admin shell.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { claims } = await getCurrentClaims();
  if (!isOrgAdmin(claims)) redirect('/impostazioni');
  return <>{children}</>;
}
