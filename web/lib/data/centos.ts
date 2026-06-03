import 'server-only';
import type { CentosEntry, CentosRapporto, CentosStatus } from '@/lib/types/db';
import { MOCK_CENTOS } from '@/lib/data/mock/centos';
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
 * Centos List ("list of 100") data access (server-only, Supabase-then-MOCK,
 * never throws). The list is per-marketer and position-ordered; supports CRUD,
 * the contacted toggle and "promote to contact".
 */

const SELECT =
  'id,org_id,owner_marketer_id,position,full_name,phone,relationship,rating,rapporto,stato,contacted,promoted_contact_id,notes,created_at,updated_at,deleted_at';

/**
 * List Centos entries ordered by position. Defaults to the caller's own list;
 * pass `ownerMarketerId` for the per-person profile view (RLS scopes reads to the
 * caller's visible subtree). The mock list is owned by the demo caller, so other
 * marketers degrade to an empty list in demo mode.
 */
export async function listCentos(
  ownerMarketerId?: string,
): Promise<CrmResult<CentosEntry[]>> {
  const supabase = getClient();
  if (!supabase) {
    const rows = MOCK_CENTOS.filter((e) => !e.deleted_at)
      .filter((e) => (ownerMarketerId ? e.owner_marketer_id === ownerMarketerId : true))
      .sort((a, b) => a.position - b.position);
    return ok(rows, true);
  }
  try {
    let query = supabase
      .from('centos_list_entries')
      .select(SELECT)
      .is('deleted_at', null);
    if (ownerMarketerId) query = query.eq('owner_marketer_id', ownerMarketerId);
    const { data, error } = await query.order('position', { ascending: true });
    if (error || !data) {
      const rows = [...MOCK_CENTOS]
        .filter((e) => (ownerMarketerId ? e.owner_marketer_id === ownerMarketerId : true))
        .sort((a, b) => a.position - b.position);
      return ok(rows, true);
    }
    return ok(data as CentosEntry[], false);
  } catch {
    const rows = [...MOCK_CENTOS]
      .filter((e) => (ownerMarketerId ? e.owner_marketer_id === ownerMarketerId : true))
      .sort((a, b) => a.position - b.position);
    return ok(rows, true);
  }
}

export interface CentosInput {
  full_name: string;
  phone?: string | null;
  relationship?: string | null;
  rating?: number | null;
  rapporto?: CentosRapporto | null;
  stato?: CentosStatus;
  position?: number;
  contacted?: boolean;
  notes?: string | null;
}

/** Create a Centos entry (auto-appends at the next position when omitted). */
export async function createCentos(
  input: CentosInput,
): Promise<MutationResult<CentosEntry>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();
  const nextPos =
    input.position ??
    (MOCK_CENTOS.reduce((m, e) => Math.max(m, e.position), 0) + 1);

  const optimistic: CentosEntry = {
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
      .from('centos_list_entries')
      .insert({ ...optimistic, id: undefined })
      .select(SELECT)
      .single();
    if (error || !data) return { data: optimistic, demo: false, ok: false };
    return { data: data as CentosEntry, demo: false, ok: true };
  } catch {
    return { data: optimistic, demo: false, ok: false };
  }
}

/** Update a Centos entry (rename, re-rate, toggle contacted, reorder). */
export async function updateCentos(
  id: string,
  patch: Partial<CentosInput>,
): Promise<MutationResult<CentosEntry | null>> {
  const supabase = getClient();
  const existing = MOCK_CENTOS.find((e) => e.id === id) ?? null;
  const merged = existing
    ? ({ ...existing, ...patch, updated_at: nowIso() } as CentosEntry)
    : null;
  if (!supabase) return { data: merged, demo: true, ok: true };
  try {
    const { data, error } = await supabase
      .from('centos_list_entries')
      .update({ ...patch, updated_at: nowIso() })
      .eq('id', id)
      .select(SELECT)
      .maybeSingle();
    if (error) return { data: merged, demo: false, ok: false };
    return { data: (data as CentosEntry) ?? null, demo: false, ok: true };
  } catch {
    return { data: merged, demo: false, ok: false };
  }
}

/** Soft-delete a Centos entry. */
export async function deleteCentos(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const supabase = getClient();
  if (!supabase) return { data: { id }, demo: true, ok: true };
  try {
    const { error } = await supabase
      .from('centos_list_entries')
      .update({ deleted_at: nowIso() })
      .eq('id', id);
    return { data: { id }, demo: false, ok: !error };
  } catch {
    return { data: { id }, demo: false, ok: false };
  }
}

/**
 * Promote a Centos entry into a CRM contact. Returns the (simulated) new contact
 * id and stamps `promoted_contact_id` on the entry. Real path inserts a contact
 * + updates the entry; demo path simulates both.
 */
export async function promoteCentos(
  id: string,
): Promise<MutationResult<{ entry_id: string; contact_id: string }>> {
  const { orgId, marketerId } = await getOwnerContext();
  const supabase = getClient();
  const entry = MOCK_CENTOS.find((e) => e.id === id);
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
      .from('centos_list_entries')
      .update({ promoted_contact_id: newId, contacted: true, updated_at: nowIso() })
      .eq('id', id);
    return { data: { entry_id: id, contact_id: newId }, demo: false, ok: true };
  } catch {
    return { data: { entry_id: id, contact_id: contactId }, demo: false, ok: false };
  }
}
