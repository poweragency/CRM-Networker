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

/** A laid-out "+" add-slot for an empty placement leg (add-a-member affordance). */
export interface PositionedAddSlot {
  id: string;
  parentId: string;
  leg: PlacementLeg;
  x: number;
  y: number;
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
  /** Empty-leg add-slots for the targeted node (see `addSlotsFor`). */
  addSlots: PositionedAddSlot[];
  edges: LayoutEdge[];
  /** Bounding box (pixels) of the whole laid-out tree. */
  bounds: { width: number; height: number };
}

/** Intermediate node fed to d3.hierarchy; placeholders fill an empty leg slot. */
interface LayoutDatum {
  id: string;
  node: TreeNode | null; // null → invisible placeholder keeping the leg side
  leg: PlacementLeg | null;
  /** Present → this datum is a "+" add-slot (an empty, fillable leg). */
  add?: { parentId: string; leg: PlacementLeg };
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
  addSlotsFor: string | null,
): LayoutDatum | null {
  const root = byId.get(rootId);
  if (!root) return null;

  const phantom = (id: string, leg: PlacementLeg): LayoutDatum => ({
    id,
    node: null,
    leg,
    children: [],
  });
  const addSlot = (parentId: string, leg: PlacementLeg): LayoutDatum => ({
    id: `${parentId}__add_${leg}`,
    node: null,
    leg,
    add: { parentId, leg },
    children: [],
  });

  const make = (n: TreeNode): LayoutDatum => {
    const datum: LayoutDatum = { id: n.id, node: n, leg: n.leg, children: [] };
    const isExpanded = expanded.has(n.id);
    const isTarget = n.id === addSlotsFor;
    // A collapsed, non-targeted node renders as a leaf (children hidden).
    if (!isExpanded && !isTarget) return datum;

    const kids = childrenOf.get(n.id) ?? [];
    const left = isExpanded ? kids.find((k) => k.leg === 'LEFT') : undefined;
    const right = isExpanded ? kids.find((k) => k.leg === 'RIGHT') : undefined;

    // An empty leg of the targeted node becomes a fillable "+" add-slot.
    const addLeft = isTarget && !left && !n.has_left_child;
    const addRight = isTarget && !right && !n.has_right_child;

    if (!left && !right && !addLeft && !addRight) return datum; // nothing below

    const slot = (
      child: TreeNode | undefined,
      add: boolean,
      leg: PlacementLeg,
    ): LayoutDatum =>
      child
        ? make(child)
        : add
          ? addSlot(n.id, leg)
          : phantom(`${n.id}__ph_${leg}`, leg);

    // Keep both slots so a lone child/slot stays skewed to its true leg side.
    datum.children = [
      slot(left, addLeft, 'LEFT'),
      slot(right, addRight, 'RIGHT'),
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
  /** Node id whose empty legs render as "+" add-slots (null = none). */
  addSlotsFor: string | null = null,
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

  const datum = buildDatum(rootId, byId, childrenOf, expanded, addSlotsFor);
  if (!datum) {
    return { positioned: [], addSlots: [], edges: [], bounds: { width: 0, height: 0 } };
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
    // Real nodes AND add-slots count toward bounds; pure placeholders don't.
    if (d.data.node === null && !d.data.add) return;
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
  const addSlots: PositionedAddSlot[] = [];
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
    } else if (d.data.add) {
      addSlots.push({
        id: d.data.id,
        parentId: d.data.add.parentId,
        leg: d.data.add.leg,
        x: d.x + offsetX,
        y: d.y,
      });
    }
    for (const child of d.children ?? []) {
      // Edge between a real node and either a real child or an add-slot.
      if (d.data.node && child.data.node) {
        edges.push({
          id: `${d.data.node.id}->${child.data.node.id}`,
          source: d.data.node.id,
          target: child.data.node.id,
          leg: child.data.leg,
        });
      } else if (d.data.node && child.data.add) {
        edges.push({
          id: `${d.data.node.id}->${child.data.id}`,
          source: d.data.node.id,
          target: child.data.id,
          leg: child.data.add.leg,
        });
      }
      visit(child);
    }
  };
  visit(laid);

  return {
    positioned,
    addSlots,
    edges,
    bounds: {
      width: maxX - minX + NODE_WIDTH,
      height: maxY + NODE_HEIGHT,
    },
  };
}
