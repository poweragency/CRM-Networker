'use server';

import { updateMarketerExtra, updateMarketerIdentity } from '@/lib/data/team';
import { saveWishlist } from '@/lib/data/wishlist';
import { saveFormazioneProgress } from '@/lib/data/formazione';
import { getCurrentClaims } from '@/lib/data/session';
import { getDmoStatus, toggleDmoTask, type DmoStatus } from '@/lib/data/streak';
import { isSupabaseConfigured } from '@/lib/env';
import type {
  MarketerExtra,
  MarketerRank,
  MarketerStatus,
  WishlistItem,
} from '@/lib/types/db';

/**
 * Server Actions backing the /team/[id] profile editors (anagrafica + 100's
 * list). They delegate to the server-only data layer, which is demo-safe and
 * mock-backed for now (frontend + mock only — no DB columns yet), so they never
 * throw and return a small serializable envelope the client uses to raise the
 * right toast.
 */

/** Re-read the caller's "Catena d'Oro" DMO status (used by the streak modal to
 *  refresh after the user completes a task). Always the CALLER's own status. */
export async function refreshDmoStatusAction(): Promise<DmoStatus> {
  return getDmoStatus();
}

/** Tick/untick one of the caller's 5 manual DMO tasks for today (own DMO only). */
export async function toggleDmoTaskAction(
  column: string,
  value: boolean,
): Promise<DmoStatus> {
  return toggleDmoTask(column, value);
}

export interface SaveAnagraficaResult {
  ok: boolean;
  demo: boolean;
}

export async function saveMarketerAnagrafica(
  id: string,
  patch: Partial<MarketerExtra>,
): Promise<SaveAnagraficaResult> {
  return updateMarketerExtra(id, patch);
}

export interface SaveWishlistActionResult {
  ok: boolean;
  demo: boolean;
}

export async function saveWishlistAction(
  marketerId: string,
  items: WishlistItem[],
): Promise<SaveWishlistActionResult> {
  return saveWishlist(marketerId, items);
}

export interface SaveFormazioneActionResult {
  ok: boolean;
  demo: boolean;
}

/** Persist which formazione items (playlist/libri) a marketer has ticked. */
export async function saveFormazioneAction(
  marketerId: string,
  done: string[],
): Promise<SaveFormazioneActionResult> {
  return saveFormazioneProgress(marketerId, done);
}

export interface SaveIdentityResult {
  ok: boolean;
  demo: boolean;
  /** Set when the caller tried to edit their OWN identity (not allowed). */
  forbidden?: boolean;
}

/**
 * Update a marketer's rank and/or renewal status. A manager can change these for
 * someone in their DOWNLINE, but NEVER for themselves — the server enforces the
 * self-guard regardless of the UI. Demo-safe: records an in-memory identity
 * override so every view reflects it; in production this becomes a guarded
 * rank/status RPC (RLS-scoped to the caller's subtree).
 */
export async function saveMarketerIdentityAction(
  id: string,
  patch: { rank?: MarketerRank; status?: MarketerStatus },
): Promise<SaveIdentityResult> {
  const { claims } = await getCurrentClaims();
  if (claims.marketer_id === id) {
    return { ok: false, demo: !isSupabaseConfigured, forbidden: true };
  }
  const res = await updateMarketerIdentity(id, patch);
  return { ok: res.ok, demo: res.demo };
}
