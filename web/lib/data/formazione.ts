import 'server-only';

/**
 * Formazione progress data access (server-only). The catalog (playlist WOW /
 * Click + libri) is FIXED in code and identical for everyone (see
 * FORMAZIONE_CATALOG in components/team/marketer-formazione); only WHICH items a
 * marketer has ticked as done is per-person. Frontend + mock only for now (no DB
 * table yet): a per-marketer override map keeps a save reflecting within the
 * running server. Demo-safe; never throws.
 */

export interface FormazioneProgressResult {
  /** Catalog IDs the marketer has ticked as visto / letto. */
  done: string[];
  demo: boolean;
}

/** In-memory edit store (mock-only; resets on server restart). */
const overrides = new Map<string, string[]>();

/** The set of ticked items for a marketer (empty until the first save). */
export async function getFormazioneProgress(
  marketerId: string,
): Promise<FormazioneProgressResult> {
  return { done: overrides.get(marketerId) ?? [], demo: true };
}

export interface SaveFormazioneResult {
  ok: boolean;
  /** Always true for now — progress is mock-backed (no DB table yet). */
  demo: boolean;
}

/** Replace the whole ticked set for a marketer (in-memory, demo-safe). */
export async function saveFormazioneProgress(
  marketerId: string,
  done: string[],
): Promise<SaveFormazioneResult> {
  overrides.set(marketerId, done);
  return { ok: true, demo: true };
}
