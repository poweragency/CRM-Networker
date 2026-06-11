import { ImageResponse } from 'next/og';

/** iOS/macOS home-screen icon (generated) — the Gen X bolt mark. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default function AppleIcon() {
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
        }}
      >
        <svg width="110" height="110" viewBox="0 0 24 24">
          <path fill="#ffffff" d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
