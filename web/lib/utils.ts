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

/**
 * Current calendar day as `YYYY-MM-DD` in a given IANA timezone (default the org's
 * Europe/Rome). Use this instead of `new Date().toISOString().slice(0,10)`, which
 * returns the UTC day and is off by one for ~1-2h every night for a UTC+ org
 * (e.g. the Presenze "today"/"OGGI" anchor and month boundaries). `en-CA` formats
 * as ISO `YYYY-MM-DD`.
 */
export function todayInTimeZone(timeZone = 'Europe/Rome'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
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

/** it-IT short date (e.g. "30 mag 2026"). Accepts an ISO string or Date. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** it-IT date + time (e.g. "30 mag 2026, 14:05"). */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Compact it-IT relative time (e.g. "2 giorni fa", "tra 3 ore"). */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  base: Date = new Date(),
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = d.getTime() - base.getTime();
  const rtf = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' });
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(Math.round(diffMs / 60_000), 'minute');
}

/** Human call duration from seconds (0 → "—", 95 → "1m 35s", 3600 → "1h 0m"). */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
