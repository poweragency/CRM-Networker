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
} from '@/lib/data/crm-shared';
import { demoId } from '@/lib/data/mock/_shared';

/**
 * Lista contatti ("list of 100") data access (server-only, Supabase-then-MOCK,
 * never throws). The list is per-marketer and position-ordered; supports CRUD,
 * the contacted toggle and "promote to contact".
 */

const SELECT =
  'id,org_id,owner_marketer_id,position,full_name,phone,relationship,rating,rapporto,stato,percorso,contacted,promoted_contact_id,notes,created_at,updated_at,deleted_at';

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
  position?: number;
  contacted?: boolean;
  notes?: string | null;
}

/** Create a Lista contatti entry (auto-appends at the next position when omitted). */
export async function createListaContatti(
  input: ListaContattiInput,
): Promise<MutationResult<ListaContattiEntry>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();
  const nextPos =
    input.position ??
    (MOCK_LISTA_CONTATTI.reduce((m, e) => Math.max(m, e.position), 0) + 1);

  const optimistic: ListaContattiEntry = {
    id: demoId('cn'),
    org_id: orgId,
    owner_marketer_id: marketerId,
    position: nextPos,
    full_name: input.full_name,
    phone: input.phone ?? null,
    relationship: input.relationship ?? null,
    rating: input.rating ?? null,
    rapporto: input.rapporto ?? null,
    stato: input.stato ?? 'non_invitato',
    percorso: input.percorso ?? 0,
    contacted: input.contacted ?? false,
    promoted_contact_id: null,
    notes: input.notes ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  };

  if (!supabase || demo) return { data: optimistic, demo: true, ok: true };

  try {
    const { data, error } = await supabase
      .from('lista_contatti_entries')
      .insert({ ...optimistic, id: undefined })
      .select(SELECT)
      .single();
    if (error || !data) return { data: optimistic, demo: false, ok: false };
    return { data: data as ListaContattiEntry, demo: false, ok: true };
  } catch {
    return { data: optimistic, demo: false, ok: false };
  }
}

/** Update a Lista contatti entry (rename, re-rate, toggle contacted, reorder). */
export async function updateListaContatti(
  id: string,
  patch: Partial<ListaContattiInput>,
): Promise<MutationResult<ListaContattiEntry | null>> {
  const supabase = getClient();
  const existing = MOCK_LISTA_CONTATTI.find((e) => e.id === id) ?? null;
  const merged = existing
    ? ({ ...existing, ...patch, updated_at: nowIso() } as ListaContattiEntry)
    : null;
  if (!supabase) return { data: merged, demo: true, ok: true };
  try {
    const { data, error } = await supabase
      .from('lista_contatti_entries')
      .update({ ...patch, updated_at: nowIso() })
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
  const entry = MOCK_LISTA_CONTATTI.find((e) => e.id === id);
  const contactId = demoId('ct');

  if (!supabase) {
    return { data: { entry_id: id, contact_id: contactId }, demo: true, ok: true };
  }
  try {
    const { data: contact, error: insErr } = await supabase
      .from('contacts')
      .insert({
        org_id: orgId,
        owner_marketer_id: marketerId,
        first_name: entry?.full_name.split(' ')[0] ?? 'Contatto',
        last_name: entry?.full_name.split(' ').slice(1).join(' ') || null,
        phone: entry?.phone ?? null,
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
