import createNextIntlPlugin from 'next-intl/plugin';

// Point next-intl at the request config (single-locale `it` setup, no locale path segment).
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
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

export default withNextIntl(nextConfig);
