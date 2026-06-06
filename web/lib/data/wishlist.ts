import 'server-only';
import type { WishlistItem, WishlistHorizon } from '@/lib/types/db';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { mockWishlist } from '@/lib/data/mock/wishlist';

/**
 * 100's list (bucket list) data access (server-only). Per-marketer list of the
 * things a person wants to do/have, catalogued nearest → furthest. Persisted in
 * `wishlist_items` (RLS-scoped to the owner's visible subtree). In pure demo mode
 * (no env) a deterministic default seeds the demo caller and edits are kept in an
 * in-memory override map. Never throws.
 */

export interface WishlistResult {
  items: WishlistItem[];
  demo: boolean;
}

/** In-memory edit store (demo-only; resets on server restart). */
const overrides = new Map<string, WishlistItem[]>();

const ROW = 'id,title,horizon,done,position';

/** The 100's list for a marketer (position-ordered). */
export async function getWishlist(marketerId: string): Promise<WishlistResult> {
  const supabase = getClient();
  if (!supabase) {
    return { items: overrides.get(marketerId) ?? mockWishlist(marketerId), demo: true };
  }
  try {
    const { data, error } = await supabase
      .from('wishlist_items')
      .select(ROW)
      .eq('owner_marketer_id', marketerId)
      .is('deleted_at', null)
      .order('position', { ascending: true });
    if (error || !data) return { items: [], demo: false };
    const items: WishlistItem[] = (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      horizon: (r.horizon as WishlistHorizon) ?? 'vicino',
      done: Boolean(r.done),
    }));
    return { items, demo: false };
  } catch {
    return { items: [], demo: false };
  }
}

export interface SaveWishlistResult {
  ok: boolean;
  /** true only when simulated (pure demo mode). */
  demo: boolean;
}

/** Replace the whole 100's list for a marketer (demo = in-memory). */
export async function saveWishlist(
  marketerId: string,
  items: WishlistItem[],
): Promise<SaveWishlistResult> {
  const { demo } = await getOwnerContext();
  const supabase = getClient();
  if (!supabase || demo) {
    overrides.set(marketerId, items);
    return { ok: true, demo: true };
  }
  try {
    // Atomic replace via the replace_wishlist RPC (delete + insert in ONE
    // transaction; see migration 0051). Removes the data-loss window of the old
    // separate delete-then-insert. Ordering is the array order (RPC uses ORDINALITY).
    const { error } = await supabase.rpc('replace_wishlist', {
      p_owner: marketerId,
      p_items: items.map((it) => ({
        title: it.title,
        horizon: it.horizon,
        done: it.done,
      })),
    });
    if (error) return { ok: false, demo: false };
    return { ok: true, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
