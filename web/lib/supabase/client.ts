'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env';

/**
 * Browser Supabase client (RLS-bound to the caller's JWT via cookies).
 * Used by Client Components for Realtime channels and optimistic mutations.
 * The service-role key is NEVER used in the frontend.
 *
 * Returns `null` when env is not configured so callers can degrade gracefully
 * instead of throwing at import time (scaffold requirement).
 */
export function createClient() {
  if (!isSupabaseConfigured) {
    return null;
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
