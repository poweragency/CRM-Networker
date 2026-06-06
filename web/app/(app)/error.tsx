'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { logError } from '@/lib/log';

/**
 * Error boundary scoped to the authenticated (app) route group (audit M40). A
 * failing page renders this INSIDE the shell (sidebar/topbar stay) instead of
 * blowing away the whole app via the root boundary. The error is logged with its
 * digest, never discarded.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');

  React.useEffect(() => {
    logError('app-error-boundary', error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {t('genericTitle')}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('genericBody')}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t('retry')}
      </button>
    </div>
  );
}
