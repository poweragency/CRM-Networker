import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';

/**
 * Formazione progress data access (server-only). The catalog (playlist WOW /
 * Click + libri) is FIXED in code and identical for everyone (see
 * FORMAZIONE_CATALOG in components/team/marketer-formazione); only WHICH items a
 * marketer has ticked as done is per-person. Persisted in `formazione_progress`
 * (one presence row per ticked item_key; RLS-scoped). In pure demo mode (no env)
 * a per-marketer in-memory override map keeps a save reflecting within the run.
 * Never throws.
 */

export interface FormazioneProgressResult {
  /** Catalog IDs the marketer has ticked as visto / letto. */
  done: string[];
  demo: boolean;
}

/** In-memory edit store (demo-only; resets on server restart). */
const overrides = new Map<string, string[]>();

/** The set of ticked items for a marketer (empty until the first save). */
export async function getFormazioneProgress(
  marketerId: string,
): Promise<FormazioneProgressResult> {
  const supabase = getClient();
  if (!supabase) return { done: overrides.get(marketerId) ?? [], demo: true };
  try {
    const { data, error } = await supabase
      .from('formazione_progress')
      .select('item_key')
      .eq('marketer_id', marketerId);
    if (error || !data) return { done: [], demo: false };
    return { done: (data as { item_key: string }[]).map((r) => r.item_key), demo: false };
  } catch {
    return { done: [], demo: false };
  }
}

export interface SaveFormazioneResult {
  ok: boolean;
  /** true only when simulated (pure demo mode). */
  demo: boolean;
}

/** Replace the whole ticked set for a marketer (presence rows; demo = in-memory). */
export async function saveFormazioneProgress(
  marketerId: string,
  done: string[],
): Promise<SaveFormazioneResult> {
  const { orgId, demo } = await getOwnerContext();
  const supabase = getClient();
  if (!supabase || demo) {
    overrides.set(marketerId, done);
    return { ok: true, demo: true };
  }
  try {
    const desired = Array.from(new Set(done));
    const { data: current } = await supabase
      .from('formazione_progress')
      .select('item_key')
      .eq('marketer_id', marketerId);
    const currentKeys = (current as { item_key: string }[] | null ?? []).map((r) => r.item_key);
    const toRemove = currentKeys.filter((k) => !desired.includes(k));
    const toAdd = desired.filter((k) => !currentKeys.includes(k));

    if (toRemove.length) {
      await supabase
        .from('formazione_progress')
        .delete()
        .eq('marketer_id', marketerId)
        .in('item_key', toRemove);
    }
    if (toAdd.length) {
      const { error } = await supabase
        .from('formazione_progress')
        .insert(
          toAdd.map((item_key) => ({ org_id: orgId, marketer_id: marketerId, item_key })),
        );
      if (error) return { ok: false, demo: false };
    }
    return { ok: true, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
