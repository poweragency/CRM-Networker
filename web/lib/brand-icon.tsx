/**
 * The Gen X mark for `next/og` ImageResponse: a white "power" bolt on the indigo
 * brand gradient. `rounded` draws a rounded-square logo with transparent margin
 * (used for the manifest "any" icon + the PWA splash, so the launch screen shows
 * a clean rounded logo instead of a flat square); full-bleed is used for the
 * maskable home-screen icon (the launcher applies its own mask).
 */
export function brandIcon(size: number, rounded = false) {
  const pad = rounded ? Math.round(size * 0.14) : 0;
  const inner = size - pad * 2;
  const bolt = Math.round(inner * 0.5);
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: inner,
          height: inner,
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          borderRadius: rounded ? Math.round(inner * 0.26) : 0,
        }}
      >
        <svg width={bolt} height={bolt} viewBox="0 0 24 24">
          <path fill="#ffffff" d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>
    </div>
  );
}
