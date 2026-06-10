// Sentry — NODE server runtime. Captures errors in Server Components, Server
// Actions and route handlers. No-op without a DSN.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
});
