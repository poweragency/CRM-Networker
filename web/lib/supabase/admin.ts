import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';

/**
 * Service-role admin client (SERVER-ONLY). Bypasses RLS and can manage auth users
 * (create logins). Reads SUPABASE_SERVICE_ROLE_KEY — a SECRET, NON-public env var
 * (do NOT prefix with NEXT_PUBLIC). NEVER import this in a client component.
 *
 * Returns null when the key is not configured, so callers can degrade gracefully
 * (e.g. surface "attivazione non configurata") instead of throwing.
 */
export function getAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
