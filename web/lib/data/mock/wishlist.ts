import type { WishlistItem } from '@/lib/types/db';
import { MOCK_ROOT_ID } from '@/lib/data/mock-genealogy';

/**
 * Demo "100's list" (bucket list) entries — the things a person wants to do/have,
 * catalogued from nearest to furthest. Only the demo caller (root) has a seeded
 * list so the editor's filled state is exercisable; everyone else starts empty.
 * Frontend + mock only (no DB table yet). Pure & deterministic.
 */

const ROOT_WISHLIST: WishlistItem[] = [
  { id: 'wl-1', title: 'Comprare una macchina nuova', horizon: 'vicino', done: false },
  { id: 'wl-2', title: 'Viaggio a New York', horizon: 'vicino', done: true },
  { id: 'wl-3', title: 'Estinguere il mutuo', horizon: 'medio', done: false },
  { id: 'wl-4', title: 'Comprare casa al mare', horizon: 'medio', done: false },
  { id: 'wl-5', title: 'Comprare uno yacht', horizon: 'lontano', done: false },
  { id: 'wl-6', title: 'Raggiungere la libertà finanziaria', horizon: 'lontano', done: false },
];

/** Deterministic, demo-only 100's list for a marketer id. */
export function mockWishlist(marketerId: string): WishlistItem[] {
  return marketerId === MOCK_ROOT_ID ? ROOT_WISHLIST.map((i) => ({ ...i })) : [];
}
