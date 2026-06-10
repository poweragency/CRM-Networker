/**
 * Client-safe company-cycle math (28-day cycles). Mirrors the SQL helpers in
 * migration 0079: cycles are anchored to the global company reference
 * (ciclo 78 ends 2026-06-20 07:00 Europe/Rome) unless an org passes an override.
 * Used by the client widgets (performance modal) that bucket by cycle.
 */

export const CYCLE_LEN_DAYS = 28;
const DAY_MS = 86_400_000;
const LEN_MS = CYCLE_LEN_DAYS * DAY_MS;

const DEFAULT_ANCHOR_END_ISO = '2026-06-20T07:00:00+02:00';
const DEFAULT_ANCHOR_NUMBER = 78;

export interface CycleAnchor {
  /** End of `number`'s cycle, in epoch ms. */
  endMs: number;
  number: number;
}

export function defaultCycleAnchor(): CycleAnchor {
  return { endMs: new Date(DEFAULT_ANCHOR_END_ISO).getTime(), number: DEFAULT_ANCHOR_NUMBER };
}

/** Build an anchor from an org override (end ISO + number), else the default. */
export function cycleAnchor(endIso?: string | null, number?: number | null): CycleAnchor {
  if (endIso && number != null) {
    const ms = new Date(endIso).getTime();
    if (!Number.isNaN(ms)) return { endMs: ms, number };
  }
  return defaultCycleAnchor();
}

/** The cycle number containing the instant `atMs`. */
export function cycleNumberAt(atMs: number, a: CycleAnchor = defaultCycleAnchor()): number {
  let end = a.endMs;
  let k = 0;
  while (end <= atMs) {
    end += LEN_MS;
    k += 1;
  }
  while (end - LEN_MS > atMs) {
    end -= LEN_MS;
    k -= 1;
  }
  return a.number + k;
}

/** [start, end) in epoch ms for a given cycle number. */
export function cycleBounds(
  n: number,
  a: CycleAnchor = defaultCycleAnchor(),
): { start: number; end: number } {
  const end = a.endMs + LEN_MS * (n - a.number);
  return { start: end - LEN_MS, end };
}
