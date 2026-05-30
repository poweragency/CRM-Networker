import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class-name composer used by every `ui/` primitive and domain component.
 * `clsx` resolves conditional/array/object inputs; `tailwind-merge` then dedupes
 * conflicting Tailwind utilities so a caller's `className` override always wins
 * (e.g. `<Button className="bg-danger" />` beats the variant's `bg-primary`).
 *
 * Mirrors doc 08 §6.3 (component conventions: `cn()` = clsx + tailwind-merge).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** it-IT integer/decimal formatter for KPI counts (tabular-friendly). */
export function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('it-IT', opts).format(value);
}

/** Render a 0..1 ratio as an it-IT percentage (e.g. 0.1507 → "15,1%"). */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

/** Two-letter initials from a display name (avatar fallback). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
