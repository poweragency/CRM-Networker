import { logWarn } from '@/lib/log';

/**
 * Best-effort in-memory sliding-window rate limiter. DEFENSE-IN-DEPTH ONLY:
 * serverless instances are per-process and ephemeral, so this catches naive
 * single-instance flooding (rapid repeated calls hitting a warm instance), NOT a
 * distributed attack. Supabase Auth already rate-limits the auth endpoints and
 * RLS remains the real boundary. For production-grade distributed limiting, back
 * this with Upstash Redis (replace the Map logic; the call sites stay the same).
 *
 * Fail-open by construction: any internal error allows the request, and the
 * default limits are generous so normal human usage never trips them.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
}

/** Allow up to `limit` hits per `windowMs` for `key`; ok:false once exceeded. */
export function rateLimit(key: string, limit = 60, windowMs = 60_000): RateLimitResult {
  try {
    const now = Date.now();

    // Opportunistic cleanup so the Map can't grow unbounded.
    if (buckets.size > MAX_KEYS) {
      for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
    }

    const b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1 };
    }
    b.count += 1;
    if (b.count > limit) {
      logWarn('rate-limit', 'exceeded', { key, limit, windowMs });
      return { ok: false, remaining: 0 };
    }
    return { ok: true, remaining: Math.max(0, limit - b.count) };
  } catch {
    return { ok: true, remaining: limit }; // fail open — never block legit traffic
  }
}

/** Test/maintenance helper: clear all buckets. */
export function __resetRateLimit(): void {
  buckets.clear();
}
