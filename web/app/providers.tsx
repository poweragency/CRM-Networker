'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

/**
 * Client providers wrapper. Holds the react-query client (one per browser
 * session) and the `next-themes` provider (class strategy → toggles `.dark` on
 * <html>; default `system`). The NextIntlClientProvider is mounted in the root
 * layout (server) so it can read messages from getMessages() — only the cache
 * and theme providers need to be client components here. (doc 08 §6.2/§14.)
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
