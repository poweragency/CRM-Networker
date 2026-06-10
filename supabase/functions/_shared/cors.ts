// Shared CORS handling for the CRM Networker Edge Functions (Deno).
// The frontend (Next.js on a Vercel/preview origin) invokes these via supabase-js
// `functions.invoke`, which sends a preflight OPTIONS.
//
// SECURITY (audit FINDING #8): instead of `Access-Control-Allow-Origin: *`, we
// reflect an ALLOWLISTED request Origin — the configured SITE_URL origin, Vercel
// preview deploys (*.vercel.app) and localhost dev — falling back to the prod site
// origin for anything else. These endpoints are token/bearer-gated and use no
// ambient cookies, so the old wildcard was low-risk; this removes it and keeps
// preflight + response origins consistent (required by the browser).

const STATIC_ALLOWED = new Set<string>([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const FALLBACK_ORIGIN = 'https://crm-networker.vercel.app';

function siteOrigin(): string | null {
  const raw = Deno.env.get('SITE_URL');
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Resolve the Access-Control-Allow-Origin to echo for this request. */
function resolveOrigin(req: Request): string {
  const origin = req.headers.get('Origin');
  if (origin) {
    if (STATIC_ALLOWED.has(origin) || origin === siteOrigin()) return origin;
    try {
      const host = new URL(origin).hostname;
      if (origin.startsWith('https://') && host.endsWith('.vercel.app')) return origin;
    } catch {
      /* malformed Origin → fall through to the safe default */
    }
  }
  return siteOrigin() ?? FALLBACK_ORIGIN;
}

/** Non-origin CORS headers; the per-request Allow-Origin is added by withCors(). */
export const corsBaseHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

/**
 * Wrap a Deno.serve handler: answer the preflight OPTIONS and stamp the resolved,
 * allowlisted Access-Control-Allow-Origin on EVERY response, so the preflight and
 * the actual response always advertise the same origin (a browser requirement).
 */
export function withCors(
  handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const allowOrigin = resolveOrigin(req);
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...corsBaseHeaders, 'Access-Control-Allow-Origin': allowOrigin },
      });
    }
    const res = await handler(req);
    res.headers.set('Access-Control-Allow-Origin', allowOrigin);
    for (const [k, v] of Object.entries(corsBaseHeaders)) {
      if (!res.headers.has(k)) res.headers.set(k, v);
    }
    return res;
  };
}
