/**
 * celebrate() — a dependency-free confetti burst for "achievement" moments
 * (closing/iscrizione, a Zoom call at 100%, a new recruit…). Spawns short-lived
 * DOM particles animated via the Web Animations API and cleans them up. Safe to
 * call from any client handler; no-ops on the server and under prefers-reduced-
 * motion. Keep bursts to genuine wins so they stay dopaminic, not noisy.
 */

const PALETTE = [
  '#6366f1', // indigo
  '#f59e0b', // amber/gold
  '#22c55e', // green
  '#ec4899', // pink
  '#3b82f6', // blue
  '#a855f7', // violet
  '#ef4444', // red
  '#14b8a6', // teal
];

export interface CelebrateOptions {
  /** Particle count (default 110). */
  count?: number;
  /** Burst origin in viewport px (default: horizontal center, upper third). */
  origin?: { x: number; y: number };
}

export function celebrate(opts: CelebrateOptions = {}): void {
  if (typeof document === 'undefined') return;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  const count = opts.count ?? 110;
  const ox = opts.origin?.x ?? window.innerWidth / 2;
  const oy = opts.origin?.y ?? window.innerHeight / 3;

  const layer = document.createElement('div');
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';
  document.body.appendChild(layer);

  let maxDuration = 0;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const size = 6 + Math.random() * 8;
    const color = PALETTE[i % PALETTE.length];
    const round = Math.random() < 0.35;
    p.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;width:${size}px;height:${
      round ? size : size * 0.55
    }px;background:${color};border-radius:${round ? '50%' : '2px'};will-change:transform,opacity`;
    layer.appendChild(p);

    // Launch up-and-out, then fall under gravity.
    const dir = Math.random() < 0.5 ? -1 : 1;
    const speed = 100 + Math.random() * 280;
    const dx = dir * speed * (0.4 + Math.random() * 0.8);
    const up = -(160 + Math.random() * 220);
    const drop = 360 + Math.random() * 420;
    const rot = Math.random() * 720 - 360;
    const duration = 1100 + Math.random() * 1100;
    maxDuration = Math.max(maxDuration, duration);

    p.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${dx * 0.6}px, ${up}px) rotate(${rot / 2}deg)`,
          opacity: 1,
          offset: 0.35,
        },
        {
          transform: `translate(${dx}px, ${up + drop}px) rotate(${rot}deg)`,
          opacity: 0,
        },
      ],
      { duration, easing: 'cubic-bezier(0.2,0.6,0.3,1)', fill: 'forwards' },
    );
  }

  window.setTimeout(() => layer.remove(), maxDuration + 200);
}

/** Burst centered on a DOM element (e.g. a button that was just pressed). */
export function celebrateFrom(el: Element | null, opts: CelebrateOptions = {}): void {
  if (!el) return celebrate(opts);
  const r = el.getBoundingClientRect();
  celebrate({ ...opts, origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
}
