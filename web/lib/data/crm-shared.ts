import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getCurrentClaims } from '@/lib/data/session';

/**
 * The RLS-bound server client type, inferred from {@link createClient} so we
 * never duplicate the (generic) Supabase client signature. `createClient()`
 * returns `SupabaseClient | null`; we narrow out the null in {@link getClient}.
 */
type ServerClient = NonNullable<ReturnType<typeof createClient>>;

/**
 * Shared plumbing for the CRM data layer (contacts/prospects/calls/lista-contatti/
 * seven-whys/documents). Mirrors the genealogy pattern: every read attempts
 * Supabase via the RLS-bound server client and FALLS BACK to mock data when env
 * is missing OR the call throws — so the app is fully renderable in "modalità
 * demo" and `next build` succeeds with no env (RESILIENCE).
 *
 * Mutations follow the same contract: a real Supabase write when configured, a
 * SIMULATED success in demo mode (never throws). Callers get a {@link CrmResult}
 * with a `demo` flag so the UI can surface the config-notice pattern.
 */

export interface CrmResult<T> {
  data: T;
  /** true when served from mock data / simulated (env missing or query failed). */
  demo: boolean;
}

export interface MutationResult<T> {
  data: T;
  demo: boolean;
  /** false only when a configured Supabase write failed (UI shows an error). */
  ok: boolean;
}

/** Build a successful result envelope. */
export function ok<T>(data: T, demo: boolean): CrmResult<T> {
  return { data, demo };
}

/**
 * Returns a live RLS-bound client, or null when env is missing. Centralizes the
 * "is this demo mode?" decision so every data module reads the same way.
 */
export function getClient(): ServerClient | null {
  if (!isSupabaseConfigured) return null;
  try {
    return createClient();
  } catch {
    return null;
  }
}

/** True when there is no usable Supabase connection (→ use mock + simulate). */
export function isDemo(): boolean {
  return getClient() === null;
}

/** Resolve the caller's org/marketer ids for scoping writes (demo-safe). */
export async function getOwnerContext(): Promise<{
  orgId: string;
  marketerId: string;
  demo: boolean;
}> {
  const { claims, demo } = await getCurrentClaims();
  return { orgId: claims.org_id, marketerId: claims.marketer_id, demo };
}

/* ───────────────────────── shared query helpers ───────────────────────── */

/**
 * Read EVERY row of a query, defeating PostgREST's per-request row cap. Calls
 * `makeQuery(from, to)` for successive `.range()` windows and concatenates them
 * until a short page signals the end. `makeQuery` must build a FRESH query each
 * call (awaiting a builder consumes it). Returns null only when the FIRST page
 * errors (so callers can fall back to mock); a mid-paging error keeps what was
 * read. `page` must be ≤ the platform row cap (default 1000) for the short-page
 * stop to be reliable.
 */
export async function fetchAllRows<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  // Big page → few round-trips (10k rows = ~1 call). MUST stay ≤ the configured
  // PostgREST row cap (raised to 50000) so the short-page stop is reliable.
  page = 10000,
): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await makeQuery(from, from + page - 1);
    if (error) return from === 0 ? null : out;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < page) break;
  }
  return out;
}

export type SortDir = 'asc' | 'desc';

/** Case-insensitive substring match used by mock search fallbacks. */
export function matchesText(haystack: string | null | undefined, q: string): boolean {
  if (!q) return true;
  return (haystack ?? '').toLowerCase().includes(q.toLowerCase());
}

/** Generic comparator for sorting mock rows by a key + direction. */
export function compareBy<T>(
  key: keyof T,
  dir: SortDir,
): (a: T, b: T) => number {
  return (a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return dir === 'asc' ? -1 : 1;
    if (bv == null) return dir === 'asc' ? 1 : -1;
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  };
}

/** Simulated network-free delay slot — kept synchronous for RSC determinism. */
export function nowIso(): string {
  return new Date().toISOString();
}
