'use server';

import {
  getChildren,
  getSubtree,
  searchMarketers,
} from '@/lib/data/genealogy';
import type { BranchScope, TreeNode } from '@/lib/types/db';

/**
 * Server Actions backing the genealogy lazy-loading + search UI (doc 14 §7.3).
 * They delegate to the server-only data layer (`lib/data/genealogy.ts`), which is
 * itself demo-safe: when Supabase env is missing OR a query throws it returns the
 * mock tree, so these actions never crash and the client always receives data.
 *
 * Each result carries a `demo` flag so the client can surface the config-notice
 * pattern if any fetch fell back to mock data after the initial server render.
 */

export interface ActionResult {
  nodes: TreeNode[];
  demo: boolean;
}

/** Expand one node: fetch its ≤2 direct children (the primary lazy step). */
export async function loadChildrenAction(parentId: string): Promise<ActionResult> {
  const { data, demo } = await getChildren(parentId);
  return { nodes: data, demo };
}

/**
 * Expand a whole branch / prefetch a bounded subtree under a node. `scope`
 * filters LEFT/RIGHT (root always included); GLOBAL returns the full window.
 */
export async function loadSubtreeAction(
  rootId: string,
  scope: BranchScope,
  maxDepth = 4,
): Promise<ActionResult> {
  const { data, demo } = await getSubtree(rootId, scope, maxDepth);
  return { nodes: data, demo };
}

/** Trigram name search within the caller's visible subtree. */
export async function searchMarketersAction(q: string): Promise<ActionResult> {
  const { data, demo } = await searchMarketers(q);
  return { nodes: data, demo };
}
