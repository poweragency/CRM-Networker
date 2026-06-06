'use server';

import {
  getChildren,
  getSubtree,
  searchMarketers,
  TREE_LOAD_DEPTH,
} from '@/lib/data/genealogy';
import { updateMarketerExtra } from '@/lib/data/team';
import { createMarketer, removeMarketer } from '@/lib/data/admin';
import { activateCrmAccess, revokeAccountForMarketer } from '@/lib/data/account';
import { getAdminClient } from '@/lib/supabase/admin';
import { addRuntimeNode, nextRuntimeId } from '@/lib/data/mock/runtime';
import { isSupabaseConfigured } from '@/lib/env';
import type {
  BranchScope,
  MarketerRank,
  PlacementLeg,
  StartingPackage,
  TreeNode,
} from '@/lib/types/db';

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
  maxDepth = TREE_LOAD_DEPTH,
): Promise<ActionResult> {
  const { data, demo } = await getSubtree(rootId, scope, maxDepth);
  return { nodes: data, demo };
}

/** Trigram name search within the caller's visible subtree. */
export async function searchMarketersAction(q: string): Promise<ActionResult> {
  const { data, demo } = await searchMarketers(q);
  return { nodes: data, demo };
}

/** Essential data captured by the tree's "add member" dialog. */
export interface AddMemberInput {
  parentId: string;
  leg: PlacementLeg;
  firstName: string;
  lastName: string;
  /** Starting rank chosen at creation. */
  rank: MarketerRank;
  /** Starting package (pacchetto) — anagrafica extra. */
  pack: StartingPackage | null;
  /** "click" — accesso alla piattaforma aziendale. */
  click: boolean;
  /** Login created up-front for the new member (auth user + membership). */
  email: string;
  password: string;
}

export interface AddMemberResult {
  /** The created node, ready to merge into the tree (null on failure). */
  node: TreeNode | null;
  demo: boolean;
  ok: boolean;
  /** Why account creation failed (so the dialog can show the right message). */
  error?: 'email_taken' | 'service_missing' | 'weak_password' | 'failed';
}

/**
 * Place a new marketer in an empty leg directly from the tree viewer. Writes to
 * the shared demo RUNTIME store (`lib/data/mock/runtime.ts`) so the new member is
 * immediately visible everywhere the data layer reads — the Binary Viewer (incl.
 * on reload), Statistiche and Presenze — not just in the client tree cache. Also
 * stamps the pacchetto/click extras. The member starts at rank `no_rank`, status
 * `active`, sponsored by the parent. In-memory (resets on restart) until a DB
 * lands, at which point this becomes the `place_marketer` RPC call.
 */
export async function addMarketerAction(
  input: AddMemberInput,
): Promise<AddMemberResult> {
  const display = `${input.firstName} ${input.lastName}`.trim();

  // LIVE: persist the new member via the RLS-bound data layer (direct INSERT;
  // triggers build the ltree path + closure). The new member starts at the entry
  // rank `executive` (the DB enum has no `no_rank`), status `active`, sponsored by
  // the parent. Anagrafica extras (pacchetto/click) have no DB columns yet, so
  // they remain in the in-memory override store.
  if (isSupabaseConfigured) {
    const res = await createMarketer({
      firstName: input.firstName,
      lastName: input.lastName,
      parentId: input.parentId,
      leg: input.leg,
      sponsorId: input.parentId,
      rank: input.rank,
      status: 'active',
    });
    if (!res.ok || !res.id) return { node: null, demo: false, ok: false };

    await updateMarketerExtra(res.id, {
      starting_package: input.pack,
      platform_click: input.click,
    });

    // Create the login (auth user + active membership) for the new member.
    const acc = await activateCrmAccess(res.id, input.email, input.password);
    if (!acc.ok) {
      // Roll back the half-created marketer (+ its closure) so the admin can retry.
      const admin = getAdminClient();
      if (admin) {
        await admin.from('marketer_tree_closure').delete().eq('descendant_id', res.id);
        await admin.from('marketer_tree_closure').delete().eq('ancestor_id', res.id);
        await admin
          .from('marketers')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', res.id);
      }
      return {
        node: null,
        demo: false,
        ok: false,
        error:
          acc.error === 'email_taken'
            ? 'email_taken'
            : acc.error === 'service_missing'
              ? 'service_missing'
              : acc.error === 'weak_password'
                ? 'weak_password'
                : 'failed',
      };
    }

    const node: TreeNode = {
      id: res.id,
      first_name: input.firstName,
      last_name: input.lastName,
      display_name: display,
      parent_id: input.parentId,
      leg: input.leg,
      sponsor_id: input.parentId,
      rank: input.rank,
      status: 'active',
      team_size: 0,
      left_count: 0,
      right_count: 0,
      has_left_child: false,
      has_right_child: false,
      activity: 'cold',
      kpis: { prospects: 0, calls: 0, iscrizioni: 0, conversion_rate: 0 },
      children_loaded: true,
    };
    return { node, demo: false, ok: true };
  }

  // DEMO (no env): in-memory runtime store, resets on restart.
  const id = nextRuntimeId();
  const node: TreeNode = {
    id,
    first_name: input.firstName,
    last_name: input.lastName,
    display_name: display,
    parent_id: input.parentId,
    leg: input.leg,
    sponsor_id: input.parentId,
    rank: input.rank,
    status: 'active',
    team_size: 0,
    left_count: 0,
    right_count: 0,
    has_left_child: false,
    has_right_child: false,
    activity: 'cold',
    kpis: { prospects: 0, calls: 0, iscrizioni: 0, conversion_rate: 0 },
    children_loaded: true,
  };
  addRuntimeNode(node);
  await updateMarketerExtra(id, {
    starting_package: input.pack,
    platform_click: input.click,
  });
  return { node, demo: true, ok: true };
}

export interface RemoveMemberResult {
  ok: boolean;
  demo: boolean;
}

/**
 * Remove a member from the tree, reattaching its single downline to the parent.
 * Refuses (server-side) when the node has people on BOTH legs, is the root, or is
 * the caller. Visibility-gated by RLS (anyone can prune within their subtree).
 */
export async function removeMarketerAction(nodeId: string): Promise<RemoveMemberResult> {
  const res = await removeMarketer(nodeId);
  // On a real (configured) removal, also revoke the removed person's login so a
  // deleted member can no longer access the app (best-effort, service-role).
  if (res.ok && !res.demo) {
    await revokeAccountForMarketer(nodeId);
  }
  return res;
}
