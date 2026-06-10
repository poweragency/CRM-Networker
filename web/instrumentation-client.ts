// Sentry — BROWSER runtime. Captures client-side errors (React render, event
// handlers, unhandled rejections). DSN comes from env; with no DSN this is a
// complete no-op, so local/dev builds and a not-yet-configured deploy are
// unaffected. Loaded automatically by Next.js via this `instrumentation-client.ts`
// file convention (@sentry/nextjs v9+; replaces the old `sentry.client.config.ts`,
// required for Turbopack).
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Sample 10% of transactions for performance tracing (errors are always sent).
  tracesSampleRate: 0.1,
  // Keep the browser bundle lean — no Session Replay for now (can be enabled later).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

// Instrument client-side navigations (App Router) for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
