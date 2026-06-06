/**
 * celebrate() — a dependency-free confetti burst for "achievement" moments
 * (closing/iscrizione, a Zoom call at 100%, a new recruit…). Spawns short-lived
 * DOM particles animated via the Web Animations API and cleans them up. Safe to
 * call from any client handler; no-ops on the server and under prefers-reduced-
 * motion. Keep bursts to genuine wins so they stay dopaminic, not noisy.
 *
 * The palette leans on the product's signature accents — indigo-violet with a
 * gold-prestige bias — so a celebration feels on-brand rather than generic.
 * (Raw hex is unavoidable here: these are dynamically-spawned DOM particles, not
 * Tailwind-classed elements, so the design-system tokens can't be applied.)
 */

const PALETTE = [
  '#6366f1', // indigo (brand)
  '#818cf8', // indigo light
  '#a855f7', // violet (brand)
  '#c084fc', // violet light
  '#f59e0b', // gold (prestige)
  '#fbbf24', // gold light
  '#fcd34d', // champagne
  '#22c55e', // green (success)
  '#ec4899', // pink
  '#38bdf8', // sky
];

type ParticleShape = 'rect' | 'circle' | 'streamer';

export interface CelebrateOptions {
  /** Particle count (default 130). */
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

  const count = opts.count ?? 130;
  const ox = opts.origin?.x ?? window.innerWidth / 2;
  const oy = opts.origin?.y ?? window.innerHeight / 3;

  const layer = document.createElement('div');
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';
  document.body.appendChild(layer);

  let maxDuration = 0;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const color = PALETTE[i % PALETTE.length];

    // Mix of shapes: chunky rectangles, round dots, and a few long streamers.
    const roll = Math.random();
    const shape: ParticleShape =
      roll < 0.3 ? 'circle' : roll < 0.86 ? 'rect' : 'streamer';
    const size = 6 + Math.random() * 9;
    const w = shape === 'streamer' ? 2.5 + Math.random() * 2 : size;
    const h =
      shape === 'streamer'
        ? 12 + Math.random() * 12
        : shape === 'circle'
          ? size
          : size * (0.42 + Math.random() * 0.3);
    const radius = shape === 'circle' ? '50%' : '1.5px';

    p.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;width:${w}px;height:${h}px;background:${color};border-radius:${radius};opacity:0;will-change:transform,opacity;box-shadow:0 0 6px ${color}40`;
    layer.appendChild(p);

    // Two-sided cannon: spread biased outward + up, then gravity drops it down.
    const dir = i % 2 === 0 ? -1 : 1;
    const spread = (0.25 + Math.random() * 0.85) * dir;
    const speed = 120 + Math.random() * 320;
    const dx = spread * speed;
    const up = -(180 + Math.random() * 260);
    const drop = 420 + Math.random() * 520;
    // Drift/flutter on the way down for a paper-confetti feel.
    const sway = (Math.random() * 60 + 20) * (Math.random() < 0.5 ? -1 : 1);
    const spin = Math.random() * 3 - 1.5; // turns
    const rot = spin * 720;
    const tilt = Math.random() * 60 - 30;
    const duration = 1300 + Math.random() * 1400;
    const delay = Math.random() * 120;
    maxDuration = Math.max(maxDuration, duration + delay);

    p.animate(
      [
        {
          transform: 'translate3d(0,0,0) rotate(0deg) scale(0.6)',
          opacity: 1,
          offset: 0,
        },
        {
          transform: `translate3d(${dx * 0.55}px, ${up}px, 0) rotate(${rot * 0.4}deg) scale(1)`,
          opacity: 1,
          offset: 0.32,
        },
        {
          transform: `translate3d(${dx + sway}px, ${up + drop * 0.55}px, 0) rotate(${rot * 0.7}deg) scale(1)`,
          opacity: 1,
          offset: 0.7,
        },
        {
          transform: `translate3d(${dx - sway}px, ${up + drop}px, 0) rotate(${rot}deg) rotateX(${tilt}deg) scale(0.95)`,
          opacity: 0,
          offset: 1,
        },
      ],
      {
        duration,
        delay,
        easing: 'cubic-bezier(0.18, 0.7, 0.32, 1)',
        fill: 'forwards',
      },
    );
  }

  window.setTimeout(() => layer.remove(), maxDuration + 250);
}

/** Burst centered on a DOM element (e.g. a button that was just pressed). */
export function celebrateFrom(el: Element | null, opts: CelebrateOptions = {}): void {
  if (!el) return celebrate(opts);
  const r = el.getBoundingClientRect();
  celebrate({ ...opts, origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
}
