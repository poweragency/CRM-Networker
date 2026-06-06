'use client';

import * as React from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BranchScope, PlacementLeg, TreeNode } from '@/lib/types/db';
import { MarketerNode, type MarketerNodeData } from './marketer-node';
import { AddSlotNode, type AddSlotNodeData } from './add-slot-node';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutTree,
  type PositionedAddSlot,
  type PositionedNode,
} from './layout';

/**
 * The interactive binary-tree canvas (doc 14 §7.5/§7.6).
 *
 * - d3-hierarchy tidy layout (LEFT forced left, RIGHT forced right) → React Flow
 *   nodes/edges; pan/zoom/drag, fit-view, a minimap and a controls bar are all
 *   provided by React Flow over our positioned geometry.
 * - Nodes are STATIC (not draggable): the layout is the single source of truth, so
 *   the tree never reflows under the cursor. Clicking a node selects it (opens the
 *   detail panel); pan/zoom move the whole canvas. Placement MOVE (drag-to-replace)
 *   is operator/admin-driven and intentionally not wired here.
 * - Performance: only nodes inside the *expanded* window are ever laid out
 *   (server-side lazy expand + client collapse), and beyond a threshold the canvas
 *   suppresses the minimap/animated edges to stay light (doc 14 §7.6).
 *
 * The parent passes the flat node window + the expanded set; the canvas owns no
 * data, only the React Flow view of it.
 */

const NODE_TYPES = { marketer: MarketerNode, add: AddSlotNode } as const;
/** Above this visible-node count we drop heavyweight chrome for performance. */
const PERF_THRESHOLD = 600;

// AA-safe stroke/marker colors: use the *-foreground branch tokens so thin
// connectors and minimap dots keep enough contrast on the canvas background.
const legStroke: Record<'root' | PlacementLeg, string> = {
  root: 'hsl(var(--branch-global))',
  LEFT: 'hsl(var(--branch-left-foreground))',
  RIGHT: 'hsl(var(--branch-right-foreground))',
};

export interface GenealogyCanvasHandle {
  fitView: () => void;
  centerOn: (id: string) => void;
}

export interface GenealogyCanvasProps {
  /** Every loaded node (full cache). */
  nodes: TreeNode[];
  /** Id the layout is rooted at for the active scope. */
  layoutRootId: string;
  scope: BranchScope;
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  onToggle: (node: TreeNode) => void;
  hasChildren: (node: TreeNode) => boolean;
  /** Node id whose empty legs render as "+" add-slots (null = none). */
  addSlotsForId: string | null;
  /** Open the add-member dialog for an empty (parent, leg) slot. */
  onAddSlot: (parentId: string, leg: PlacementLeg) => void;
}

/** Build React Flow nodes/edges from the positioned layout. */
function toFlow(
  positioned: PositionedNode[],
  addSlots: PositionedAddSlot[],
  edges: { id: string; source: string; target: string; leg: PlacementLeg | null }[],
  ctx: {
    selectedId: string | null;
    expanded: ReadonlySet<string>;
    animate: boolean;
    onSelect: (n: TreeNode) => void;
    onToggle: (n: TreeNode) => void;
    hasChildren: (n: TreeNode) => boolean;
    onAddSlot: (parentId: string, leg: PlacementLeg) => void;
  },
): { rfNodes: Node<MarketerNodeData | AddSlotNodeData>[]; rfEdges: Edge[] } {
  const marketerNodes: Node<MarketerNodeData>[] = positioned.map((p) => ({
    id: p.node.id,
    type: 'marketer',
    position: { x: p.x, y: p.y },
    // React Flow needs explicit dimensions for fitView/minimap math.
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    selectable: true,
    draggable: false,
    selected: ctx.selectedId === p.node.id,
    data: {
      node: p.node,
      branchLeg: p.branchLeg,
      selected: ctx.selectedId === p.node.id,
      expanded: ctx.expanded.has(p.node.id),
      hasChildren: ctx.hasChildren(p.node),
      onSelect: ctx.onSelect,
      onToggle: ctx.onToggle,
    },
  }));

  const addNodes: Node<AddSlotNodeData>[] = addSlots.map((s) => ({
    id: s.id,
    type: 'add',
    position: { x: s.x, y: s.y },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    selectable: false,
    draggable: false,
    data: { parentId: s.parentId, leg: s.leg, onAdd: ctx.onAddSlot },
  }));

  const rfEdges: Edge[] = edges.map((e) => {
    const isAdd = e.target.includes('__add_');
    // Focus: when a node is selected, the edges touching it read brighter and
    // thicker; everything else recedes so the active lineage pops (doc 14 §7.6).
    const touchesSelected =
      ctx.selectedId != null &&
      (e.source === ctx.selectedId || e.target === ctx.selectedId);
    const dimmed = ctx.selectedId != null && !touchesSelected && !isAdd;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: (ctx.animate || touchesSelected) && !isAdd,
      style: {
        stroke: legStroke[e.leg ?? 'root'],
        strokeWidth: touchesSelected ? 2.75 : 1.75,
        opacity: isAdd ? 0.4 : dimmed ? 0.22 : touchesSelected ? 0.95 : 0.6,
        strokeDasharray: isAdd ? '4 4' : undefined,
        transition: 'stroke-width 150ms ease, opacity 150ms ease',
      },
    };
  });

  return { rfNodes: [...marketerNodes, ...addNodes], rfEdges };
}

function CanvasInner(
  {
    nodes,
    layoutRootId,
    scope,
    expanded,
    selectedId,
    onSelect,
    onToggle,
    hasChildren,
    addSlotsForId,
    onAddSlot,
  }: GenealogyCanvasProps,
  ref: React.Ref<GenealogyCanvasHandle>,
) {
  const t = useTranslations('genealogia');
  const rf = useReactFlow();

  // Compute layout (memoized on the inputs that affect geometry).
  const { positioned, addSlots, edges } = React.useMemo(
    () => layoutTree(nodes, layoutRootId, expanded, addSlotsForId),
    [nodes, layoutRootId, expanded, addSlotsForId],
  );

  const animate = positioned.length <= 80;
  const showMinimap = positioned.length <= PERF_THRESHOLD;

  const { rfNodes, rfEdges } = React.useMemo(
    () =>
      toFlow(positioned, addSlots, edges, {
        selectedId,
        expanded,
        animate,
        onSelect,
        onToggle,
        hasChildren,
        onAddSlot,
      }),
    [
      positioned,
      addSlots,
      edges,
      selectedId,
      expanded,
      animate,
      onSelect,
      onToggle,
      hasChildren,
      onAddSlot,
    ],
  );

  // Controlled node/edge state so nodes stay draggable for inspection while the
  // layout remains the source of truth: whenever the computed flow changes
  // (data / scope / expand-collapse) we re-sync the React Flow state.
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(rfNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(rfEdges);

  React.useEffect(() => {
    setFlowNodes(rfNodes);
  }, [rfNodes, setFlowNodes]);
  React.useEffect(() => {
    setFlowEdges(rfEdges);
  }, [rfEdges, setFlowEdges]);

  // Imperative handle: fit + center, used by the toolbar and search jump.
  React.useImperativeHandle(
    ref,
    () => ({
      fitView: () => rf.fitView({ padding: 0.2, duration: 400, maxZoom: 1 }),
      centerOn: (id: string) => {
        const target = positioned.find((p) => p.node.id === id);
        if (!target) return;
        rf.setCenter(target.x + NODE_WIDTH / 2, target.y + NODE_HEIGHT / 2, {
          zoom: 1,
          duration: 500,
        });
      },
    }),
    [rf, positioned],
  );

  // Re-fit when the layout root or scope changes (branch switch / re-root).
  const fitKey = `${layoutRootId}:${scope}`;
  const lastFit = React.useRef<string>('');
  React.useEffect(() => {
    if (lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    // Defer so React Flow has measured the new nodes.
    const id = window.setTimeout(
      () => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1 }),
      60,
    );
    return () => window.clearTimeout(id);
  }, [fitKey, rf]);

  const handleNodeClick = React.useCallback<NodeMouseHandler>(
    (_event, node) => {
      const data = node.data as unknown as MarketerNodeData;
      if (data?.node) onSelect(data.node);
    },
    [onSelect],
  );

  const empty = positioned.length === 0;

  return (
    <div className="surface-grid relative h-full w-full bg-muted/20">
      {/* Soft radial vignette so the canvas reads as a deep, lit stage. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent_40%,hsl(var(--background)/0.55)_100%)]"
      />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable={false}
        nodeTypes={NODE_TYPES}
        onInit={(instance) => {
          instance.fitView({ padding: 0.2, maxZoom: 1 });
        }}
        onNodeClick={handleNodeClick}
        onPaneClick={() => {
          /* clicking empty canvas keeps the selection; panel close is explicit */
        }}
        minZoom={0.15}
        maxZoom={1.75}
        // Only mount nodes whose box intersects the viewport (viewport culling).
        onlyRenderVisibleElements
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        className="relative z-[1] bg-transparent [&_.react-flow__attribution]:hidden"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.25}
          className="!bg-transparent"
          color="hsl(var(--border))"
        />
        <Controls
          showInteractive={false}
          className="!overflow-hidden !rounded-xl !border !border-border !bg-card/90 !shadow-lg !backdrop-blur [&_button]:!border-border/60 [&_button]:!bg-transparent [&_button]:!text-muted-foreground [&_button:hover]:!bg-primary/10 [&_button:hover]:!text-primary [&_svg]:!fill-current"
        />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            ariaLabel={t('fit_view')}
            className="!rounded-xl !border !border-border !bg-card/85 !shadow-lg !backdrop-blur"
            maskColor="hsl(var(--background) / 0.7)"
            maskStrokeColor="hsl(var(--ring))"
            nodeColor={(n) => {
              const leg = (n.data as unknown as MarketerNodeData)?.branchLeg;
              return legStroke[leg ?? 'root'];
            }}
            nodeBorderRadius={4}
            nodeStrokeWidth={2.5}
          />
        )}
      </ReactFlow>

      {empty && (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
          <div className="glass animate-scale-in rounded-2xl border border-border/60 px-8 py-7 text-center shadow-xl ring-1 ring-white/5">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
              <Users className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-foreground">
              {t('empty_title')}
            </p>
            <p className="mt-1.5 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
              {t('empty_body')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const ForwardedCanvasInner = React.forwardRef(CanvasInner);

/** Public canvas: wraps the inner flow in its own ReactFlowProvider. */
export const GenealogyCanvas = React.forwardRef<
  GenealogyCanvasHandle,
  GenealogyCanvasProps
>(function GenealogyCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <ForwardedCanvasInner {...props} ref={ref} />
    </ReactFlowProvider>
  );
});
