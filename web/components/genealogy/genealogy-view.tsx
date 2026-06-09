'use client';

import * as React from 'react';
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
  type SponsorOption,
} from './add-member-dialog';
import {
  GenealogyCanvasCinematic,
  type GenealogyCanvasHandle,
} from './genealogy-canvas-cinematic';
import { GitFork } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Classify each visible node as organic genealogy vs SPILLOVER, relative to the
 * tree owner (`rootId` = "you"). Binary placement (`parent_id`) ≠ sponsorship
 * (`sponsor_id`): a person sitting in your leg whom you did NOT recruit (their
 * sponsor chain doesn't pass through you) is spillover.
 *
 * Rule (recursive on the SPONSOR chain): X is organic for you iff its sponsor is
 * you, OR its sponsor is itself organic for you. If X's sponsor is outside your
 * subtree (e.g. an upline placed them) the chain can't reach you → spillover.
 * Example: your upline's direct sponsors someone under you → spillover for you,
 * but organic for the upline (their chain DOES reach them).
 */
function computeSpillover(nodes: TreeNode[], rootId: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const isOrganic = (id: string): boolean => {
    if (id === rootId) return true;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return false; // cycle guard
    const node = byId.get(id);
    if (!node) return false;
    const sp = node.sponsor_id;
    let result: boolean;
    if (!sp) result = false;
    else if (sp === rootId) result = true;
    else if (!byId.has(sp)) result = false; // sponsor outside your line → spillover
    else {
      visiting.add(id);
      result = isOrganic(sp);
      visiting.delete(id);
    }
    memo.set(id, result);
    return result;
  };
  const spillover = new Set<string>();
  for (const n of nodes) {
    if (n.id !== rootId && !isOrganic(n.id)) spillover.add(n.id);
  }
  return spillover;
}

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

  // The layout root depends on the active scope: GLOBAL → own root; a branch →
  // that leg's child (computed over the cached adjacency).
  const layoutRootId = React.useMemo(() => {
    const byId = new Map(tree.visibleNodes.map((n) => [n.id, n] as const));
    return layoutRootForScope(byId, rootId, scope);
  }, [tree.visibleNodes, rootId, scope]);

  const selectedNode = selectedId ? tree.getNode(selectedId) ?? null : null;
  const canActivate = canActivateCrm(claims);

  // Spillover classification (relative to you = rootId) + "focus my line" filter.
  const spilloverIds = React.useMemo(
    () => computeSpillover(tree.visibleNodes, rootId),
    [tree.visibleNodes, rootId],
  );
  const [focusMyLine, setFocusMyLine] = React.useState(false);
  const selectedSpillover = selectedId ? spilloverIds.has(selectedId) : false;
  const sponsorName =
    selectedNode?.sponsor_id
      ? tree.getNode(selectedNode.sponsor_id)?.display_name ?? null
      : null;

  // Add-from-tree: the "+" slots are offered to anyone who can create accounts
  // (admin/owner OR rank ≥ consultant — same as the server gate) on the selected
  // node, or the layout root when nothing is selected. RLS scopes the actual
  // placement to the caller's visible subtree. Target holds the chosen (parent, leg).
  const [addTarget, setAddTarget] = React.useState<AddMemberTarget | null>(null);
  const addSlotsForId = canAddMember(claims) ? selectedId ?? layoutRootId : null;

  const handleSelect = React.useCallback((node: TreeNode) => {
    setSelectedId(node.id);
  }, []);

  // The upline chain valid as sponsor for a placement under `startId` — the node
  // itself then its ancestors up to the root (closest first). Constrains sponsor
  // choice to the direct upline (no crossline). Walks the cached parent adjacency.
  const uplineChain = React.useCallback(
    (startId: string | null): SponsorOption[] => {
      const out: SponsorOption[] = [];
      const seen = new Set<string>();
      let cur = startId ? tree.getNode(startId) : null;
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        out.push({ id: cur.id, name: cur.display_name, rank: cur.rank });
        cur = cur.parent_id ? tree.getNode(cur.parent_id) ?? null : null;
      }
      return out;
    },
    [tree],
  );

  const handleAddSlot = React.useCallback(
    (parentId: string, leg: PlacementLeg) => {
      const parent = tree.getNode(parentId);
      setAddTarget({
        mode: 'below',
        parentId,
        leg,
        parentName: parent?.display_name ?? '',
        // Sponsor candidates = the placement parent + its upline chain.
        sponsorOptions: uplineChain(parentId),
      });
    },
    [tree, uplineChain],
  );

  // Open the dialog in "insert above" mode for the selected node. The new node takes
  // the target's slot under the target's current parent, so the valid sponsors are
  // the target's parent + its upline chain (i.e. the target's ancestors).
  const handleInsertAbove = React.useCallback(
    (node: TreeNode) => {
      setAddTarget({
        mode: 'above',
        targetId: node.id,
        targetName: node.display_name,
        sponsorOptions: uplineChain(node.parent_id),
      });
    },
    [uplineChain],
  );

  const handleAdded = React.useCallback(
    async (node: TreeNode) => {
      if (!addTarget) return;
      if (addTarget.mode === 'above') {
        // The tree shape changed structurally (N took the target's slot, the target
        // dropped to N's LEFT leg). Reload refreshes the upper window, but the new
        // node sits at the target's depth — which can be BEYOND the lazy window
        // (~150 nodes), so reload alone wouldn't include it. revealNode loads its
        // ancestor path + neighborhood (same as a search jump) so it actually shows
        // up and "Vai al nodo" can center it.
        setAddTarget(null);
        await tree.reload();
        await tree.revealNode(node);
        setSelectedId(node.id);
        window.setTimeout(() => canvasRef.current?.centerOn(node.id), 200);
        return;
      }
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

  const handleLocate = React.useCallback(
    async (node: TreeNode) => {
      // Ensure the node is actually in the layout before centering (no-op fetch if
      // it's already loaded). Without this, "Vai al nodo" silently did nothing for
      // a node outside the lazy window (e.g. one just inserted deep in the tree).
      await tree.revealNode(node);
      window.setTimeout(() => canvasRef.current?.centerOn(node.id), 120);
    },
    [tree],
  );

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
      // The server re-homes anyone this person sponsored onto its own sponsor, so
      // their spillover flag changes — reload to recompute it.
      await tree.reload();
      setSelectedId(null);
      toast({ title: t('remove_done'), variant: 'success' });
    },
    [t, toast, tree],
  );

  // Esc closes the node detail panel (the one overlay here that isn't a Modal).
  // Skip while the add-member dialog is open — its own Modal handles Esc first.
  React.useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && addTarget === null) setSelectedId(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, addTarget]);

  return (
    <div className="space-y-3">
      {/* Marketer search lives in the top navbar (only while this screen is up). */}
      <TopbarSlot>
        <GenealogySearch
          onSearch={tree.search}
          onPick={handlePick}
          className="sm:w-full sm:max-w-md"
        />
      </TopbarSlot>

      {tree.demo && <ConfigNotice variant="inline" />}

      {/* Full-bleed canvas; the detail panel floats over it as an overlay so the
          tree always uses the whole width (no reserved empty column). */}
      <Card className="relative h-[calc(100dvh-8rem)] min-h-[360px] sm:min-h-[520px] overflow-hidden p-0 shadow-card ring-1 ring-black/5">
        {/* Mobile-only search overlay (the desktop one lives in the top navbar,
            hidden < md). Top-left, compact; hidden while a node sheet is open. */}
        {!selectedNode && (
          <div className="absolute left-3 top-3 z-20 w-[min(70vw,15rem)] md:hidden">
            <GenealogySearch onSearch={tree.search} onPick={handlePick} />
          </div>
        )}

        {/* Spillover focus filter (only when there's spillover to separate out).
            Mobile: top-right so it won't overlap the search; desktop: top-left. */}
        {spilloverIds.size > 0 && (
          <div className="absolute right-3 top-3 z-20 md:left-3 md:right-auto">
            <button
              type="button"
              onClick={() => setFocusMyLine((v) => !v)}
              aria-pressed={focusMyLine}
              title={focusMyLine ? t('show_all') : t('focus_my_line')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-lg backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                focusMyLine
                  ? 'border-primary/50 bg-gradient-to-br from-primary to-primary text-primary-foreground'
                  : 'border-border/60 bg-card/85 text-muted-foreground hover:text-foreground',
              )}
            >
              <GitFork className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">
                {focusMyLine ? t('show_all') : t('focus_my_line')}
              </span>
            </button>
          </div>
        )}

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
          spilloverIds={spilloverIds}
          dimSpillover={focusMyLine}
        />

        {/* Detail panel: FULL-SCREEN on mobile (covers the navbar → more room, no
            cramping, no overlap with the search), right-side overlay on desktop.
            The inner panel is h-full + scrolls. */}
        {selectedNode && (
          <div
            className="glass fixed inset-0 z-50 shadow-xl ring-1 ring-black/5 animate-fade-in sm:absolute sm:inset-y-0 sm:left-auto sm:right-0 sm:z-20 sm:h-full sm:w-[min(22rem,92vw)] sm:border-l sm:border-border/70 sm:animate-slide-in-right"
            role="dialog"
            aria-modal="false"
          >
            <NodeDetailPanel
              node={selectedNode}
              canActivate={canActivate}
              spillover={selectedSpillover}
              isRoot={selectedNode.id === rootId}
              sponsorName={sponsorName}
              onClose={() => setSelectedId(null)}
              onLocate={handleLocate}
              onRemove={handleRemove}
              onInsertAbove={handleInsertAbove}
              canInsertAbove={canActivate}
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
