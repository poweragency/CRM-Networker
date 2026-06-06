import { ImageResponse } from 'next/og';

/**
 * Browser-tab favicon (generated). A white "power" bolt on the indigo brand
 * gradient — the PowerNetwork mark. Served at /icon and wired into <head> by Next.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';
// Render on demand (next/og can't prerender statically in the offline build).
export const dynamic = 'force-dynamic';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          borderRadius: 7,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#ffffff" d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
