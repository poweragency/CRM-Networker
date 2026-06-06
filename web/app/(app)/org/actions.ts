'use server';

import { revalidatePath } from 'next/cache';
import {
  createOrgDocument,
  deleteOrgDocument,
  type CreateDocInput,
  type DocResult,
} from '@/lib/data/org-documents';
import {
  updateOrgIdentity,
  type SaveIdentityResult,
} from '@/lib/data/org-identity';

/**
 * Server actions for /org settings: downloadable documents (create/delete) and
 * the org identity (name/logo). Thin wrappers over the server-only data layer
 * (RLS-enforced, demo-safe). File bytes are uploaded client-side to Storage; only
 * the resulting metadata (path + public url) flows through these actions.
 */

/** Publish a document (admin → org; co-admin → team, RLS-enforced). */
export async function createOrgDocumentAction(input: CreateDocInput): Promise<DocResult> {
  const res = await createOrgDocument(input);
  if (res.ok && !res.demo) {
    revalidatePath('/org');
    revalidatePath('/informativa');
  }
  return res;
}

/** Delete a document (admin → any; co-admin → own, RLS-enforced). */
export async function deleteOrgDocumentAction(id: string, filePath?: string): Promise<DocResult> {
  const res = await deleteOrgDocument(id, filePath);
  if (res.ok && !res.demo) {
    revalidatePath('/org');
    revalidatePath('/informativa');
  }
  return res;
}

/** Update the org name and/or logo (admin-only via RLS). */
export async function updateOrgIdentityAction(patch: {
  name?: string;
  logo_url?: string | null;
}): Promise<SaveIdentityResult> {
  const res = await updateOrgIdentity(patch);
  // Refresh the whole layout so the new brand (name/logo) shows everywhere.
  if (res.ok && !res.demo) revalidatePath('/', 'layout');
  return res;
}
