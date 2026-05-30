'use client';

import { useTranslations } from 'next-intl';

/**
 * Root error boundary. No data is leaked in the message (sitemap §6 security
 * note). Client component as required by Next.js error boundaries.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('error');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        {t('genericTitle')}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('genericBody')}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {t('retry')}
      </button>
    </main>
  );
}
