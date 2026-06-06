/**
 * Centralized public-env access. The app MUST NOT crash when env is missing
 * (scaffold requirement) — instead `isSupabaseConfigured` is false and the UI
 * renders a configuration notice. Only NEXT_PUBLIC_* vars are referenced so this
 * module is safe to import in both server and client components.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'it';

/** True only when both Supabase public env vars are present. */
export const isSupabaseConfigured: boolean =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

/** Production runtime (Vercel sets NODE_ENV=production for prod + preview builds). */
export const isProduction: boolean = process.env.NODE_ENV === 'production';

/**
 * Whether the demo/mock fallback (and the deterministic DEMO identity) is allowed.
 * SECURITY: in production we FAIL CLOSED — a missing/dropped Supabase env must NOT
 * silently serve a fake owner-admin shell. Demo is only permitted outside
 * production, or via an explicit `NEXT_PUBLIC_DEMO=1` opt-in.
 */
export const isDemoAllowed: boolean =
  !isProduction || process.env.NEXT_PUBLIC_DEMO === '1';
