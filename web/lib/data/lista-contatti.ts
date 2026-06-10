import 'server-only';
import type { ListaContattiEntry, ListaContattiRapporto, ListaContattiStatus } from '@/lib/types/db';
import { MOCK_LISTA_CONTATTI } from '@/lib/data/mock/lista-contatti';
import {
  type CrmResult,
  type MutationResult,
  getClient,
  getOwnerContext,
  nowIso,
  ok,
  stripReadonly,
} from '@/lib/data/crm-shared';
import { demoId } from '@/lib/data/mock/_shared';

/**
 * Lista contatti ("list of 100") data access (server-only, Supabase-then-MOCK,
 * never throws). The list is per-marketer and position-ordered; supports CRUD,
 * the contacted toggle and "promote to contact".
 */

const SELECT =
  'id,org_id,owner_marketer_id,position,full_name,phone,relationship,rating,rapporto,stato,percorso,contacted,promoted_contact_id,iscritto_at,notes,created_at,updated_at,deleted_at';

/**
 * List Lista contatti entries ordered by position. Defaults to the caller's own list;
 * pass `ownerMarketerId` for the per-person profile view (RLS scopes reads to the
 * caller's visible subtree). The mock list is owned by the demo caller, so other
 * marketers degrade to an empty list in demo mode.
 */
export async function listListaContatti(
  ownerMarketerId?: string,
): Promise<CrmResult<ListaContattiEntry[]>> {
  const supabase = getClient();
  if (!supabase) {
    const rows = MOCK_LISTA_CONTATTI.filter((e) => !e.deleted_at)
      .filter((e) => (ownerMarketerId ? e.owner_marketer_id === ownerMarketerId : true))
      .sort((a, b) => a.position - b.position);
    return ok(rows, true);
  }
  try {
    let query = supabase
      .from('lista_contatti_entries')
      .select(SELECT)
      .is('deleted_at', null);
    if (ownerMarketerId) query = query.eq('owner_marketer_id', ownerMarketerId);
    const { data, error } = await query.order('position', { ascending: true });
    if (error || !data) {
      const rows = [...MOCK_LISTA_CONTATTI]
        .filter((e) => (ownerMarketerId ? e.owner_marketer_id === ownerMarketerId : true))
        .sort((a, b) => a.position - b.position);
      return ok(rows, true);
    }
    return ok(data as ListaContattiEntry[], false);
  } catch {
    const rows = [...MOCK_LISTA_CONTATTI]
      .filter((e) => (ownerMarketerId ? e.owner_marketer_id === ownerMarketerId : true))
      .sort((a, b) => a.position - b.position);
    return ok(rows, true);
  }
}

export interface ListaContattiInput {
  full_name: string;
  phone?: string | null;
  relationship?: string | null;
  rating?: number | null;
  rapporto?: ListaContattiRapporto | null;
  stato?: ListaContattiStatus;
  /** Percorso phase reached (0..5). */
  percorso?: number;
  /** Enrollment timestamp (usually stamped server-side from `stato`). */
  iscritto_at?: string | null;
  position?: number;
  contacted?: boolean;
  notes?: string | null;
}

/** Create a Lista contatti entry (auto-appends at the next free position). */
export async function createListaContatti(
  input: ListaContattiInput,
): Promise<MutationResult<ListaContattiEntry>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();

  // Shared row payload; `position` is resolved per-path below.
  const makeEntry = (position: number): ListaContattiEntry => ({
    id: demoId('cn'),
    org_id: orgId,
    owner_marketer_id: marketerId,
    position,
    full_name: input.full_name,
    phone: input.phone ?? null,
    relationship: input.relationship ?? null,
    rating: input.rating ?? null,
    rapporto: input.rapporto ?? null,
    stato: input.stato ?? 'non_invitato',
    percorso: input.percorso ?? 0,
    contacted: input.contacted ?? false,
    promoted_contact_id: null,
    iscritto_at: input.iscritto_at ?? (input.stato === 'iscritto' ? nowIso() : null),
    notes: input.notes ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  });

  // Demo / no-env: append after the mock list and simulate success.
  if (!supabase || demo) {
    const nextPos =
      input.position ??
      (MOCK_LISTA_CONTATTI.reduce((m, e) => Math.max(m, e.position), 0) + 1);
    return { data: makeEntry(nextPos), demo: true, ok: true };
  }

  try {
    // Next free position from the REAL list, NOT the mock (the previous bug:
    // a constant mock-derived position collided with the partial unique index
    // `lista_contatti_owner_position_uq` = (org_id, owner_marketer_id, position)
    // WHERE deleted_at IS NULL → "duplicate key" on every add). Max over LIVE
    // rows + 1 never collides.
    let nextPos = input.position ?? null;
    if (nextPos == null) {
      const { data: top } = await supabase
        .from('lista_contatti_entries')
        .select('position')
        .eq('org_id', orgId)
        .eq('owner_marketer_id', marketerId)
        .is('deleted_at', null)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle<{ position: number }>();
      nextPos = (top?.position ?? 0) + 1;
    }

    const entry = makeEntry(nextPos);
    const { data, error } = await supabase
      .from('lista_contatti_entries')
      .insert({ ...entry, id: undefined })
      .select(SELECT)
      .single();
    if (error || !data) return { data: entry, demo: false, ok: false };
    return { data: data as ListaContattiEntry, demo: false, ok: true };
  } catch {
    return { data: makeEntry(input.position ?? 0), demo: false, ok: false };
  }
}

/**
 * Bulk-create many Lista contatti entries in ONE insert (CSV import). Appends after
 * the caller's current max position; owner is forced to the session marketer (RLS).
 * Demo-safe: with no env it returns optimistic rows. Returns the created entries.
 */
export async function bulkCreateListaContatti(
  inputs: ListaContattiInput[],
): Promise<MutationResult<ListaContattiEntry[]>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();

  const build = (input: ListaContattiInput, position: number): ListaContattiEntry => ({
    id: demoId('cn'),
    org_id: orgId,
    owner_marketer_id: marketerId,
    position,
    full_name: input.full_name,
    phone: input.phone ?? null,
    relationship: input.relationship ?? null,
    rating: input.rating ?? null,
    rapporto: input.rapporto ?? null,
    stato: input.stato ?? 'non_invitato',
    percorso: input.percorso ?? 0,
    contacted: input.contacted ?? false,
    promoted_contact_id: null,
    iscritto_at: input.iscritto_at ?? null,
    notes: input.notes ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  });

  if (!supabase || demo) {
    const base = MOCK_LISTA_CONTATTI.reduce((m, e) => Math.max(m, e.position), 0);
    return { data: inputs.map((inp, i) => build(inp, base + i + 1)), demo: true, ok: true };
  }

  try {
    const { data: top } = await supabase
      .from('lista_contatti_entries')
      .select('position')
      .eq('org_id', orgId)
      .eq('owner_marketer_id', marketerId)
      .is('deleted_at', null)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>();
    const base = top?.position ?? 0;
    const payload = inputs.map((input, i) => ({
      org_id: orgId,
      owner_marketer_id: marketerId,
      position: base + i + 1,
      full_name: input.full_name,
      phone: input.phone ?? null,
      relationship: input.relationship ?? null,
      rapporto: input.rapporto ?? null,
      stato: input.stato ?? 'non_invitato',
      notes: input.notes ?? null,
    }));
    const { data, error } = await supabase
      .from('lista_contatti_entries')
      .insert(payload)
      .select(SELECT);
    if (error || !data) return { data: [], demo: false, ok: false };
    return { data: data as ListaContattiEntry[], demo: false, ok: true };
  } catch {
    return { data: [], demo: false, ok: false };
  }
}

/** Update a Lista contatti entry (rename, re-rate, toggle contacted, reorder). */
export async function updateListaContatti(
  id: string,
  patch: Partial<ListaContattiInput>,
): Promise<MutationResult<ListaContattiEntry | null>> {
  const supabase = getClient();
  // Keep iscritto_at authoritative: stamp it when the entry becomes 'iscritto',
  // clear it when it leaves that state (so the monthly reset has a clean anchor).
  const withStamp: Partial<ListaContattiInput> = { ...patch };
  if (patch.stato === 'iscritto') {
    withStamp.iscritto_at = patch.iscritto_at ?? nowIso();
  } else if (patch.stato !== undefined) {
    withStamp.iscritto_at = null;
  }
  const existing = MOCK_LISTA_CONTATTI.find((e) => e.id === id) ?? null;
  const merged = existing
    ? ({ ...existing, ...withStamp, updated_at: nowIso() } as ListaContattiEntry)
    : null;
  if (!supabase) return { data: merged, demo: true, ok: true };
  try {
    const { data, error } = await supabase
      .from('lista_contatti_entries')
      .update({ ...stripReadonly(withStamp), updated_at: nowIso() })
      .eq('id', id)
      .select(SELECT)
      .maybeSingle();
    if (error) return { data: merged, demo: false, ok: false };
    return { data: (data as ListaContattiEntry) ?? null, demo: false, ok: true };
  } catch {
    return { data: merged, demo: false, ok: false };
  }
}

/** Soft-delete a Lista contatti entry. */
export async function deleteListaContatti(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const supabase = getClient();
  if (!supabase) return { data: { id }, demo: true, ok: true };
  try {
    const { error } = await supabase
      .from('lista_contatti_entries')
      .update({ deleted_at: nowIso() })
      .eq('id', id);
    return { data: { id }, demo: false, ok: !error };
  } catch {
    return { data: { id }, demo: false, ok: false };
  }
}

/**
 * Promote a Lista contatti entry into a CRM contact. Returns the (simulated) new contact
 * id and stamps `promoted_contact_id` on the entry. Real path inserts a contact
 * + updates the entry; demo path simulates both.
 */
export async function promoteListaContatti(
  id: string,
): Promise<MutationResult<{ entry_id: string; contact_id: string }>> {
  const { orgId, marketerId } = await getOwnerContext();
  const supabase = getClient();
  const contactId = demoId('ct');

  if (!supabase) {
    return { data: { entry_id: id, contact_id: contactId }, demo: true, ok: true };
  }
  try {
    // Read the REAL entry (name + phone). The mock lookup by id never matched a
    // real UUID, so the promoted contact came out as "Contatto" with no phone.
    const { data: entryRow } = await supabase
      .from('lista_contatti_entries')
      .select('full_name,phone')
      .eq('id', id)
      .maybeSingle();
    const fullName = (entryRow as { full_name?: string } | null)?.full_name ?? '';
    const phone = (entryRow as { phone?: string | null } | null)?.phone ?? null;
    const { data: contact, error: insErr } = await supabase
      .from('contacts')
      .insert({
        org_id: orgId,
        owner_marketer_id: marketerId,
        first_name: fullName.split(' ')[0] || 'Contatto',
        last_name: fullName.split(' ').slice(1).join(' ') || null,
        phone,
        source: 'centos_list',
        status: 'nuovo',
        created_by: marketerId,
      })
      .select('id')
      .single();
    if (insErr || !contact)
      return { data: { entry_id: id, contact_id: contactId }, demo: false, ok: false };
    const newId = (contact as { id: string }).id;
    await supabase
      .from('lista_contatti_entries')
      .update({ promoted_contact_id: newId, contacted: true, updated_at: nowIso() })
      .eq('id', id);
    return { data: { entry_id: id, contact_id: newId }, demo: false, ok: true };
  } catch {
    return { data: { entry_id: id, contact_id: contactId }, demo: false, ok: false };
  }
}
