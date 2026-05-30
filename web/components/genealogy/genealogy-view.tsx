'use client';

import * as React from 'react';
import '@xyflow/react/dist/style.css';
import { useScope } from '@/lib/scope/scope-provider';
import { ConfigNotice } from '@/components/config-notice';
import { Card } from '@/components/ui/card';
import type { SessionClaims, TreeNode } from '@/lib/types/db';
import {
  layoutRootForScope,
  useGenealogyTree,
} from './use-genealogy-tree';
import { GenealogyToolbar } from './genealogy-toolbar';
import { BranchSummary } from './branch-summary';
import { NodeDetailPanel } from './node-detail-panel';
import { canActivateCrm } from './permissions';
import {
  GenealogyCanvas,
  type GenealogyCanvasHandle,
} from './genealogy-canvas';

/**
 * Client orchestrator for /genealogia. Wires the scope provider (Global | Sinistra
 * | Destra), the lazy-loading tree model, the React Flow canvas, the toolbar
 * (search + controls), the per-branch summary and the side detail panel.
 *
 * The view is fully demo-safe: it is seeded with the server's initial node window
 * (mock tree when env is missing) and every subsequent fetch goes through Server
 * Actions that themselves fall back to mock data, so it never crashes and shows
 * the discreet demo notice whenever any fetch degraded.
 */

export interface GenealogyViewProps {
  initialNodes: TreeNode[];
  rootId: string;
  initialDemo: boolean;
  claims: Pick<SessionClaims, 'role' | 'rank'>;
}

export function GenealogyView({
  initialNodes,
  rootId,
  initialDemo,
  claims,
}: GenealogyViewProps) {
  const { scope } = useScope();
  const tree = useGenealogyTree({ initialNodes, rootId, initialDemo });
  const canvasRef = React.useRef<GenealogyCanvasHandle>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // The layout root depends on the active scope: GLOBAL → own root; a branch →
  // that leg's child (computed over the cached adjacency).
  const layoutRootId = React.useMemo(() => {
    const byId = new Map(tree.visibleNodes.map((n) => [n.id, n] as const));
    return layoutRootForScope(byId, rootId, scope);
  }, [tree.visibleNodes, rootId, scope]);

  const selectedNode = selectedId ? tree.getNode(selectedId) ?? null : null;
  const canActivate = canActivateCrm(claims);

  const handleSelect = React.useCallback((node: TreeNode) => {
    setSelectedId(node.id);
  }, []);

  const handlePick = React.useCallback(
    async (node: TreeNode) => {
      await tree.revealNode(node);
      setSelectedId(node.id);
      // Center after the layout has incorporated the revealed chain.
      window.setTimeout(() => canvasRef.current?.centerOn(node.id), 120);
    },
    [tree],
  );

  const handleLocate = React.useCallback((node: TreeNode) => {
    canvasRef.current?.centerOn(node.id);
  }, []);

  const handleFit = React.useCallback(() => {
    canvasRef.current?.fitView();
  }, []);

  return (
    <div className="space-y-4">
      {tree.demo && <ConfigNotice variant="inline" />}

      <GenealogyToolbar
        onSearch={tree.search}
        onPick={handlePick}
        onExpandAll={tree.expandAll}
        onCollapseAll={tree.collapseAll}
        onFitView={handleFit}
        loading={tree.loading}
      />

      <BranchSummary
        nodes={tree.visibleNodes}
        rootId={rootId}
        scope={scope}
      />

      {/* Canvas + detail panel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="relative h-[600px] overflow-hidden p-0">
          <GenealogyCanvas
            ref={canvasRef}
            nodes={tree.visibleNodes}
            layoutRootId={layoutRootId}
            scope={scope}
            expanded={tree.expanded}
            selectedId={selectedId}
            onSelect={handleSelect}
            onToggle={tree.toggle}
            hasChildren={tree.hasChildren}
          />
        </Card>

        {/* Detail panel: inline column on desktop, slide-over on mobile. */}
        {selectedNode && (
          <>
            <Card className="hidden h-[600px] overflow-hidden p-0 lg:block">
              <NodeDetailPanel
                node={selectedNode}
                canActivate={canActivate}
                demo={tree.demo}
                onClose={() => setSelectedId(null)}
                onLocate={handleLocate}
              />
            </Card>

            {/* Mobile slide-over */}
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
              <button
                type="button"
                aria-label="Chiudi"
                className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-fade-in"
                onClick={() => setSelectedId(null)}
              />
              <div className="absolute inset-y-0 right-0 w-[min(22rem,90vw)] border-l bg-card shadow-xl animate-fade-in">
                <NodeDetailPanel
                  node={selectedNode}
                  canActivate={canActivate}
                  demo={tree.demo}
                  onClose={() => setSelectedId(null)}
                  onLocate={handleLocate}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
