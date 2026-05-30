'use server';

import {
  archiveDocument,
  createDocument,
  duplicateDocument,
  listVersions,
  saveVersion,
  type DocumentInput,
} from '@/lib/data/documents';
import type {
  DocumentVersion,
  InternalDocument,
  TiptapDoc,
} from '@/lib/types/db';

/**
 * Server Actions backing /documenti (create / save-version / duplicate /
 * archive-restore / restore-version + lazy version-history fetch). Each delegates
 * to the server-only data layer (`lib/data/documents.ts`), which is demo-safe:
 * with no Supabase env (or a failed write) it returns a SIMULATED optimistic
 * result with `demo: true` and never throws (RESILIENCE). Every action returns a
 * small serializable envelope the client uses to patch local state + raise the
 * right toast ("modalità demo" vs real).
 */

export interface DocumentActionResult {
  /** The created/updated row (null when the target could not be resolved). */
  document: InternalDocument | null;
  /** true when served from mock / simulated (env missing or query failed). */
  demo: boolean;
  /** false only when a configured Supabase write actually failed. */
  ok: boolean;
}

export interface VersionsResult {
  versions: DocumentVersion[];
  demo: boolean;
}

/** Create a document (starts at version 1, draft by default). */
export async function createDocumentAction(
  input: DocumentInput,
): Promise<DocumentActionResult> {
  const { data, demo, ok } = await createDocument(input);
  return { document: data, demo, ok };
}

/**
 * Save a new version. Accepts a PARTIAL patch (the data layer merges only the
 * provided fields onto the existing row), so callers can save just the body, or
 * just the metadata, plus a change note. The DB trigger snapshots the prior body
 * and bumps current_version; demo simulates it.
 */
export async function saveVersionAction(
  id: string,
  patch: Partial<DocumentInput> & { change_note?: string },
): Promise<DocumentActionResult> {
  const { data, demo, ok } = await saveVersion(
    id,
    patch as DocumentInput & { change_note?: string },
  );
  return { document: data, demo, ok };
}

/** Duplicate a document into a new draft (provenance via duplicated_from_id). */
export async function duplicateDocumentAction(
  id: string,
): Promise<DocumentActionResult> {
  const { data, demo, ok } = await duplicateDocument(id);
  return { document: data, demo, ok };
}

/** Archive (or restore) a document. */
export async function archiveDocumentAction(
  id: string,
  archived = true,
): Promise<DocumentActionResult> {
  const { data, demo, ok } = await archiveDocument(id, archived);
  return { document: data, demo, ok };
}

/** Fetch a document's version history (lazy, on opening the timeline). */
export async function listVersionsAction(
  documentId: string,
): Promise<VersionsResult> {
  const { data, demo } = await listVersions(documentId);
  return { versions: data, demo };
}

/**
 * Restore a prior version: re-saves the chosen snapshot's title+body as a NEW
 * version (the current body is snapshotted by the same save). Modeled as a
 * `saveVersion` so the action is fully demo-safe and never throws.
 */
export async function restoreVersionAction(
  documentId: string,
  version: { title: string; body: TiptapDoc; version_no: number },
): Promise<DocumentActionResult> {
  const { data, demo, ok } = await saveVersion(documentId, {
    title: version.title,
    body: version.body,
    change_note: `Ripristino della versione ${version.version_no}`,
  });
  return { document: data, demo, ok };
}
