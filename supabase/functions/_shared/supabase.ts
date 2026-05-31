import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase client factories for the Edge runtime. Two shapes:
//   - userClient(req): anon key + the caller's forwarded JWT, so PostgREST/RPC
//     run under the caller's RLS + current_*() claim accessors (the default,
//     least-privilege path).
//   - adminClient(): service-role key, bypasses RLS. Used ONLY where we must act
//     before the caller is fully authenticated (creating the auth.users login in
//     activate-account) or as a trusted system writer.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by
// the Supabase Edge platform automatically.

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

/** RLS-bound client carrying the caller's JWT (from the Authorization header). */
export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization') ?? '';
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client (bypasses RLS). Use sparingly + deliberately. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The configured site URL for building invite links (fallback to request origin). */
export function siteUrl(req: Request): string {
  const fromEnv = Deno.env.get('SITE_URL');
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}
