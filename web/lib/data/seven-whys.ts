import 'server-only';
import type { SevenWhys, WhyKey } from '@/lib/types/db';
import { MOCK_SEVEN_WHYS } from '@/lib/data/mock/seven-whys';
import {
  type CrmResult,
  type MutationResult,
  getClient,
  getOwnerContext,
  nowIso,
  ok,
} from '@/lib/data/crm-shared';
import { demoId } from '@/lib/data/mock/_shared';
import { getSubtree } from '@/lib/data/genealogy';
import type { TreeNode } from '@/lib/types/db';
import {
  filledCount,
  type SevenWhysRosterRow,
} from '@/lib/data/seven-whys-shared';

// Re-export the client-safe helper + roster type so existing importers of this
// module keep working (they resolve through this server-only barrel).
export { filledCount };
export type { SevenWhysRosterRow };

/**
 * Sette Perché data access (server-only, Supabase-then-MOCK, never throws). One
 * record per marketer (UNIQUE). The screen reads the caller's own record (or a
 * given marketer's, subject to RLS) and upserts it. Uplines additionally read
 * the records of their downline subtree (read-subtree), edited read-only in the
 * UI; writes are scoped to the caller's own record (write-own).
 */

const SELECT =
  'id,org_id,marketer_id,subject,why_1,why_2,why_3,why_4,why_5,why_6,why_7,primary_why_index,created_at,updated_at';

/**
 * The whole roster surfaced by /sette-perche: the caller's own record first,
 * then every visible downline marketer with their record (read-only). Resolves
 * subject names through the genealogy layer so the list is "person-centric".
 */
export async function listSevenWhys(): Promise<CrmResult<SevenWhysRosterRow[]>> {
  const { marketerId: self } = await getOwnerContext();

  // The visible people = the caller's own subtree (RLS-equivalent in demo via
  // the mock genealogy). The genealogy layer is itself demo-safe.
  const subtreeRes = await getSubtree(self, 'GLOBAL');
  const people: TreeNode[] = subtreeRes.data;

  const supabase = getClient();

  // Build the record map (one per marketer).
  let records: SevenWhys[];
  let demo: boolean;
  if (!supabase) {
    records = MOCK_SEVEN_WHYS;
    demo = true;
  } else {
    try {
      const ids = people.map((p) => p.id);
      const { data, error } = await supabase
        .from('seven_whys')
        .select(SELECT)
        .in('marketer_id', ids);
      if (error || !data) {
        records = MOCK_SEVEN_WHYS;
        demo = true;
      } else {
        records = data as SevenWhys[];
        demo = false;
      }
    } catch {
      records = MOCK_SEVEN_WHYS;
      demo = true;
    }
  }
  demo = demo || subtreeRes.demo;

  const byMarketer = new Map(records.map((r) => [r.marketer_id, r]));

  const rows: SevenWhysRosterRow[] = people.map((p) => {
    const record = byMarketer.get(p.id) ?? null;
    return {
      marketer_id: p.id,
      person_name: p.display_name,
      is_self: p.id === self,
      record,
      filled: filledCount(record),
    };
  });

  // Caller's own record always first; the rest by completion desc then name.
  rows.sort((a, b) => {
    if (a.is_self !== b.is_self) return a.is_self ? -1 : 1;
    if (b.filled !== a.filled) return b.filled - a.filled;
    return a.person_name.localeCompare(b.person_name, 'it');
  });

  return ok(rows, demo);
}

/**
 * Resolve a single roster row for a marketer (the detail/editor route). Returns
 * the record (may be null if not started), the person's name and whether the
 * caller owns it (editable) — uplines get a read-only view of downline records.
 */
export async function getSevenWhysFor(
  marketerId: string,
): Promise<CrmResult<SevenWhysRosterRow | null>> {
  const { marketerId: self } = await getOwnerContext();
  const subtreeRes = await getSubtree(self, 'GLOBAL');
  const person = subtreeRes.data.find((p) => p.id === marketerId);
  // Not in the caller's visible subtree → not found (RLS-equivalent).
  if (!person) return ok(null, subtreeRes.demo);

  const recRes = await getSevenWhys(marketerId);
  const row: SevenWhysRosterRow = {
    marketer_id: marketerId,
    person_name: person.display_name,
    is_self: marketerId === self,
    record: recRes.data,
    filled: filledCount(recRes.data),
  };
  return ok(row, recRes.demo || subtreeRes.demo);
}

/** Get the Sette Perché record for a marketer (defaults to the caller). */
export async function getSevenWhys(
  marketerId?: string,
): Promise<CrmResult<SevenWhys | null>> {
  const { marketerId: self } = await getOwnerContext();
  const targetId = marketerId ?? self;
  const supabase = getClient();
  if (!supabase) {
    return ok(MOCK_SEVEN_WHYS.find((w) => w.marketer_id === targetId) ?? null, true);
  }
  try {
    const { data, error } = await supabase
      .from('seven_whys')
      .select(SELECT)
      .eq('marketer_id', targetId)
      .maybeSingle();
    if (error) {
      return ok(MOCK_SEVEN_WHYS.find((w) => w.marketer_id === targetId) ?? null, true);
    }
    return ok((data as SevenWhys) ?? null, false);
  } catch {
    return ok(MOCK_SEVEN_WHYS.find((w) => w.marketer_id === targetId) ?? null, true);
  }
}

export type SevenWhysInput = Partial<Record<WhyKey, string | null>> & {
  subject?: string | null;
  primary_why_index?: number | null;
};

/**
 * Upsert the caller's Sette Perché record (one per marketer). Real path uses an
 * `upsert` keyed on `(org_id, marketer_id)`; demo path simulates the merge.
 */
export async function upsertSevenWhys(
  input: SevenWhysInput,
  marketerId?: string,
): Promise<MutationResult<SevenWhys>> {
  const { orgId, marketerId: self, demo } = await getOwnerContext();
  const targetId = marketerId ?? self;
  const supabase = getClient();
  const existing = MOCK_SEVEN_WHYS.find((w) => w.marketer_id === targetId);

  const merged: SevenWhys = {
    id: existing?.id ?? demoId('sw'),
    org_id: orgId,
    marketer_id: targetId,
    subject: input.subject ?? existing?.subject ?? null,
    why_1: input.why_1 ?? existing?.why_1 ?? null,
    why_2: input.why_2 ?? existing?.why_2 ?? null,
    why_3: input.why_3 ?? existing?.why_3 ?? null,
    why_4: input.why_4 ?? existing?.why_4 ?? null,
    why_5: input.why_5 ?? existing?.why_5 ?? null,
    why_6: input.why_6 ?? existing?.why_6 ?? null,
    why_7: input.why_7 ?? existing?.why_7 ?? null,
    primary_why_index: input.primary_why_index ?? existing?.primary_why_index ?? null,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso(),
  };

  if (!supabase || demo) return { data: merged, demo: true, ok: true };

  try {
    const { data, error } = await supabase
      .from('seven_whys')
      .upsert({ ...merged, id: existing ? merged.id : undefined }, {
        onConflict: 'org_id,marketer_id',
      })
      .select(SELECT)
      .single();
    if (error || !data) return { data: merged, demo: false, ok: false };
    return { data: data as SevenWhys, demo: false, ok: true };
  } catch {
    return { data: merged, demo: false, ok: false };
  }
}

/**
 * Delete the caller's own Sette Perché record (write-own). Real path deletes the
 * single row keyed on `(org_id, marketer_id)`; demo path simulates success and
 * never throws. Uplines cannot delete a downline's record (RLS-enforced; the UI
 * never offers the action).
 */
export async function deleteSevenWhys(
  marketerId?: string,
): Promise<MutationResult<null>> {
  const { orgId, marketerId: self, demo } = await getOwnerContext();
  const targetId = marketerId ?? self;
  const supabase = getClient();

  if (!supabase || demo) return { data: null, demo: true, ok: true };

  try {
    const { error } = await supabase
      .from('seven_whys')
      .delete()
      .eq('org_id', orgId)
      .eq('marketer_id', targetId);
    if (error) return { data: null, demo: false, ok: false };
    return { data: null, demo: false, ok: true };
  } catch {
    return { data: null, demo: false, ok: false };
  }
}
