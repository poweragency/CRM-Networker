import { ImageResponse } from 'next/og';

/**
 * Open Graph share image (generated, 1200×630) — used as the link preview on
 * social / chat. The PowerNetwork mark + wordmark on a dark indigo-lit canvas.
 */
export const alt = 'PowerNetwork — CRM & Business Intelligence per il network marketing';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// Render on demand (next/og can't prerender statically in the offline build).
export const dynamic = 'force-dynamic';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#0b0b14',
          backgroundImage:
            'radial-gradient(1100px 520px at 50% -12%, rgba(99,102,241,0.40), transparent)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 128,
              height: 128,
              borderRadius: 30,
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              boxShadow: '0 24px 70px rgba(79,70,229,0.55)',
            }}
          >
            <svg width="74" height="74" viewBox="0 0 24 24">
              <path fill="#ffffff" d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 104, fontWeight: 700, letterSpacing: -3 }}>
            PowerNetwork
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 30, fontSize: 34, color: '#9aa0b4' }}>
          CRM &amp; Business Intelligence per il network marketing
        </div>
      </div>
    ),
    { ...size },
  );
}
