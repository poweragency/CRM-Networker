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
};

export default withNextIntl(nextConfig);
