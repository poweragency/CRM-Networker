import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

// Point next-intl at the request config (single-locale `it` setup, no locale path segment).
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Required (Next 14) so `instrumentation.ts` runs — that's where Sentry boots
    // on the server/edge. Default in Next 15.
    instrumentationHook: true,
    // Server Actions are stable in Next 14, kept explicit for clarity.
    // Same-origin is always allowed; these are ADDITIONAL permitted origins.
    // '*.vercel.app' covers Vercel preview + production deploys. Add your custom
    // domain here when you connect one.
    serverActions: {
      allowedOrigins: ['localhost:3000', '*.vercel.app'],
    },
  },
  // Baseline security headers (defense-in-depth for clickjacking / MIME-sniffing /
  // referrer leakage / transport). A CSP is intentionally omitted here to avoid
  // breaking inline styles/scripts without testing — add a report-only CSP next.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry LAST. Source-map upload runs only when a SENTRY_AUTH_TOKEN is
// present (CI/Vercel), so local builds never fail for lack of it; everything else
// is a no-op until NEXT_PUBLIC_SENTRY_DSN is set.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
