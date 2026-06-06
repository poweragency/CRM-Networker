import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env';
import { RANK_ORDER, type MarketerRank } from '@/lib/types/db';

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Edge middleware:
 *  1. Refreshes the Supabase session (rotates the auth cookie) on every request.
 *  2. Early-redirects unauthenticated requests to protected route groups
 *     ((app)/(admin)/(platform)) to /accedi (ADR-008 route map).
 *
 * RLS remains the real security boundary; this is defence-in-depth / UX.
 * When env is missing the middleware is a no-op so the app still boots and
 * renders its configuration notice.
 */

// Path prefixes that require an authenticated session. Italian slugs per ADR-008.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/genealogia',
  '/contatti',
  '/percorso-prospect',
  '/chiamate',
  '/lista-contatti',
  '/sette-perche',
  '/documenti',
  '/analytics',
  '/classifiche',
  '/report',
  '/notifiche',
  '/impostazioni',
  '/admin',
  '/platform',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Sections a LIMITED member (cliente/no_rank/executive on a plain `member` role)
// cannot open — they only get Profilo (/impostazioni) + Informativa.
const LIMITED_BLOCKED = [
  '/dashboard',
  '/genealogia',
  '/statistiche',
  '/presenze',
  '/percorso-prospect',
  '/team',
  '/org',
  '/contatti',
  '/chiamate',
  '/lista-contatti',
  '/sette-perche',
  '/documenti',
  '/analytics',
  '/classifiche',
  '/report',
  '/notifiche',
  '/admin',
  '/platform',
];

/** Decode the (untrusted) JWT payload to read the stamped app_role + rank claims. */
function decodeJwtClaims(token: string): { app_role?: string; rank?: string } | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Limited = plain member role AND rank below consultant (cliente/no_rank/executive). */
function isLimited(claims: { app_role?: string; rank?: string } | null): boolean {
  if (!claims) return false;
  const role = claims.app_role ?? 'member';
  if (role === 'admin' || role === 'owner' || role === 'co_admin' || role === 'manager') {
    return false;
  }
  const idx = RANK_ORDER.indexOf((claims.rank ?? '') as MarketerRank);
  if (idx === -1) return false; // unknown rank → fail open (don't lock out)
  return idx < RANK_ORDER.indexOf('consultant');
}

export async function middleware(request: NextRequest) {
  // No env → do not touch auth; let the app render its config notice.
  if (!isSupabaseConfigured) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() refreshes the session and must run before any redirect.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/accedi';
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Limited members (cliente/no_rank/executive) only get Profilo + Informativa;
  // any attempt to open a restricted section bounces them to their profile.
  if (user) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token && isLimited(decodeJwtClaims(session.access_token))) {
      const blocked = LIMITED_BLOCKED.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (blocked) {
        const url = request.nextUrl.clone();
        url.pathname = '/impostazioni';
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image optimization.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
