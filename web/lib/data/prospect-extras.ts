import 'server-only';
import type { StartingPackage } from '@/lib/types/db';

/**
 * Per-prospect EXTRA fields shown on the detail page: profilazione (free text),
 * pacchetto scelto and note. Frontend + mock only for now (no DB columns yet) —
 * kept in an in-memory override map so a save reflects within the running server.
 * Demo-safe; never throws. The base stage/outcome live on the prospect record.
 */

export interface ProspectExtra {
  /** Profilazione — a large free-text profile of the prospect. */
  profiling: string | null;
  /** Pacchetto scelto (package chosen). */
  pack: StartingPackage | null;
  /** Free notes. */
  notes: string | null;
}

const overrides = new Map<string, ProspectExtra>();

/** Resolve the extras for a prospect (override, else empty defaults). */
export function getProspectExtra(prospectId: string): ProspectExtra {
  return (
    overrides.get(prospectId) ?? { profiling: null, pack: null, notes: null }
  );
}

export interface SaveProspectExtraResult {
  ok: boolean;
  /** Always true for now — mock-backed (no DB columns yet). */
  demo: boolean;
}

/** Replace the extras for a prospect (in-memory, demo-safe). */
export function setProspectExtra(
  prospectId: string,
  extra: ProspectExtra,
): SaveProspectExtraResult {
  overrides.set(prospectId, extra);
  return { ok: true, demo: true };
}
