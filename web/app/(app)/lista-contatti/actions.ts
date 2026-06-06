'use server';

import {
  createListaContatti,
  deleteListaContatti,
  promoteListaContatti,
  updateListaContatti,
  type ListaContattiInput,
} from '@/lib/data/lista-contatti';
import type { ListaContattiEntry } from '@/lib/types/db';
import { isValid, listaCreateSchema, listaPatchSchema } from '@/lib/validation';
import { allowAction } from '@/lib/data/rate-guard';

/**
 * Server Actions backing the /lista-contatti manager (create / edit / status toggle /
 * delete / promote-to-contact). They delegate to the server-only data layer
 * (`lib/data/lista-contatti.ts`), which is demo-safe: when Supabase env is missing OR a
 * write throws it returns a SIMULATED optimistic result with `demo: true` and
 * never crashes (RESILIENCE). Each action returns a small serializable envelope
 * the client uses to patch local state + raise the right toast (real vs
 * "modalità demo" simulated).
 */

export interface ListaContattiActionResult {
  /** The created/updated row (null for deletes). */
  entry: ListaContattiEntry | null;
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

/** Create a Lista contatti entry (auto-appends at the next position). */
export async function createListaContattiAction(
  input: ListaContattiInput,
): Promise<ListaContattiActionResult> {
  if (!isValid(listaCreateSchema, input, 'createListaContatti')) {
    return { entry: null, demo: false, ok: false };
  }
  if (!(await allowAction('createListaContatti'))) {
    return { entry: null, demo: false, ok: false };
  }
  const { data, demo, ok } = await createListaContatti(input);
  return { entry: data, demo, ok };
}

/** Patch an existing Lista contatti entry (rename, re-rate, toggle contacted, …). */
export async function updateListaContattiAction(
  id: string,
  patch: Partial<ListaContattiInput>,
): Promise<ListaContattiActionResult> {
  if (!isValid(listaPatchSchema, patch, 'updateListaContatti')) {
    return { entry: null, demo: false, ok: false };
  }
  const { data, demo, ok } = await updateListaContatti(id, patch);
  return { entry: data ?? null, demo, ok };
}

/** Soft-delete a single Lista contatti entry. */
export async function deleteListaContattiAction(
  id: string,
): Promise<ListaContattiActionResult> {
  const { demo, ok } = await deleteListaContatti(id);
  return { entry: null, demo, ok };
}

/** Promote a Lista contatti entry into a CRM contact (stamps promoted_contact_id). */
export async function promoteListaContattiAction(
  id: string,
): Promise<PromoteActionResult> {
  const { data, demo, ok } = await promoteListaContatti(id);
  return { entryId: data.entry_id, contactId: data.contact_id, demo, ok };
}
