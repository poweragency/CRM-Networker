'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * /auth/confirm — verifies an email one-time link (recovery / signup / email change)
 * **in the browser, via JavaScript**, then forwards to `next` (e.g. /reimposta-password).
 *
 * Why client-side: the link's token is single-use, and email scanners (Gmail, Outlook
 * safe-links, antivirus) PREFETCH links with a plain HTTP GET — which would consume
 * the token before the user clicks (→ "link non valido"). Those scanners don't run
 * JavaScript, so verifying inside an effect means only a real browser consumes the
 * token. verifyOtp({token_hash}) also needs no PKCE code_verifier, so it works even
 * when the email is opened on a different device/browser than where it was requested.
 */
function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard against an accidental double-run (token is single-use)
    ran.current = true;

    const tokenHash = params.get('token_hash');
    const type = params.get('type') as EmailOtpType | null;
    const rawNext = params.get('next') ?? '/reimposta-password';
    const next =
      rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/reimposta-password';

    const supabase = createClient();
    if (!supabase || !tokenHash || !type) {
      router.replace('/reimposta-password'); // missing params → page shows "request a new link"
      return;
    }

    supabase.auth.verifyOtp({ type, token_hash: tokenHash }).then(({ error }) => {
      // On success the session (recovery) is set; /reimposta-password lets the user set
      // the new password. On failure that page shows the "link non valido" + retry.
      router.replace(error ? '/reimposta-password' : next);
    });
  }, [params, router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">Verifica del link in corso…</p>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        </div>
      }
    >
      <ConfirmInner />
    </Suspense>
  );
}
