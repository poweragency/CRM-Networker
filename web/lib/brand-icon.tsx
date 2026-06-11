/**
 * The Gen X mark as a full-bleed element for `next/og` ImageResponse:
 * a white "power" bolt on the indigo brand gradient. Full-bleed (no rounded
 * corners) so it's safe as a maskable PWA icon. Shared by the manifest icon routes.
 */
export function brandIcon(size: number) {
  const bolt = Math.round(size * 0.46);
  return (
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
      <svg width={bolt} height={bolt} viewBox="0 0 24 24">
        <path fill="#ffffff" d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    </div>
  );
}
