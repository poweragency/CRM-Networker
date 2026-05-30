import createNextIntlPlugin from 'next-intl/plugin';

// Point next-intl at the request config (single-locale `it` setup, no locale path segment).
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are stable in Next 14, kept explicit for clarity.
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
};

export default withNextIntl(nextConfig);
