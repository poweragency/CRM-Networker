import { WHY_KEYS, type SevenWhys } from '@/lib/types/db';

/**
 * Client-safe Sette Perché helpers + the roster row shape. Kept OUT of the
 * `server-only` data module (`lib/data/seven-whys.ts`) so client components (the
 * manager / editor) can import the pure helper + type without pulling the
 * server-only data layer into the browser bundle.
 */

/** Count how many of the seven `why_*` slots are non-empty (0..7). */
export function filledCount(record: SevenWhys | null | undefined): number {
  if (!record) return 0;
  return WHY_KEYS.reduce(
    (acc, key) => acc + ((record[key] ?? '').trim() ? 1 : 0),
    0,
  );
}

/** A roster row: a marketer (subject) + their Sette Perché record (or null). */
export interface SevenWhysRosterRow {
  marketer_id: string;
  /** The person whose "why" this is. */
  person_name: string;
  /** True for the caller's own record (the only one that is editable). */
  is_self: boolean;
  /** The record, if one exists for this marketer yet. */
  record: SevenWhys | null;
  /** Derived 0..7 completion. */
  filled: number;
}
