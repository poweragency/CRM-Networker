'use server';

import { updateMarketerExtra } from '@/lib/data/team';
import { saveWishlist } from '@/lib/data/wishlist';
import type { MarketerExtra, WishlistItem } from '@/lib/types/db';

/**
 * Server Actions backing the /team/[id] profile editors (anagrafica + 100's
 * list). They delegate to the server-only data layer, which is demo-safe and
 * mock-backed for now (frontend + mock only — no DB columns yet), so they never
 * throw and return a small serializable envelope the client uses to raise the
 * right toast.
 */
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
