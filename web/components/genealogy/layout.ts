import { hierarchy, tree, type HierarchyPointNode } from 'd3-hierarchy';
import type { PlacementLeg, TreeNode } from '@/lib/types/db';

/**
 * Tidy binary layout (doc 14 §7.5): a Reingold–Tilford `d3-hierarchy` tree where
 * each node's LEFT child is forced to the left and RIGHT child to the right of the
 * parent. d3 lays children out in array order, so we sort each node's children
 * LEFT-then-RIGHT and, crucially, keep a placeholder slot for a *missing* leg when
 * the sibling on the other leg exists — otherwise a node with only a RIGHT child
 * would render that child centered under the parent instead of skewed right.
 *
 * Pure & framework-agnostic: it consumes the flat node model + the set of
 * currently expanded node ids and returns absolute x/y positions plus the visible
 * parent→child edges. React Flow then mounts only these positioned nodes
 * (server-side lazy expand + client collapse already bound the count — §7.6).
 */

/** Card footprint + spacing used to convert the d3 unit grid to pixels. */
export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 150;
const H_GAP = 40; // horizontal gap between sibling subtrees
const V_GAP = 72; // vertical gap between levels

/** A laid-out node ready to hand to React Flow. */
export interface PositionedNode {
  node: TreeNode;
  x: number;
  y: number;
  depth: number;
  /** Leg relative to the *layout root* chain (for edge coloring). */
  branchLeg: PlacementLeg | null;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  /** Which leg this edge represents, so it can carry the branch color. */
  leg: PlacementLeg | null;
}

export interface LayoutResult {
  positioned: PositionedNode[];
  edges: LayoutEdge[];
  /** Bounding box (pixels) of the whole laid-out tree. */
  bounds: { width: number; height: number };
}

/** Intermediate node fed to d3.hierarchy; placeholders fill an empty leg slot. */
interface LayoutDatum {
  id: string;
  node: TreeNode | null; // null → invisible placeholder keeping the leg side
  leg: PlacementLeg | null;
  children: LayoutDatum[];
}

/**
 * Build the d3 input tree from the flat model, rooted at `rootId`, descending
 * only into nodes whose ids are in `expanded`. A node that is NOT expanded is
 * still rendered (as a leaf with a "+N" affordance) but its children are omitted.
 */
function buildDatum(
  rootId: string,
  byId: Map<string, TreeNode>,
  childrenOf: Map<string, TreeNode[]>,
  expanded: ReadonlySet<string>,
): LayoutDatum | null {
  const root = byId.get(rootId);
  if (!root) return null;

  const make = (n: TreeNode): LayoutDatum => {
    const datum: LayoutDatum = { id: n.id, node: n, leg: n.leg, children: [] };
    if (!expanded.has(n.id)) return datum; // collapsed → render as leaf

    const kids = childrenOf.get(n.id) ?? [];
    const left = kids.find((k) => k.leg === 'LEFT');
    const right = kids.find((k) => k.leg === 'RIGHT');
    if (!left && !right) return datum;

    // Keep both slots so a lone child stays skewed to its true leg side.
    datum.children = [
      left
        ? make(left)
        : ({ id: `${n.id}__phL`, node: null, leg: 'LEFT', children: [] } as LayoutDatum),
      right
        ? make(right)
        : ({ id: `${n.id}__phR`, node: null, leg: 'RIGHT', children: [] } as LayoutDatum),
    ];
    return datum;
  };

  return make(root);
}

/**
 * Compute the binary layout. Returns positioned (real) nodes + edges + bounds.
 * Placeholder slots are dropped from the output but still shape the geometry.
 */
export function layoutTree(
  nodes: readonly TreeNode[],
  rootId: string,
  expanded: ReadonlySet<string>,
): LayoutResult {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, n);

  const childrenOf = new Map<string, TreeNode[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const arr = childrenOf.get(n.parent_id) ?? [];
    arr.push(n);
    childrenOf.set(n.parent_id, arr);
  }
  // Deterministic LEFT-before-RIGHT ordering of each node's children.
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => (a.leg === b.leg ? 0 : a.leg === 'LEFT' ? -1 : 1));
  }

  const datum = buildDatum(rootId, byId, childrenOf, expanded);
  if (!datum) {
    return { positioned: [], edges: [], bounds: { width: 0, height: 0 } };
  }

  const root = hierarchy<LayoutDatum>(datum, (d) => d.children);
  const layout = tree<LayoutDatum>().nodeSize([
    NODE_WIDTH + H_GAP,
    NODE_HEIGHT + V_GAP,
  ]);
  // d3 separation: keep cousins from overlapping but pack siblings tightly.
  layout.separation((a, b) => (a.parent === b.parent ? 1 : 1.25));
  const laid = layout(root);

  // Normalize so the left-most node starts at x≈0.
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  laid.each((d) => {
    if (d.data.node === null) return; // placeholders don't affect visible bounds…
    minX = Math.min(minX, d.x);
    maxX = Math.max(maxX, d.x);
    maxY = Math.max(maxY, d.y);
  });
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    maxY = 0;
  }
  const offsetX = -minX;

  const positioned: PositionedNode[] = [];
  const edges: LayoutEdge[] = [];

  const visit = (d: HierarchyPointNode<LayoutDatum>) => {
    if (d.data.node) {
      positioned.push({
        node: d.data.node,
        x: d.x + offsetX,
        y: d.y,
        depth: d.depth,
        branchLeg: d.data.leg,
      });
    }
    for (const child of d.children ?? []) {
      // Edge only between two *real* nodes.
      if (d.data.node && child.data.node) {
        edges.push({
          id: `${d.data.node.id}->${child.data.node.id}`,
          source: d.data.node.id,
          target: child.data.node.id,
          leg: child.data.leg,
        });
      }
      visit(child);
    }
  };
  visit(laid);

  return {
    positioned,
    edges,
    bounds: {
      width: maxX - minX + NODE_WIDTH,
      height: maxY + NODE_HEIGHT,
    },
  };
}
