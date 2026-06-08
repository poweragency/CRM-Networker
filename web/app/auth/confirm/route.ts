import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env';

/**
 * /auth/confirm — server-side verification of email one-time links (recovery,
 * signup, email change). It calls `verifyOtp` with the `token_hash` from the email,
 * which works **across devices/browsers** (no PKCE code_verifier needed) — fixing
 * the "link non valido o scaduto" that PKCE produced when the reset email was opened
 * somewhere other than where it was requested (or via Gmail's link prefetch).
 *
 * On success it sets the session cookies ON the redirect response and forwards to
 * `next` (e.g. /reimposta-password, where the user sets the new password). On any
 * failure it forwards to /reimposta-password, which shows "request a new link".
 *
 * Pair with the Supabase "Reset Password" email template:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reimposta-password
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next') ?? '/reimposta-password';
  // Only site-relative redirects (block open-redirect via //evil.com or absolute URLs).
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/reimposta-password';

  const failUrl = new URL('/reimposta-password', request.url);
  if (!isSupabaseConfigured || !tokenHash || !type) {
    return NextResponse.redirect(failUrl);
  }

  // Redirect response we can attach the freshly-issued auth cookies to.
  const response = NextResponse.redirect(new URL(next, request.url));
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(failUrl);
  }
  return response; // carries the session cookies + redirects to `next`
}
