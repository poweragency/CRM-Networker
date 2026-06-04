import 'server-only';
import { isSupabaseConfigured } from '@/lib/env';
import type { WishlistItem } from '@/lib/types/db';
import { mockWishlist } from '@/lib/data/mock/wishlist';

/**
 * 100's list (bucket list) data access (server-only). Per-marketer list of the
 * things a person wants to do/have, catalogued nearest → furthest. Frontend +
 * mock only for now (no DB table yet): a deterministic default seeds the demo
 * caller, and edits are kept in an in-memory override map so a save reflects
 * within the running server. Demo-safe; never throws.
 */

export interface WishlistResult {
  items: WishlistItem[];
  demo: boolean;
}

/** In-memory edit store (mock-only; resets on server restart). */
const overrides = new Map<string, WishlistItem[]>();

/** The 100's list for a marketer (override wins over the mock default). */
export async function getWishlist(marketerId: string): Promise<WishlistResult> {
  const override = overrides.get(marketerId);
  if (override) return { items: override, demo: !isSupabaseConfigured };
  // Connected: persistence isn't wired to wishlist_items yet → start EMPTY (no
  // fake items). Pure demo mode (no env) seeds the sample list for the showcase.
  if (isSupabaseConfigured) return { items: [], demo: false };
  return { items: mockWishlist(marketerId), demo: true };
}

export interface SaveWishlistResult {
  ok: boolean;
  /** Always true for now — the list is mock-backed (no DB table yet). */
  demo: boolean;
}

/** Replace the whole 100's list for a marketer (in-memory, demo-safe). */
export async function saveWishlist(
  marketerId: string,
  items: WishlistItem[],
): Promise<SaveWishlistResult> {
  overrides.set(marketerId, items);
  return { ok: true, demo: true };
}
