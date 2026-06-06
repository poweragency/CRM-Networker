'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/crm/toaster';

/**
 * Client providers wrapper. Holds the `next-themes` provider (class strategy →
 * toggles `.dark` on <html>; default `system`) and the toast host. The
 * NextIntlClientProvider is mounted in the root layout (server) so it can read
 * messages from getMessages(). (doc 08 §6.2/§14.)
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Toaster>{children}</Toaster>
    </ThemeProvider>
  );
}
