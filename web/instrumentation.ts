// Next.js instrumentation hook — loads the right Sentry init for each runtime, and
// forwards server/RSC request errors to Sentry. Enabled via
// `experimental.instrumentationHook` in next.config (stable in Next 15).
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors thrown while rendering Server Components / handling requests.
export const onRequestError = Sentry.captureRequestError;
