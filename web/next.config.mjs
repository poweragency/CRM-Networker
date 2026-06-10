import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

// Point next-intl at the request config (single-locale `it` setup, no locale path segment).
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

// Content-Security-Policy — REPORT-ONLY for now (audit FINDING #4). It does NOT
// block anything; it only reports violations to the browser console so we can see
// what an enforcing CSP would break BEFORE switching the header name to
// `Content-Security-Policy`. Sources: self + Supabase (REST/Realtime/Storage) +
// Sentry ingest; inline styles/scripts are allowed (Next injects them).
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // `instrumentation.ts` runs by default in Next 15 (no flag needed).
    // Server Actions are stable in Next 14, kept explicit for clarity.
    // Same-origin is always allowed; these are ADDITIONAL permitted origins.
    // '*.vercel.app' covers Vercel preview + production deploys. Add your custom
    // domain here when you connect one.
    serverActions: {
      allowedOrigins: ['localhost:3000', '*.vercel.app'],
    },
  },
  // Baseline security headers (defense-in-depth for clickjacking / MIME-sniffing /
  // referrer leakage / transport) + a REPORT-ONLY CSP (FINDING #4) that observes
  // violations without blocking. Promote to `Content-Security-Policy` once clean.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
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
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
