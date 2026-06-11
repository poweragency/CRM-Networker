import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { defaultLocale } from '@/lib/i18n/config';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://crm-networker.vercel.app'),
  // Fixed browser-tab title: the `template` has NO `%s`, so every page (whatever
  // its own metadata title) renders as exactly "Gen X" — the tab never
  // changes when navigating.
  title: {
    default: 'Gen X',
    template: 'Gen X',
  },
  applicationName: 'Gen X',
  description: 'CRM + Business Intelligence per il network marketing.',
  openGraph: {
    title: 'Gen X',
    description: 'CRM + Business Intelligence per il network marketing.',
    siteName: 'Gen X',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gen X',
    description: 'CRM + Business Intelligence per il network marketing.',
  },
  // Installed (iOS) app: standalone, dark status bar, branded title on Home.
  appleWebApp: {
    capable: true,
    title: 'Gen X',
    statusBarStyle: 'black',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0d16',
};

/**
 * Root layout. ADR-008: no `[locale]` path segment — locale is fixed to `it` in
 * v1. Provides i18n messages and the react-query client to the whole tree.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    <html lang={defaultLocale} suppressHydrationWarning style={{ backgroundColor: '#0b0d16' }}>
      <body className={`${inter.variable} font-sans antialiased`}>
        <NextIntlClientProvider locale={defaultLocale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
