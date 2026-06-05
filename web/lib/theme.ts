/**
 * Org theme helpers. The admin picks just TWO colors — page background and the
 * navbar/buttons accent — and everything else (text, cards, borders) is derived
 * so contrast is always guaranteed (WCAG luminance → black or white text).
 *
 * Pure module (no server-only): used by the server layout to inject CSS vars and
 * by the client settings UI for the live preview.
 */

export interface OrgTheme {
  /** Page background, hex (#rrggbb). */
  background: string;
  /** Navbar + buttons + accent, hex (#rrggbb). */
  navbar: string;
}

/** Parse #rgb / #rrggbb → [r,g,b] (0..255), or null if invalid. */
function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance (0..1) of a hex color. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** True when a color is "dark" → it needs light text on top. */
export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.45;
}

/** Best-contrast text color (hex) for a given background color. */
export function contrastText(hex: string): string {
  return isDark(hex) ? '#ffffff' : '#0b1220';
}

/** hex → "H S% L%" string (the HSL-triplet format the CSS tokens consume). */
export function hexToHslTriplet(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Hue (0..360) of a hex color; neutral-blue fallback. */
function hueOf(hex: string): number {
  const t = hexToHslTriplet(hex);
  if (!t) return 222;
  return Number(t.split(' ')[0]) || 222;
}

/** Deep navbar-surface triplet, tinted with the accent's hue (always elegant). */
export function navTriplet(accentHex: string): string {
  return `${hueOf(accentHex)} 22% 13%`;
}

/** Navbar surface as an hsl() color string (for the settings live preview). */
export function navPreviewColor(accentHex: string): string {
  return `hsl(${navTriplet(accentHex)})`;
}

// Coherent base token sets (mirror globals.css) chosen by the background's
// darkness, so cards/borders/text always read well over the chosen background.
const BASE = {
  dark: {
    foreground: '210 20% 96%',
    card: '222 22% 13%',
    muted: '222 16% 19%',
    mutedForeground: '217 12% 68%',
    border: '222 16% 22%',
  },
  light: {
    foreground: '222 22% 11%',
    card: '0 0% 100%',
    muted: '220 16% 96%',
    mutedForeground: '220 9% 46%',
    border: '220 14% 90%',
  },
} as const;

/** Auto foreground triplet (white/near-black) for readability on a color. */
function autoForegroundTriplet(hex: string): string {
  return isDark(hex) ? '0 0% 100%' : '222 47% 11%';
}

/** Nudge the L of an "H S% L%" triplet by delta (clamped 0..100). */
function shiftL(triplet: string, delta: number): string {
  const m = triplet.match(/^(\d+) (\d+)% (\d+)%$/);
  if (!m) return triplet;
  const l = Math.max(0, Math.min(100, Number(m[3]) + delta));
  return `${m[1]} ${m[2]}% ${l}%`;
}

/**
 * Build the inline CSS-variable overrides for an org theme — an object of
 * `--token: value` pairs to spread into a React `style` prop. Inline custom
 * properties win over the :root/.dark stylesheet, so this re-skins the whole app
 * regardless of the user's light/dark toggle. Returns null for an empty/invalid
 * theme (→ the app keeps its default look).
 */
export function themeCssVars(
  theme: OrgTheme | null,
): Record<string, string> | null {
  if (!theme) return null;
  const bg = hexToHslTriplet(theme.background);
  const nav = hexToHslTriplet(theme.navbar);
  if (!bg || !nav) return null;
  const base = isDark(theme.background) ? BASE.dark : BASE.light;
  const navFg = autoForegroundTriplet(theme.navbar);
  return {
    '--background': bg,
    '--foreground': base.foreground,
    '--card': base.card,
    '--card-foreground': base.foreground,
    '--muted': base.muted,
    '--muted-foreground': base.mutedForeground,
    '--border': base.border,
    '--input': base.border,
    '--primary': nav,
    '--primary-foreground': navFg,
    '--primary-600': shiftL(nav, -6),
    '--primary-700': shiftL(nav, -12),
    '--on-primary': navFg,
    '--ring': nav,
    // Navbar surface: a deep slate tinted with the accent hue (not the raw color).
    '--nav': navTriplet(theme.navbar),
    '--nav-foreground': '0 0% 98%',
  };
}
