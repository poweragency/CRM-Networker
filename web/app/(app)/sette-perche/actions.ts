'use server';

import {
  deleteSevenWhys,
  upsertSevenWhys,
  type SevenWhysInput,
} from '@/lib/data/seven-whys';
import type { SevenWhys } from '@/lib/types/db';

/**
 * Server Actions backing /sette-perche. They delegate to the server-only data
 * layer (`lib/data/seven-whys.ts`), which is demo-safe: when Supabase env is
 * missing OR a write throws it returns a SIMULATED optimistic result with
 * `demo: true` and never crashes (RESILIENCE). Writes are scoped write-own — the
 * action never passes a `marketerId`, so the data layer always targets the
 * caller's own record (uplines can read a downline's record but not mutate it).
 */

export interface SevenWhysActionResult {
  /** The upserted record (null for deletes). */
  record: SevenWhys | null;
  /** true when served from mock / simulated (env missing or query failed). */
  demo: boolean;
  /** false only when a configured Supabase write actually failed. */
  ok: boolean;
}

/** Upsert the caller's own Sette Perché record. */
export async function saveSevenWhysAction(
  input: SevenWhysInput,
): Promise<SevenWhysActionResult> {
  const { data, demo, ok } = await upsertSevenWhys(input);
  return { record: data, demo, ok };
}

/** Reset (delete) the caller's own Sette Perché record. */
export async function deleteSevenWhysAction(): Promise<SevenWhysActionResult> {
  const { demo, ok } = await deleteSevenWhys();
  return { record: null, demo, ok };
}
