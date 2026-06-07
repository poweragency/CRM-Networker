'use client';

import * as React from 'react';
import '@xyflow/react/dist/style.css';
import { useScope } from '@/lib/scope/scope-provider';
import { ConfigNotice } from '@/components/config-notice';
import { Card } from '@/components/ui/card';
import type { PlacementLeg, SessionClaims, TreeNode } from '@/lib/types/db';
import {
  layoutRootForScope,
  useGenealogyTree,
} from './use-genealogy-tree';
import { TopbarSlot } from '@/components/shell/topbar-slot';
import { GenealogySearch } from './genealogy-search';
import { NodeDetailPanel } from './node-detail-panel';
import { canActivateCrm, canAddMember } from './permissions';
import { useToast } from '@/components/crm/toaster';
import { useTranslations } from 'next-intl';
import { removeMarketerAction } from '@/app/(app)/genealogia/actions';
import {
  AddMemberDialog,
  type AddMemberTarget,
} from './add-member-dialog';
import {
  GenealogyCanvas,
  type GenealogyCanvasHandle,
} from './genealogy-canvas';
import { GenealogyCanvasCinematic } from './genealogy-canvas-cinematic';
import { Sparkles, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const { toast } = useToast();
  const t = useTranslations('genealogia');
  const tree = useGenealogyTree({ initialNodes, rootId, initialDemo });
  const canvasRef = React.useRef<GenealogyCanvasHandle>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Viewer mode: the lightweight canvas "Cinematic" (default — scales to ~1000
  // nodes) vs the classic React Flow "Classico". Persisted per device.
  const [mode, setMode] = React.useState<'cinematic' | 'classic'>('cinematic');
  React.useEffect(() => {
    const saved = window.localStorage.getItem('genealogy_view_mode');
    if (saved === 'classic' || saved === 'cinematic') setMode(saved);
  }, []);
  const changeMode = React.useCallback((next: 'cinematic' | 'classic') => {
    setMode(next);
    window.localStorage.setItem('genealogy_view_mode', next);
  }, []);

  // The layout root depends on the active scope: GLOBAL → own root; a branch →
  // that leg's child (computed over the cached adjacency).
  const layoutRootId = React.useMemo(() => {
    const byId = new Map(tree.visibleNodes.map((n) => [n.id, n] as const));
    return layoutRootForScope(byId, rootId, scope);
  }, [tree.visibleNodes, rootId, scope]);

  const selectedNode = selectedId ? tree.getNode(selectedId) ?? null : null;
  const canActivate = canActivateCrm(claims);

  // Add-from-tree: the "+" slots are offered to EVERY person (not just admins) on
  // the selected node, or the layout root when nothing is selected (a fresh tree
  // then shows its open slots). RLS scopes the actual placement to the caller's
  // own visible subtree. Dialog target holds the chosen empty (parent, leg).
  const [addTarget, setAddTarget] = React.useState<AddMemberTarget | null>(null);
  const addSlotsForId = canAddMember() ? selectedId ?? layoutRootId : null;

  const handleSelect = React.useCallback((node: TreeNode) => {
    setSelectedId(node.id);
  }, []);

  const handleAddSlot = React.useCallback(
    (parentId: string, leg: PlacementLeg) => {
      const parent = tree.getNode(parentId);
      setAddTarget({
        parentId,
        leg,
        parentName: parent?.display_name ?? '',
      });
    },
    [tree],
  );

  const handleAdded = React.useCallback(
    (node: TreeNode) => {
      if (!addTarget) return;
      tree.addChild(addTarget.parentId, addTarget.leg, node);
      setSelectedId(node.id);
      setAddTarget(null);
      window.setTimeout(() => canvasRef.current?.centerOn(node.id), 140);
    },
    [addTarget, tree],
  );

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

  // Remove a node from the tree (reattaches its single downline). The server RPC
  // enforces the rules (no removal with two legs / root / self); the client cache
  // mirrors the reattach optimistically.
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const handleRemove = React.useCallback(
    async (node: TreeNode) => {
      setRemovingId(node.id);
      const res = await removeMarketerAction(node.id);
      setRemovingId(null);
      if (!res.ok) {
        toast({ title: t('remove_error'), variant: 'error' });
        return;
      }
      tree.removeNode(node.id);
      setSelectedId(null);
      toast({ title: t('remove_done'), variant: 'success' });
    },
    [t, toast, tree],
  );

  return (
    <div className="space-y-3">
      {/* Marketer search lives in the top navbar (only while this screen is up). */}
      <TopbarSlot>
        <GenealogySearch onSearch={tree.search} onPick={handlePick} className="sm:w-full sm:max-w-md" />
      </TopbarSlot>

      {tree.demo && <ConfigNotice variant="inline" />}

      {/* Full-bleed canvas; the detail panel floats over it as an overlay so the
          tree always uses the whole width (no reserved empty column). */}
      <Card className="relative h-[calc(100dvh-8rem)] min-h-[360px] sm:min-h-[520px] overflow-hidden p-0 shadow-card ring-1 ring-black/5">
        {/* Viewer-mode toggle — Cinematico (canvas, scala a migliaia) / Classico. */}
        <div className="absolute left-3 top-3 z-30 inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-card/85 p-0.5 shadow-lg backdrop-blur">
          <ModeTab
            active={mode === 'cinematic'}
            onClick={() => changeMode('cinematic')}
            icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
            label={t('view_cinematic')}
          />
          <ModeTab
            active={mode === 'classic'}
            onClick={() => changeMode('classic')}
            icon={<GitBranch className="h-3.5 w-3.5" aria-hidden />}
            label={t('view_classic')}
          />
        </div>

        {mode === 'cinematic' ? (
          <GenealogyCanvasCinematic
            ref={canvasRef}
            nodes={tree.visibleNodes}
            layoutRootId={layoutRootId}
            scope={scope}
            expanded={tree.expanded}
            selectedId={selectedId}
            onSelect={handleSelect}
            onToggle={tree.toggle}
            hasChildren={tree.hasChildren}
            addSlotsForId={addSlotsForId}
            onAddSlot={handleAddSlot}
          />
        ) : (
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
            addSlotsForId={addSlotsForId}
            onAddSlot={handleAddSlot}
          />
        )}

        {/* Detail panel: bottom sheet on mobile (full width, capped height), right-
            side overlay on desktop. The inner panel is h-full + scrolls. */}
        {selectedNode && (
          <div
            className="glass absolute z-20 shadow-xl ring-1 ring-black/5 animate-fade-in inset-x-0 bottom-0 h-[72dvh] rounded-t-2xl border-t border-border/70 sm:inset-y-0 sm:bottom-auto sm:left-auto sm:right-0 sm:h-auto sm:w-[min(22rem,92vw)] sm:rounded-none sm:border-l sm:border-t-0 sm:animate-slide-in-right"
            role="dialog"
            aria-modal="false"
          >
            <NodeDetailPanel
              node={selectedNode}
              canActivate={canActivate}
              onClose={() => setSelectedId(null)}
              onLocate={handleLocate}
              onRemove={handleRemove}
              removing={removingId === selectedNode.id}
            />
          </div>
        )}
      </Card>

      {/* Add-a-member dialog (opened from a "+" slot in the tree) */}
      <AddMemberDialog
        open={addTarget !== null}
        onOpenChange={(o) => {
          if (!o) setAddTarget(null);
        }}
        target={addTarget}
        onAdded={handleAdded}
      />
    </div>
  );
}

/** One segment of the Cinematico / Classico viewer-mode toggle. */
function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
