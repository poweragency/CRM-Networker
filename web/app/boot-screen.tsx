'use client';

import * as React from 'react';

/**
 * BootScreen — a dark, branded launch overlay shown on the initial page load
 * (PWA launch / full refresh) so the user sees a glowing PowerNetwork mark on a
 * dark background instead of a blank white screen while the app boots. It fades
 * out shortly after hydration (when the app is interactive) and removes itself;
 * it does NOT reappear on in-app (client-side) navigation.
 */
export function BootScreen() {
  const [fading, setFading] = React.useState(false);
  const [gone, setGone] = React.useState(false);

  React.useEffect(() => {
    const fade = setTimeout(() => setFading(true), 450);
    const remove = setTimeout(() => setGone(true), 1050);
    return () => {
      clearTimeout(fade);
      clearTimeout(remove);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#0b0d16] transition-opacity duration-500 ${
        fading ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute h-72 w-72 rounded-full bg-[#6366f1]/25 blur-3xl" />
      <div className="relative flex flex-col items-center gap-5">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-[26px] bg-gradient-to-br from-[#6366f1] to-[#4f46e5] shadow-[0_0_70px_rgba(99,102,241,0.65)] animate-pulse">
          <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden>
            <path fill="#ffffff" d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <p className="text-sm font-semibold tracking-[0.2em] text-white/70">POWERNETWORK</p>
      </div>
    </div>
  );
}
