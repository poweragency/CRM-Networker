import 'server-only';
import { getClient } from '@/lib/data/crm-shared';
import { logError } from '@/lib/log';
import type { StartingPackage } from '@/lib/types/db';

/**
 * Per-prospect EXTRA fields shown on the detail page: profilazione (free text),
 * pacchetto scelto and note. Persisted on the `prospects` row (columns profiling /
 * starting_package / notes — see migration 0071); writes go through the in-scope
 * prospects_update RLS policy. In pure demo mode (no env) an in-memory override map
 * keeps a save reflecting within the run. Demo-safe; never throws.
 */

export interface ProspectExtra {
  /** Profilazione — a large free-text profile of the prospect. */
  profiling: string | null;
  /** Pacchetto scelto (package chosen). */
  pack: StartingPackage | null;
  /** Free notes. */
  notes: string | null;
}

const EMPTY: ProspectExtra = { profiling: null, pack: null, notes: null };

/** In-memory edit store (demo-only; resets on server restart). */
const overrides = new Map<string, ProspectExtra>();

/** Resolve the extras for a prospect from its row (demo → in-memory override). */
export async function getProspectExtra(prospectId: string): Promise<ProspectExtra> {
  const supabase = getClient();
  if (!supabase) return overrides.get(prospectId) ?? EMPTY;
  try {
    const { data, error } = await supabase
      .from('prospects')
      .select('profiling,starting_package,notes')
      .eq('id', prospectId)
      .maybeSingle();
    if (error || !data) return EMPTY;
    const r = data as {
      profiling?: string | null;
      starting_package?: string | null;
      notes?: string | null;
    };
    return {
      profiling: r.profiling ?? null,
      pack: (r.starting_package as StartingPackage | null) ?? null,
      notes: r.notes ?? null,
    };
  } catch (e) {
    logError('getProspectExtra', e, { prospectId });
    return EMPTY;
  }
}

export interface SaveProspectExtraResult {
  ok: boolean;
  /** true only when simulated (pure demo mode). */
  demo: boolean;
}

/** Persist the extras onto the prospect row (demo → in-memory). */
export async function setProspectExtra(
  prospectId: string,
  extra: ProspectExtra,
): Promise<SaveProspectExtraResult> {
  const supabase = getClient();
  if (!supabase) {
    overrides.set(prospectId, extra);
    return { ok: true, demo: true };
  }
  try {
    const { error } = await supabase
      .from('prospects')
      .update({
        profiling: extra.profiling,
        starting_package: extra.pack,
        notes: extra.notes,
      })
      .eq('id', prospectId);
    if (error) {
      logError('setProspectExtra', error, { prospectId });
      return { ok: false, demo: false };
    }
    return { ok: true, demo: false };
  } catch (e) {
    logError('setProspectExtra', e, { prospectId });
    return { ok: false, demo: false };
  }
}
