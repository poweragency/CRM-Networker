import 'server-only';
import type {
  Contact,
  ContactSource,
  ContactStatus,
} from '@/lib/types/db';
import { MOCK_CONTACTS } from '@/lib/data/mock/contacts';
import {
  type CrmResult,
  type MutationResult,
  type SortDir,
  compareBy,
  getClient,
  getOwnerContext,
  matchesText,
  nowIso,
  ok,
  stripReadonly,
} from '@/lib/data/crm-shared';
import { demoId } from '@/lib/data/mock/_shared';

/**
 * Contacts data access (server-only, Supabase-then-MOCK fallback, never throws).
 * Reads scope to the caller's visible subtree via RLS (the UI just asks for "my
 * data / my team"); mock fallbacks return the full demo set so filters/sort/
 * search/bulk-actions are exercisable in "modalità demo".
 */

const SELECT =
  'id,org_id,owner_marketer_id,first_name,last_name,email,phone,city,status,source,tags,next_follow_up_at,last_interaction_at,notes,created_by,updated_by,created_at,updated_at,deleted_at';

export type ContactSortKey =
  | 'first_name'
  | 'last_name'
  | 'status'
  | 'created_at'
  | 'next_follow_up_at'
  | 'last_interaction_at';

export interface ContactFilters {
  search?: string;
  status?: ContactStatus[];
  source?: ContactSource[];
  tags?: string[];
  /** only contacts with a follow-up due on/before now. */
  followUpDue?: boolean;
  sortBy?: ContactSortKey;
  sortDir?: SortDir;
}

/** Apply filters/sort to the mock set (mirrors the Supabase query semantics). */
function filterMock(filters: ContactFilters): Contact[] {
  const {
    search = '',
    status,
    source,
    tags,
    followUpDue,
    sortBy = 'created_at',
    sortDir = 'desc',
  } = filters;
  const nowMs = Date.now();

  let rows = MOCK_CONTACTS.filter((c) => !c.deleted_at).filter((c) => {
    const full = `${c.first_name} ${c.last_name ?? ''}`.trim();
    if (search && !(matchesText(full, search) || matchesText(c.email, search) || matchesText(c.phone, search) || matchesText(c.city, search)))
      return false;
    if (status && status.length && !status.includes(c.status)) return false;
    if (source && source.length && !source.includes(c.source)) return false;
    if (tags && tags.length && !tags.some((t) => c.tags.includes(t)))
      return false;
    if (followUpDue) {
      if (!c.next_follow_up_at) return false;
      if (new Date(c.next_follow_up_at).getTime() > nowMs) return false;
    }
    return true;
  });

  rows = [...rows].sort(compareBy<Contact>(sortBy, sortDir));
  return rows;
}

/** List contacts with filters/sort/search. */
export async function listContacts(
  filters: ContactFilters = {},
): Promise<CrmResult<Contact[]>> {
  const supabase = getClient();
  if (!supabase) return ok(filterMock(filters), true);

  try {
    let query = supabase.from('contacts').select(SELECT).is('deleted_at', null);

    if (filters.search) {
      const s = `%${filters.search}%`;
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},city.ilike.${s}`,
      );
    }
    if (filters.status?.length) query = query.in('status', filters.status);
    if (filters.source?.length) query = query.in('source', filters.source);
    if (filters.tags?.length) query = query.overlaps('tags', filters.tags);
    if (filters.followUpDue)
      query = query.not('next_follow_up_at', 'is', null).lte('next_follow_up_at', nowIso());

    query = query.order(filters.sortBy ?? 'created_at', {
      ascending: (filters.sortDir ?? 'desc') === 'asc',
    });

    const { data, error } = await query;
    if (error || !data) return ok(filterMock(filters), true);
    return ok(data as Contact[], false);
  } catch {
    return ok(filterMock(filters), true);
  }
}

/** Single contact by id. */
export async function getContactById(
  id: string,
): Promise<CrmResult<Contact | null>> {
  const supabase = getClient();
  if (!supabase) {
    return ok(MOCK_CONTACTS.find((c) => c.id === id) ?? null, true);
  }
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select(SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return ok(MOCK_CONTACTS.find((c) => c.id === id) ?? null, true);
    return ok((data as Contact) ?? null, false);
  } catch {
    return ok(MOCK_CONTACTS.find((c) => c.id === id) ?? null, true);
  }
}

/** Distinct tag universe (for the tag filter / autocomplete). */
export async function listContactTags(): Promise<CrmResult<string[]>> {
  const { data, demo } = await listContacts();
  const tags = Array.from(new Set(data.flatMap((c) => c.tags))).sort();
  return ok(tags, demo);
}

export type ContactInput = Partial<
  Omit<Contact, 'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'>
> & { first_name: string };

/** Create a contact (real insert when configured; simulated in demo). */
export async function createContact(
  input: ContactInput,
): Promise<MutationResult<Contact>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();

  const optimistic: Contact = {
    id: demoId('ct'),
    org_id: orgId,
    owner_marketer_id: input.owner_marketer_id ?? marketerId,
    first_name: input.first_name,
    last_name: input.last_name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    city: input.city ?? null,
    status: input.status ?? 'nuovo',
    source: input.source ?? 'altro',
    tags: input.tags ?? [],
    next_follow_up_at: input.next_follow_up_at ?? null,
    last_interaction_at: input.last_interaction_at ?? null,
    notes: input.notes ?? null,
    created_by: marketerId,
    updated_by: marketerId,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  };

  if (!supabase || demo) return { data: optimistic, demo: true, ok: true };

  try {
    const { data, error } = await supabase
      .from('contacts')
      .insert({ ...optimistic, id: undefined })
      .select(SELECT)
      .single();
    if (error || !data) return { data: optimistic, demo: false, ok: false };
    return { data: data as Contact, demo: false, ok: true };
  } catch {
    return { data: optimistic, demo: false, ok: false };
  }
}

/** Update a contact. */
export async function updateContact(
  id: string,
  patch: Partial<ContactInput>,
): Promise<MutationResult<Contact | null>> {
  const supabase = getClient();
  const existing = MOCK_CONTACTS.find((c) => c.id === id) ?? null;
  const merged = existing
    ? ({ ...existing, ...patch, updated_at: nowIso() } as Contact)
    : null;

  if (!supabase) return { data: merged, demo: true, ok: true };

  try {
    const { data, error } = await supabase
      .from('contacts')
      .update({ ...stripReadonly(patch), updated_at: nowIso() })
      .eq('id', id)
      .select(SELECT)
      .maybeSingle();
    if (error) return { data: merged, demo: false, ok: false };
    return { data: (data as Contact) ?? null, demo: false, ok: true };
  } catch {
    return { data: merged, demo: false, ok: false };
  }
}

/** Soft-delete a contact. */
export async function deleteContact(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const supabase = getClient();
  if (!supabase) return { data: { id }, demo: true, ok: true };
  try {
    const { error } = await supabase
      .from('contacts')
      .update({ deleted_at: nowIso() })
      .eq('id', id);
    return { data: { id }, demo: false, ok: !error };
  } catch {
    return { data: { id }, demo: false, ok: false };
  }
}

/** Bulk add tags to many contacts. */
export async function bulkTagContacts(
  ids: string[],
  tags: string[],
): Promise<MutationResult<{ count: number }>> {
  const supabase = getClient();
  if (!supabase) return { data: { count: ids.length }, demo: true, ok: true };
  try {
    // Per-row additive merge. Read the EXISTING tags from the DB row (never from
    // the mock dataset) so bulk-tagging genuinely ADDS instead of overwriting and
    // silently dropping the contact's current tags.
    for (const id of ids) {
      const { data: row } = await supabase
        .from('contacts')
        .select('tags')
        .eq('id', id)
        .maybeSingle();
      const current = ((row as { tags?: string[] | null } | null)?.tags) ?? [];
      const merged = Array.from(new Set([...current, ...tags]));
      await supabase
        .from('contacts')
        .update({ tags: merged, updated_at: nowIso() })
        .eq('id', id);
    }
    return { data: { count: ids.length }, demo: false, ok: true };
  } catch {
    return { data: { count: ids.length }, demo: false, ok: false };
  }
}

/** Bulk soft-delete many contacts. */
export async function bulkDeleteContacts(
  ids: string[],
): Promise<MutationResult<{ count: number }>> {
  const supabase = getClient();
  if (!supabase) return { data: { count: ids.length }, demo: true, ok: true };
  try {
    const { error } = await supabase
      .from('contacts')
      .update({ deleted_at: nowIso() })
      .in('id', ids);
    return { data: { count: ids.length }, demo: false, ok: !error };
  } catch {
    return { data: { count: ids.length }, demo: false, ok: false };
  }
}
