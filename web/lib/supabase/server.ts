import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env';

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Server Supabase client (RLS-bound) for RSC, Server Actions and Route Handlers.
 * Reads/writes the auth cookie via `@supabase/ssr`. First-paint reads and
 * progressive-enhancement mutations go through here.
 *
 * Returns `null` when env is not configured so server components can render a
 * config notice instead of throwing (scaffold requirement).
 *
 * Next 15: `cookies()` is async, so the cookie adapter resolves it lazily inside
 * `getAll`/`setAll` (called by supabase-js when it actually touches cookies). This
 * keeps `createClient()` synchronous — no `await` ripple across the data layer —
 * and is the canonical @supabase/ssr pattern for the App Router.
 */
export function createClient() {
  if (!isSupabaseConfigured) {
    return null;
  }

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      async getAll() {
        return (await cookies()).getAll();
      },
      async setAll(cookiesToSet: CookieToSet[]) {
        try {
          const cookieStore = await cookies();
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `setAll` is called from a Server Component where mutating cookies is
          // not allowed. Session refresh is handled by middleware, so this is safe
          // to ignore.
        }
      },
    },
  });
}
