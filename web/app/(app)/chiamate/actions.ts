'use server';

import { createCall, type CallInput } from '@/lib/data/calls';
import type { Call } from '@/lib/types/db';

/**
 * Server Actions backing the /chiamate log. A single `createCallAction`
 * delegates to the server-only data layer (`lib/data/calls.ts`), which is
 * demo-safe: when Supabase env is missing OR the insert throws it returns a
 * SIMULATED optimistic result with `demo: true` and never crashes (RESILIENCE).
 * The action returns a small serializable envelope the client uses to prepend
 * the new row to local state + surface the right toast (real vs "modalità demo").
 */

export interface CallActionResult {
  /** The created row (optimistic in demo mode). */
  call: Call | null;
  /** true when served from mock / simulated (env missing or query failed). */
  demo: boolean;
  /** false only when a configured Supabase write actually failed. */
  ok: boolean;
}

/** Log a call. */
export async function createCallAction(
  input: CallInput,
): Promise<CallActionResult> {
  const { data, demo, ok } = await createCall(input);
  return { call: data, demo, ok };
}
