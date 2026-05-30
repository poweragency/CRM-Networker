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
 * Must be called within a request scope (it uses `next/headers` cookies()).
 */
export function createClient() {
  if (!isSupabaseConfigured) {
    return null;
  }

  const cookieStore = cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
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
