import 'server-only';
import { getCurrentClaims } from '@/lib/data/session';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Server-side rate guard for Server Actions. Keys the in-memory limiter by the
 * caller's marketer id + action name. Fail-open: if claims can't be read it allows
 * the call (RLS is still the boundary). Use to throttle abusable write/create
 * actions; thresholds are generous so normal usage never trips.
 */
export async function allowAction(
  action: string,
  limit = 60,
  windowMs = 60_000,
): Promise<boolean> {
  try {
    const { claims } = await getCurrentClaims();
    const key = `${claims.marketer_id || 'anon'}:${action}`;
    return rateLimit(key, limit, windowMs).ok;
  } catch {
    return true;
  }
}
