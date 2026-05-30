import 'server-only';
import type {
  DocumentCategory,
  DocumentStatus,
  DocumentVersion,
  InternalDocument,
  TiptapDoc,
} from '@/lib/types/db';
import {
  MOCK_DOCUMENTS,
  MOCK_DOCUMENT_VERSIONS,
} from '@/lib/data/mock/documents';
import {
  type CrmResult,
  type MutationResult,
  getClient,
  getOwnerContext,
  matchesText,
  nowIso,
  ok,
} from '@/lib/data/crm-shared';
import { demoId } from '@/lib/data/mock/_shared';

/**
 * Internal documents data access (server-only, Supabase-then-MOCK, never throws).
 * Rich-text only (ADR-009 #5) — body is Tiptap/ProseMirror JSON, NO file
 * uploads. Supports list/getById/create/saveVersion/duplicate/archive + version
 * history. Versioning: in the real DB a BEFORE UPDATE trigger snapshots the
 * prior body; the `saveVersion` helper here represents the explicit save.
 */

const DOC_SELECT =
  'id,org_id,title,category,status,body,current_version,duplicated_from_id,tags,created_by,updated_by,created_at,updated_at,archived_at,deleted_at';
const VERSION_SELECT =
  'id,org_id,document_id,version_no,title,body,change_note,created_by,created_at';

export interface DocumentFilters {
  search?: string;
  category?: DocumentCategory[];
  status?: DocumentStatus[];
  tags?: string[];
  /** include archived documents (default false). */
  includeArchived?: boolean;
}

function filterMock(filters: DocumentFilters): InternalDocument[] {
  const { search = '', category, status, tags, includeArchived = false } = filters;
  return MOCK_DOCUMENTS.filter((d) => !d.deleted_at)
    .filter((d) => (includeArchived ? true : d.status !== 'archived'))
    .filter((d) => {
      if (search && !matchesText(d.title, search)) return false;
      if (category?.length && !category.includes(d.category)) return false;
      if (status?.length && !status.includes(d.status)) return false;
      if (tags?.length && !tags.some((t) => d.tags.includes(t))) return false;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
}

/** List documents with filters/search. */
export async function listDocuments(
  filters: DocumentFilters = {},
): Promise<CrmResult<InternalDocument[]>> {
  const supabase = getClient();
  if (!supabase) return ok(filterMock(filters), true);
  try {
    let query = supabase
      .from('internal_documents')
      .select(DOC_SELECT)
      .is('deleted_at', null);
    if (!filters.includeArchived) query = query.neq('status', 'archived');
    if (filters.search) query = query.ilike('title', `%${filters.search}%`);
    if (filters.category?.length) query = query.in('category', filters.category);
    if (filters.status?.length) query = query.in('status', filters.status);
    if (filters.tags?.length) query = query.overlaps('tags', filters.tags);
    query = query.order('updated_at', { ascending: false });
    const { data, error } = await query;
    if (error || !data) return ok(filterMock(filters), true);
    return ok(data as InternalDocument[], false);
  } catch {
    return ok(filterMock(filters), true);
  }
}

/** Single document by id. */
export async function getDocumentById(
  id: string,
): Promise<CrmResult<InternalDocument | null>> {
  const supabase = getClient();
  if (!supabase) return ok(MOCK_DOCUMENTS.find((d) => d.id === id) ?? null, true);
  try {
    const { data, error } = await supabase
      .from('internal_documents')
      .select(DOC_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return ok(MOCK_DOCUMENTS.find((d) => d.id === id) ?? null, true);
    return ok((data as InternalDocument) ?? null, false);
  } catch {
    return ok(MOCK_DOCUMENTS.find((d) => d.id === id) ?? null, true);
  }
}

/** Distinct tag universe for the tag filter. */
export async function listDocumentTags(): Promise<CrmResult<string[]>> {
  const { data, demo } = await listDocuments({ includeArchived: true });
  return ok(Array.from(new Set(data.flatMap((d) => d.tags))).sort(), demo);
}

export interface DocumentInput {
  title: string;
  category?: DocumentCategory;
  status?: DocumentStatus;
  body?: TiptapDoc;
  tags?: string[];
}

const EMPTY_BODY: TiptapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Create a document (starts at version 1, draft by default). */
export async function createDocument(
  input: DocumentInput,
): Promise<MutationResult<InternalDocument>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();

  const optimistic: InternalDocument = {
    id: demoId('doc'),
    org_id: orgId,
    title: input.title,
    category: input.category ?? 'altro',
    status: input.status ?? 'draft',
    body: input.body ?? EMPTY_BODY,
    current_version: 1,
    duplicated_from_id: null,
    tags: input.tags ?? [],
    created_by: marketerId,
    updated_by: marketerId,
    created_at: nowIso(),
    updated_at: nowIso(),
    archived_at: null,
    deleted_at: null,
  };

  if (!supabase || demo) return { data: optimistic, demo: true, ok: true };
  try {
    const { data, error } = await supabase
      .from('internal_documents')
      .insert({ ...optimistic, id: undefined })
      .select(DOC_SELECT)
      .single();
    if (error || !data) return { data: optimistic, demo: false, ok: false };
    return { data: data as InternalDocument, demo: false, ok: true };
  } catch {
    return { data: optimistic, demo: false, ok: false };
  }
}

/**
 * Save a new version: persists the title/body (and metadata) on the document.
 * The DB trigger snapshots the prior body into `document_versions` and bumps
 * `current_version`; demo path simulates the bumped document.
 */
export async function saveVersion(
  id: string,
  patch: DocumentInput & { change_note?: string },
): Promise<MutationResult<InternalDocument | null>> {
  const { marketerId } = await getOwnerContext();
  const supabase = getClient();
  const existing = MOCK_DOCUMENTS.find((d) => d.id === id) ?? null;
  const merged = existing
    ? ({
        ...existing,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        current_version: existing.current_version + 1,
        updated_by: marketerId,
        updated_at: nowIso(),
      } as InternalDocument)
    : null;

  if (!supabase) return { data: merged, demo: true, ok: true };
  try {
    const update: Record<string, unknown> = {
      updated_by: marketerId,
      updated_at: nowIso(),
    };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.category !== undefined) update.category = patch.category;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.body !== undefined) update.body = patch.body;
    if (patch.tags !== undefined) update.tags = patch.tags;

    const { data, error } = await supabase
      .from('internal_documents')
      .update(update)
      .eq('id', id)
      .select(DOC_SELECT)
      .maybeSingle();
    if (error) return { data: merged, demo: false, ok: false };
    return { data: (data as InternalDocument) ?? null, demo: false, ok: true };
  } catch {
    return { data: merged, demo: false, ok: false };
  }
}

/** Duplicate a document into a new draft (provenance via duplicated_from_id). */
export async function duplicateDocument(
  id: string,
): Promise<MutationResult<InternalDocument | null>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();
  const source = MOCK_DOCUMENTS.find((d) => d.id === id) ?? null;

  const optimistic: InternalDocument | null = source
    ? {
        ...source,
        id: demoId('doc'),
        title: `${source.title} (copia)`,
        status: 'draft',
        current_version: 1,
        duplicated_from_id: source.id,
        created_by: marketerId,
        updated_by: marketerId,
        created_at: nowIso(),
        updated_at: nowIso(),
        archived_at: null,
      }
    : null;

  if (!supabase || demo) return { data: optimistic, demo: true, ok: true };
  try {
    const { data: src } = await supabase
      .from('internal_documents')
      .select(DOC_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (!src) return { data: optimistic, demo: false, ok: false };
    const s = src as InternalDocument;
    const { data, error } = await supabase
      .from('internal_documents')
      .insert({
        org_id: orgId,
        title: `${s.title} (copia)`,
        category: s.category,
        status: 'draft',
        body: s.body,
        tags: s.tags,
        duplicated_from_id: s.id,
        created_by: marketerId,
        updated_by: marketerId,
      })
      .select(DOC_SELECT)
      .single();
    if (error || !data) return { data: optimistic, demo: false, ok: false };
    return { data: data as InternalDocument, demo: false, ok: true };
  } catch {
    return { data: optimistic, demo: false, ok: false };
  }
}

/** Archive (or restore) a document. */
export async function archiveDocument(
  id: string,
  archived = true,
): Promise<MutationResult<InternalDocument | null>> {
  const supabase = getClient();
  const existing = MOCK_DOCUMENTS.find((d) => d.id === id) ?? null;
  const merged = existing
    ? ({
        ...existing,
        status: (archived ? 'archived' : 'draft') as DocumentStatus,
        archived_at: archived ? nowIso() : null,
        updated_at: nowIso(),
      } as InternalDocument)
    : null;

  if (!supabase) return { data: merged, demo: true, ok: true };
  try {
    const { data, error } = await supabase
      .from('internal_documents')
      .update({
        status: archived ? 'archived' : 'draft',
        archived_at: archived ? nowIso() : null,
        updated_at: nowIso(),
      })
      .eq('id', id)
      .select(DOC_SELECT)
      .maybeSingle();
    if (error) return { data: merged, demo: false, ok: false };
    return { data: (data as InternalDocument) ?? null, demo: false, ok: true };
  } catch {
    return { data: merged, demo: false, ok: false };
  }
}

/** List a document's version history (newest first). */
export async function listVersions(
  documentId: string,
): Promise<CrmResult<DocumentVersion[]>> {
  const supabase = getClient();
  if (!supabase) {
    const rows = MOCK_DOCUMENT_VERSIONS.filter(
      (v) => v.document_id === documentId,
    ).sort((a, b) => b.version_no - a.version_no);
    return ok(rows, true);
  }
  try {
    const { data, error } = await supabase
      .from('document_versions')
      .select(VERSION_SELECT)
      .eq('document_id', documentId)
      .order('version_no', { ascending: false });
    if (error || !data) {
      const rows = MOCK_DOCUMENT_VERSIONS.filter(
        (v) => v.document_id === documentId,
      ).sort((a, b) => b.version_no - a.version_no);
      return ok(rows, true);
    }
    return ok(data as DocumentVersion[], false);
  } catch {
    const rows = MOCK_DOCUMENT_VERSIONS.filter(
      (v) => v.document_id === documentId,
    ).sort((a, b) => b.version_no - a.version_no);
    return ok(rows, true);
  }
}
