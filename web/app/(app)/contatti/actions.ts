'use server';

import {
  bulkDeleteContacts,
  bulkTagContacts,
  createContact,
  deleteContact,
  updateContact,
  type ContactInput,
} from '@/lib/data/contacts';
import type { Contact, ContactStatus } from '@/lib/types/db';

/**
 * Server Actions backing the /contatti manager (create / edit / delete + the
 * three bulk operations). They delegate to the server-only data layer
 * (`lib/data/contacts.ts`), which is demo-safe: when Supabase env is missing OR
 * a write throws it returns a SIMULATED optimistic result with `demo: true` and
 * never crashes (RESILIENCE). Each action returns a small serializable envelope
 * the client uses to update local state + surface the right toast (real vs
 * "modalità demo" simulated).
 */

export interface ContactActionResult {
  /** The created/updated row (null for deletes). */
  contact: Contact | null;
  /** true when served from mock / simulated (env missing or query failed). */
  demo: boolean;
  /** false only when a configured Supabase write actually failed. */
  ok: boolean;
}

export interface BulkActionResult {
  count: number;
  demo: boolean;
  ok: boolean;
}

/** Create a contact. */
export async function createContactAction(
  input: ContactInput,
): Promise<ContactActionResult> {
  const { data, demo, ok } = await createContact(input);
  return { contact: data, demo, ok };
}

/** Patch an existing contact. */
export async function updateContactAction(
  id: string,
  patch: Partial<ContactInput>,
): Promise<ContactActionResult> {
  const { data, demo, ok } = await updateContact(id, patch);
  return { contact: data, demo, ok };
}

/** Soft-delete a single contact. */
export async function deleteContactAction(
  id: string,
): Promise<ContactActionResult> {
  const { demo, ok } = await deleteContact(id);
  return { contact: null, demo, ok };
}

/** Bulk add tags to many contacts. */
export async function bulkTagContactsAction(
  ids: string[],
  tags: string[],
): Promise<BulkActionResult> {
  const { data, demo, ok } = await bulkTagContacts(ids, tags);
  return { count: data.count, demo, ok };
}

/** Bulk set the status of many contacts (per-row update; demo-safe). */
export async function bulkSetStatusAction(
  ids: string[],
  status: ContactStatus,
): Promise<BulkActionResult> {
  let demo = false;
  let ok = true;
  for (const id of ids) {
    const res = await updateContact(id, { status });
    demo = demo || res.demo;
    ok = ok && res.ok;
  }
  return { count: ids.length, demo, ok };
}

/** Bulk soft-delete many contacts. */
export async function bulkDeleteContactsAction(
  ids: string[],
): Promise<BulkActionResult> {
  const { data, demo, ok } = await bulkDeleteContacts(ids);
  return { count: data.count, demo, ok };
}
