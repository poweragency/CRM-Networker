'use client';

import * as React from 'react';
import type { BranchScope, PlacementLeg, TreeNode } from '@/lib/types/db';
import {
  loadChildrenAction,
  loadSubtreeAction,
  searchMarketersAction,
} from '@/app/(app)/genealogia/actions';

/**
 * Client-side view-model for the binary genealogy (doc 14 §7.3/§7.6).
 *
 * Owns the loaded-node cache (by id), the per-node "expanded" set and the lazy
 * loading that fills children on demand via Server Actions. Collapse is purely
 * client-side (we just remove the node from `expanded`); re-expanding a node whose
 * children are already cached is instant. The hook is scope-aware: switching to a
 * LEFT/RIGHT branch re-roots the visible tree at the chosen-leg child and trims
 * the cross-branch nodes from the active layout window.
 */

export interface UseGenealogyTreeArgs {
  /** Pre-order node list from the initial server render (root + N levels). */
  initialNodes: TreeNode[];
  /** The caller's visible root id. */
  rootId: string;
  /** True when the initial server fetch fell back to mock data. */
  initialDemo: boolean;
}

export interface UseGenealogyTree {
  /** All nodes currently in the layout window (root subtree, scope-filtered). */
  visibleNodes: TreeNode[];
  /** The id the layout is rooted at (own root, or the LEFT/RIGHT child for branch scope). */
  layoutRootId: string | null;
  /** Ids whose children are currently shown. */
  expanded: ReadonlySet<string>;
  /** Any fetch fell back to mock data → show the demo notice. */
  demo: boolean;
  /** A lazy fetch is in flight. */
  loading: boolean;
  isExpanded: (id: string) => boolean;
  hasChildren: (node: TreeNode) => boolean;
  toggle: (node: TreeNode) => void;
  expandAll: () => void;
  collapseAll: () => void;
  /** Ensure a node + its ancestor chain are loaded & expanded (search jump). */
  revealNode: (target: TreeNode) => Promise<void>;
  /** Look a node up in the loaded cache. */
  getNode: (id: string) => TreeNode | undefined;
  search: (q: string) => Promise<TreeNode[]>;
  /** Insert a freshly created child under a parent leg (add-from-tree). */
  addChild: (parentId: string, leg: PlacementLeg, node: TreeNode) => void;
}

function indexById(nodes: Iterable<TreeNode>): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

/** The chosen-leg child of `parentId` from the cache, if loaded. */
function legChild(
  cache: Map<string, TreeNode>,
  parentId: string,
  leg: PlacementLeg,
): TreeNode | undefined {
  for (const n of cache.values()) {
    if (n.parent_id === parentId && n.leg === leg) return n;
  }
  return undefined;
}

export function useGenealogyTree({
  initialNodes,
  rootId,
  initialDemo,
}: UseGenealogyTreeArgs): UseGenealogyTree {
  // Master cache of every node we've ever loaded, keyed by id.
  const [cache, setCache] = React.useState<Map<string, TreeNode>>(() =>
    indexById(initialNodes),
  );
  const [demo, setDemo] = React.useState(initialDemo);
  const [loading, setLoading] = React.useState(false);

  // Initially expand the nodes we already have children for (root + N levels).
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const present = new Set(initialNodes.map((n) => n.id));
    const withVisibleChild = new Set<string>();
    for (const n of initialNodes) {
      if (n.parent_id && present.has(n.parent_id)) withVisibleChild.add(n.parent_id);
    }
    return withVisibleChild;
  });

  const mergeNodes = React.useCallback((incoming: TreeNode[]) => {
    setCache((prev) => {
      const next = new Map(prev);
      for (const n of incoming) {
        // Preserve a richer cached copy if the incoming one lost KPI detail.
        const existing = next.get(n.id);
        next.set(n.id, existing ? { ...existing, ...n } : n);
      }
      return next;
    });
  }, []);

  const getNode = React.useCallback((id: string) => cache.get(id), [cache]);

  const hasChildren = React.useCallback(
    (node: TreeNode) => node.has_left_child || node.has_right_child,
    [],
  );

  const isExpanded = React.useCallback(
    (id: string) => expanded.has(id),
    [expanded],
  );

  // Lazy-load a node's children if not present, then mark it expanded.
  const ensureChildrenLoaded = React.useCallback(
    async (node: TreeNode): Promise<void> => {
      const alreadyLoaded =
        (!node.has_left_child || Boolean(legChild(cache, node.id, 'LEFT'))) &&
        (!node.has_right_child || Boolean(legChild(cache, node.id, 'RIGHT')));
      if (alreadyLoaded) return;

      setLoading(true);
      try {
        const res = await loadChildrenAction(node.id);
        mergeNodes(res.nodes);
        if (res.demo) setDemo(true);
      } finally {
        setLoading(false);
      }
    },
    [cache, mergeNodes],
  );

  const toggle = React.useCallback(
    (node: TreeNode) => {
      if (!hasChildren(node)) return;
      if (expanded.has(node.id)) {
        // Collapse: client-side only.
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
        return;
      }
      // Expand: ensure children are loaded, then mark expanded.
      void ensureChildrenLoaded(node).then(() => {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(node.id);
          return next;
        });
      });
    },
    [expanded, hasChildren, ensureChildrenLoaded],
  );

  const expandAll = React.useCallback(() => {
    setLoading(true);
    void loadSubtreeAction(rootId, 'GLOBAL', 4)
      .then((res) => {
        mergeNodes(res.nodes);
        if (res.demo) setDemo(true);
        setExpanded(() => {
          const ids = new Set<string>();
          for (const n of res.nodes) {
            if (n.has_left_child || n.has_right_child) ids.add(n.id);
          }
          return ids;
        });
      })
      .finally(() => setLoading(false));
  }, [rootId, mergeNodes]);

  const collapseAll = React.useCallback(() => {
    setExpanded(new Set<string>([rootId]));
  }, [rootId]);

  // Reveal a search hit: load the whole subtree once (cheap, bounded), then
  // expand every ancestor on the path from the root down to the target.
  const revealNode = React.useCallback(
    async (target: TreeNode): Promise<void> => {
      setLoading(true);
      try {
        let working = cache;
        if (!working.has(target.id) || !legAncestorsLoaded(working, target, rootId)) {
          const res = await loadSubtreeAction(rootId, 'GLOBAL', 4);
          if (res.demo) setDemo(true);
          working = indexById([...cache.values(), ...res.nodes]);
          mergeNodes(res.nodes);
        }
        // Walk up parent_id from target to root, collecting the chain.
        const chain: string[] = [];
        let cursor: TreeNode | undefined = working.get(target.id);
        let guard = 0;
        while (cursor && guard < 64) {
          chain.push(cursor.id);
          if (cursor.id === rootId || !cursor.parent_id) break;
          cursor = working.get(cursor.parent_id);
          guard += 1;
        }
        setExpanded((prev) => {
          const next = new Set(prev);
          // Expand every ancestor (not the leaf itself unless it has children).
          for (const id of chain) {
            const n = working.get(id);
            if (n && (n.has_left_child || n.has_right_child)) next.add(id);
          }
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    [cache, rootId, mergeNodes],
  );

  const search = React.useCallback(async (q: string): Promise<TreeNode[]> => {
    const needle = q.trim();
    if (!needle) return [];
    const res = await searchMarketersAction(needle);
    if (res.demo) setDemo(true);
    // Fold results into the cache so a jump can resolve without a second fetch.
    mergeNodes(res.nodes);
    return res.nodes;
  }, [mergeNodes]);

  // Insert a freshly created child into the cache and bump the parent's counts /
  // slot flags, then keep the parent expanded so the new node shows immediately.
  const addChild = React.useCallback(
    (parentId: string, leg: PlacementLeg, node: TreeNode) => {
      setCache((prev) => {
        const next = new Map(prev);
        next.set(node.id, { ...node, parent_id: parentId, leg });
        const parent = next.get(parentId);
        if (parent) {
          next.set(parentId, {
            ...parent,
            has_left_child: leg === 'LEFT' ? true : parent.has_left_child,
            has_right_child: leg === 'RIGHT' ? true : parent.has_right_child,
            left_count: leg === 'LEFT' ? parent.left_count + 1 : parent.left_count,
            right_count: leg === 'RIGHT' ? parent.right_count + 1 : parent.right_count,
            team_size: parent.team_size + 1,
            children_loaded: true,
          });
        }
        return next;
      });
      setExpanded((prev) => {
        const nextSet = new Set(prev);
        nextSet.add(parentId);
        return nextSet;
      });
    },
    [],
  );

  // Resolve the layout root + the visible window for the current (handled by the
  // consumer via scope). Here we expose the GLOBAL window; branch trimming is done
  // by the canvas using `layoutRootForScope`.
  const visibleNodes = React.useMemo(
    () => Array.from(cache.values()),
    [cache],
  );

  return {
    visibleNodes,
    layoutRootId: rootId,
    expanded,
    demo,
    loading,
    isExpanded,
    hasChildren,
    toggle,
    expandAll,
    collapseAll,
    revealNode,
    getNode,
    search,
    addChild,
  };
}

/** True if the full ancestor chain of `target` up to `rootId` is in the cache. */
function legAncestorsLoaded(
  cache: Map<string, TreeNode>,
  target: TreeNode,
  rootId: string,
): boolean {
  let cursor: TreeNode | undefined = cache.get(target.id);
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor.id === rootId) return true;
    if (!cursor.parent_id) return false;
    cursor = cache.get(cursor.parent_id);
    guard += 1;
  }
  return false;
}

/**
 * Resolve the id the layout should be rooted at for a given scope: GLOBAL → the
 * own root; LEFT/RIGHT → that leg's child of the own root (or the root itself if
 * the leg is empty, so the view never goes blank). Exposed for the canvas.
 */
export function layoutRootForScope(
  cache: Map<string, TreeNode>,
  rootId: string,
  scope: BranchScope,
): string {
  if (scope === 'GLOBAL') return rootId;
  const child = legChild(cache, rootId, scope === 'LEFT' ? 'LEFT' : 'RIGHT');
  return child?.id ?? rootId;
}
