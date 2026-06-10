'use client';

import * as React from 'react';
import * as Sentry from '@sentry/nextjs';
import { logError } from '@/lib/log';

/**
 * Global error boundary — catches errors thrown in the ROOT layout itself (which
 * the regular error.tsx cannot, since it renders inside the layout). Must provide
 * its own <html>/<body>. Kept dependency-free (no next-intl, which lives in the
 * layout that just failed). The error is logged, never discarded (audit M24).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    logError('global-error', error, { digest: error.digest });
    Sentry.captureException(error); // no-op until a DSN is configured
  }, [error]);

  return (
    <html lang="it">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily: 'system-ui, sans-serif',
          background: '#070710',
          color: '#e5e7eb',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Qualcosa è andato storto</h1>
        <p style={{ maxWidth: '28rem', fontSize: '0.875rem', color: '#9ca3af' }}>
          Si è verificato un errore imprevisto. Riprova; se il problema persiste,
          ricarica la pagina.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: '0.375rem',
            background: '#6d5efc',
            color: '#fff',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Riprova
        </button>
      </body>
    </html>
  );
}
