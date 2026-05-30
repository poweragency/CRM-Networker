import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * ADR-004: OAuth (Google / Microsoft) is present in the UI but not enforced in
 * v1 — rendered visible-but-disabled with a "(presto)" affordance. Extracted so
 * the same disabled SSO block can be reused on the login surface.
 */
function GoogleGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function MicrosoftGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 23 23" aria-hidden>
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function OAuthButtons({ className }: { className?: string }) {
  const t = useTranslations('auth');

  const base =
    'flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-muted-foreground opacity-70';

  return (
    <div className={cn('space-y-2', className)}>
      <button type="button" disabled aria-disabled className={base}>
        <GoogleGlyph />
        {t('oauthGoogle')}
      </button>
      <button type="button" disabled aria-disabled className={base}>
        <MicrosoftGlyph />
        {t('oauthMicrosoft')}
      </button>
    </div>
  );
}
