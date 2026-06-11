import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — makes the CRM installable as a standalone app (Android/Chrome
 * install prompt; iOS via Safari → Aggiungi a Home). A DARK `background_color`
 * gives a dark branded splash on launch instead of a white screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gen X',
    short_name: 'Gen X',
    description: 'CRM + Business Intelligence per il network marketing.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0d16',
    theme_color: '#0b0d16',
    icons: [
      { src: '/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
