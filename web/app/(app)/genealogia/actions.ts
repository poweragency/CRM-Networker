'use server';

import {
  getChildren,
  getSubtree,
  searchMarketers,
} from '@/lib/data/genealogy';
import { createMarketer } from '@/lib/data/admin';
import { updateMarketerExtra } from '@/lib/data/team';
import type {
  BranchScope,
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

/** Essential data captured by the tree's "add member" dialog. */
export interface AddMemberInput {
  parentId: string;
  leg: PlacementLeg;
  firstName: string;
  lastName: string;
  /** Starting package (pacchetto) — anagrafica extra. */
  pack: StartingPackage | null;
  /** "click" — accesso alla piattaforma aziendale. */
  click: boolean;
}

export interface AddMemberResult {
  /** The created node, ready to merge into the tree (null on failure). */
  node: TreeNode | null;
  demo: boolean;
  ok: boolean;
}

/**
 * Place a new marketer in an empty leg directly from the tree viewer. Reuses the
 * demo-safe `place_marketer` path (admin layer) and stamps the pacchetto/click
 * extras (mock-backed for now). Returns a TreeNode the client can insert into the
 * canvas immediately. The new member starts at rank `no_rank`, status `active`,
 * sponsored by the parent.
 */
export async function addMarketerAction(
  input: AddMemberInput,
): Promise<AddMemberResult> {
  const created = await createMarketer({
    firstName: input.firstName,
    lastName: input.lastName,
    parentId: input.parentId,
    leg: input.leg,
    sponsorId: input.parentId,
    rank: 'no_rank',
    status: 'active',
  });
  if (!created.ok || !created.id) {
    return { node: null, demo: created.demo, ok: false };
  }

  // Stamp the anagrafica extras chosen in the dialog (frontend + mock for now).
  await updateMarketerExtra(created.id, {
    starting_package: input.pack,
    platform_click: input.click,
  });

  const display = `${input.firstName} ${input.lastName}`.trim();
  const node: TreeNode = {
    id: created.id,
    first_name: input.firstName,
    last_name: input.lastName,
    display_name: display,
    parent_id: input.parentId,
    leg: input.leg,
    sponsor_id: input.parentId,
    rank: 'no_rank',
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
  return { node, demo: created.demo, ok: true };
}
