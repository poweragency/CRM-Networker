'use server';

import {
  createCentos,
  deleteCentos,
  promoteCentos,
  updateCentos,
  type CentosInput,
} from '@/lib/data/centos';
import type { CentosEntry } from '@/lib/types/db';

/**
 * Server Actions backing the /centos manager (create / edit / status toggle /
 * delete / promote-to-contact). They delegate to the server-only data layer
 * (`lib/data/centos.ts`), which is demo-safe: when Supabase env is missing OR a
 * write throws it returns a SIMULATED optimistic result with `demo: true` and
 * never crashes (RESILIENCE). Each action returns a small serializable envelope
 * the client uses to patch local state + raise the right toast (real vs
 * "modalità demo" simulated).
 */

export interface CentosActionResult {
  /** The created/updated row (null for deletes). */
  entry: CentosEntry | null;
  /** true when served from mock / simulated (env missing or query failed). */
  demo: boolean;
  /** false only when a configured Supabase write actually failed. */
  ok: boolean;
}

export interface PromoteActionResult {
  entryId: string;
  contactId: string;
  demo: boolean;
  ok: boolean;
}

/** Create a Centos entry (auto-appends at the next position). */
export async function createCentosAction(
  input: CentosInput,
): Promise<CentosActionResult> {
  const { data, demo, ok } = await createCentos(input);
  return { entry: data, demo, ok };
}

/** Patch an existing Centos entry (rename, re-rate, toggle contacted, …). */
export async function updateCentosAction(
  id: string,
  patch: Partial<CentosInput>,
): Promise<CentosActionResult> {
  const { data, demo, ok } = await updateCentos(id, patch);
  return { entry: data ?? null, demo, ok };
}

/** Soft-delete a single Centos entry. */
export async function deleteCentosAction(
  id: string,
): Promise<CentosActionResult> {
  const { demo, ok } = await deleteCentos(id);
  return { entry: null, demo, ok };
}

/** Promote a Centos entry into a CRM contact (stamps promoted_contact_id). */
export async function promoteCentosAction(
  id: string,
): Promise<PromoteActionResult> {
  const { data, demo, ok } = await promoteCentos(id);
  return { entryId: data.entry_id, contactId: data.contact_id, demo, ok };
}
