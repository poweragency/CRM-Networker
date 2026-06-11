/**
 * The Gen X mark for `next/og` ImageResponse: a white "power" bolt on the indigo
 * brand gradient.
 *  • `glow`     → rounded logo with a baked-in radial glow + soft shadow on a
 *                 transparent canvas (used for the manifest "any" icon, so the
 *                 PWA launch splash shows a rounded GLOWING logo).
 *  • otherwise  → full-bleed gradient (maskable home-screen icon; the launcher
 *                 applies its own mask).
 */
export function brandIcon(size: number, opts: { glow?: boolean } = {}) {
  const pad = opts.glow ? Math.round(size * 0.2) : 0;
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
        background: opts.glow
          ? 'radial-gradient(circle, rgba(99,102,241,0.6) 0%, rgba(99,102,241,0.22) 38%, rgba(99,102,241,0) 68%)'
          : 'transparent',
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
          borderRadius: opts.glow ? Math.round(inner * 0.26) : 0,
          boxShadow: opts.glow
            ? `0 0 ${Math.round(size * 0.13)}px ${Math.round(size * 0.035)}px rgba(99,102,241,0.75)`
            : 'none',
        }}
      >
        <svg width={bolt} height={bolt} viewBox="0 0 24 24">
          <path fill="#ffffff" d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>
    </div>
  );
}
