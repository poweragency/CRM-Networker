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
import { useTranslations } from 'next-intl';
import type { BranchScope, PlacementLeg, TreeNode } from '@/lib/types/db';
import { MarketerNode, type MarketerNodeData } from './marketer-node';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutTree,
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

const NODE_TYPES = { marketer: MarketerNode } as const;
/** Above this visible-node count we drop heavyweight chrome for performance. */
const PERF_THRESHOLD = 600;

const legStroke: Record<'root' | PlacementLeg, string> = {
  root: 'hsl(var(--branch-global))',
  LEFT: 'hsl(var(--branch-left))',
  RIGHT: 'hsl(var(--branch-right))',
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
}

/** Build React Flow nodes/edges from the positioned layout. */
function toFlow(
  positioned: PositionedNode[],
  edges: { id: string; source: string; target: string; leg: PlacementLeg | null }[],
  ctx: {
    selectedId: string | null;
    expanded: ReadonlySet<string>;
    animate: boolean;
    onSelect: (n: TreeNode) => void;
    onToggle: (n: TreeNode) => void;
    hasChildren: (n: TreeNode) => boolean;
  },
): { rfNodes: Node<MarketerNodeData>[]; rfEdges: Edge[] } {
  const rfNodes: Node<MarketerNodeData>[] = positioned.map((p) => ({
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

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: ctx.animate,
    style: {
      stroke: legStroke[e.leg ?? 'root'],
      strokeWidth: 1.75,
      opacity: 0.55,
    },
  }));

  return { rfNodes, rfEdges };
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
  }: GenealogyCanvasProps,
  ref: React.Ref<GenealogyCanvasHandle>,
) {
  const t = useTranslations('genealogia');
  const rf = useReactFlow();

  // Compute layout (memoized on the inputs that affect geometry).
  const { positioned, edges } = React.useMemo(
    () => layoutTree(nodes, layoutRootId, expanded),
    [nodes, layoutRootId, expanded],
  );

  const animate = positioned.length <= 80;
  const showMinimap = positioned.length <= PERF_THRESHOLD;

  const { rfNodes, rfEdges } = React.useMemo(
    () =>
      toFlow(positioned, edges, {
        selectedId,
        expanded,
        animate,
        onSelect,
        onToggle,
        hasChildren,
      }),
    [positioned, edges, selectedId, expanded, animate, onSelect, onToggle, hasChildren],
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
    <div className="relative h-full w-full">
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
        className="bg-transparent [&_.react-flow__attribution]:hidden"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          className="!bg-muted/30"
          color="hsl(var(--border))"
        />
        <Controls
          showInteractive={false}
          className="!rounded-lg !border !border-border !bg-card !shadow-md [&_button]:!border-border [&_button]:!bg-card [&_button]:!text-foreground [&_button:hover]:!bg-muted [&_svg]:!fill-current"
        />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            ariaLabel={t('fit_view')}
            className="!rounded-lg !border !border-border !bg-card !shadow-md"
            maskColor="hsl(var(--muted) / 0.6)"
            nodeColor={(n) => {
              const leg = (n.data as unknown as MarketerNodeData)?.branchLeg;
              return legStroke[leg ?? 'root'];
            }}
            nodeStrokeWidth={2}
          />
        )}
      </ReactFlow>

      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl border bg-card px-6 py-5 text-center shadow-sm">
            <p className="text-sm font-medium text-foreground">
              {t('empty_title')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
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
