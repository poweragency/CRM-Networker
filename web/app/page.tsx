import { redirect } from 'next/navigation';

/**
 * Root `/` — (public) marketing/landing is minimal in v1 (ADR-008), so we send
 * visitors to the dashboard. Middleware bounces unauthenticated users on to
 * /accedi, so this is a safe single redirect target.
 */
export default function RootPage() {
  redirect('/dashboard');
}
