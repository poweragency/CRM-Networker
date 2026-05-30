import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env';

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
  '/centos',
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

  return response;
}

export const config = {
  // Run on everything except static assets and image optimization.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
