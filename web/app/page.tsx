import { redirect } from 'next/navigation';

/**
 * Root `/` — (public) marketing/landing is minimal in v1 (ADR-008). The home page
 * is the user's OWN profile (Profilo), so we send visitors there. Middleware
 * bounces unauthenticated users on to /accedi, so this is a safe redirect target.
 */
export default function RootPage() {
  redirect('/impostazioni');
}
