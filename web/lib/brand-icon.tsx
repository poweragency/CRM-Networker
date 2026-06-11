/**
 * The Gen X mark for `next/og` ImageResponse: a white "power" bolt on the indigo
 * brand gradient.
 *  • `glow`    → rounded logo + radial glow + soft shadow on a TRANSPARENT canvas.
 *  • `solidBg` → rounded logo + glow on a full-bleed DARK canvas (#0b0d16). Used for
 *                the MASKABLE icon: it fills the canvas (safe to mask for the home
 *                icon) and, on the dark PWA splash, its dark edges blend so only the
 *                rounded glowing logo shows. Some launchers (e.g. MIUI) use the
 *                maskable icon for the launch splash, so this is what makes the
 *                splash a rounded glowing logo instead of a flat square.
 *  • neither   → plain full-bleed gradient.
 */
export function brandIcon(size: number, opts: { glow?: boolean; solidBg?: boolean } = {}) {
  const fancy = Boolean(opts.glow || opts.solidBg);
  const pad = fancy ? Math.round(size * 0.2) : 0;
  const inner = size - pad * 2;
  const bolt = Math.round(inner * 0.5);

  let bg = 'transparent';
  if (opts.solidBg) bg = '#0b0d16';
  else if (opts.glow)
    bg = 'radial-gradient(circle, rgba(99,102,241,0.6) 0%, rgba(99,102,241,0.22) 38%, rgba(99,102,241,0) 68%)';

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
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
          borderRadius: fancy ? Math.round(inner * 0.26) : 0,
          boxShadow: fancy
            ? `0 0 ${Math.round(size * 0.13)}px ${Math.round(size * 0.04)}px rgba(99,102,241,0.8)`
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
