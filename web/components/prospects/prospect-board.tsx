'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { STAGE_LABELS, STAGE_ORDER, type ProspectStage } from '@/lib/types/db';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/crm/toaster';
import { ConfigNotice } from '@/components/config-notice';
import { changeStageAction } from '@/app/(app)/percorso-prospect/actions';
import { BoardColumn } from './board-column';
import { ProspectCardBody } from './prospect-card';
import { NewProspectSheet, type ContactOption } from './new-prospect-sheet';
import type { BoardView, ProspectView } from './types';

/**
 * ProspectBoard — the kanban orchestrator. Holds the board state (the 6 ordered
 * columns), runs a @dnd-kit DndContext for cross-column drag, optimistically
 * moves a card on drop and commits the transition via the `changeStageAction`
 * server action (transactional `change_prospect_stage` RPC; simulated in demo).
 * If a configured write fails, the move is rolled back and an error toast shown.
 *
 * All data is received as plain props from the RSC page — this client tree never
 * touches the server-only data layer.
 */

export interface ProspectBoardProps {
  board: BoardView;
  demo: boolean;
  contacts: ContactOption[];
  ownerName: string;
}

/** Flatten the board into a stage→prospects map for cheap immutable updates. */
type StageMap = Record<ProspectStage, ProspectView[]>;

function toStageMap(board: BoardView): StageMap {
  const map = {} as StageMap;
  for (const stage of STAGE_ORDER) map[stage] = [];
  for (const col of board.columns) map[col.stage] = [...col.prospects];
  return map;
}

function findStageOf(map: StageMap, id: string): ProspectStage | null {
  for (const stage of STAGE_ORDER) {
    if (map[stage].some((p) => p.id === id)) return stage;
  }
  return null;
}

function sumValue(prospects: ProspectView[]): number {
  return prospects.reduce((acc, p) => acc + (p.expected_value ?? 0), 0);
}

export function ProspectBoard({
  board,
  demo,
  contacts,
  ownerName,
}: ProspectBoardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [stageMap, setStageMap] = React.useState<StageMap>(() =>
    toStageMap(board),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetStage, setSheetStage] =
    React.useState<ProspectStage>('conoscitiva');

  // Re-sync when the server sends fresh data (e.g. after router.refresh()).
  React.useEffect(() => {
    setStageMap(toStageMap(board));
  }, [board]);

  const sensors = useSensors(
    // A small activation distance lets clicks/links work without starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeProspect = React.useMemo(() => {
    if (!activeId) return null;
    for (const stage of STAGE_ORDER) {
      const found = stageMap[stage].find((p) => p.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, stageMap]);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  /** Resolve the destination stage from an over-target (card or column). */
  function resolveOverStage(
    map: StageMap,
    overId: string,
  ): ProspectStage | null {
    if ((STAGE_ORDER as readonly string[]).includes(overId)) {
      return overId as ProspectStage;
    }
    return findStageOf(map, overId);
  }

  /** Live cross-column preview while dragging over another column. */
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setStageMap((prev) => {
      const from = findStageOf(prev, activeId);
      const to = resolveOverStage(prev, overId);
      if (!from || !to || from === to) return prev;

      const moving = prev[from].find((p) => p.id === activeId);
      if (!moving) return prev;

      return {
        ...prev,
        [from]: prev[from].filter((p) => p.id !== activeId),
        [to]: [{ ...moving, current_stage: to }, ...prev[to]],
      };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const id = String(active.id);
    setActiveId(null);
    if (!over) return;

    const destStage = resolveOverStage(stageMap, String(over.id));
    const originStage =
      board.columns.find((c) => c.prospects.some((p) => p.id === id))?.stage ??
      null;

    if (!destStage || destStage === originStage) {
      // Snap back to the server state if nothing meaningful changed.
      if (!destStage) setStageMap(toStageMap(board));
      return;
    }

    // Capture a snapshot for rollback on a real (configured) write failure.
    const snapshot = stageMap;
    setBusyId(id);

    const res = await changeStageAction(id, destStage);

    setBusyId(null);

    if (!res.ok) {
      setStageMap(snapshot); // roll back the optimistic move
      toast({ title: 'Operazione non riuscita. Riprova.', variant: 'error' });
      return;
    }

    // Reconcile the moved card with the canonical row (outcome may flip etc.).
    setStageMap((prev) => {
      const next = { ...prev } as StageMap;
      for (const stage of STAGE_ORDER) {
        next[stage] = prev[stage].map((p) =>
          p.id === id
            ? { ...res.data.prospect, owner_name: p.owner_name }
            : p,
        );
      }
      return next;
    });

    const enrolled = destStage === 'iscrizione';
    toast({
      title: enrolled ? 'Prospect iscritto! 🎉' : 'Fase aggiornata',
      description: res.demo
        ? `Spostato in “${STAGE_LABELS[destStage]}” (simulato in modalità demo).`
        : `Spostato in “${STAGE_LABELS[destStage]}”.`,
      variant: 'success',
    });

    if (!res.demo) router.refresh();
  }

  function onCreated(prospect: ProspectView) {
    setStageMap((prev) => ({
      ...prev,
      [prospect.current_stage]: [prospect, ...prev[prospect.current_stage]],
    }));
  }

  function openSheet(stage: ProspectStage = 'conoscitiva') {
    setSheetStage(stage);
    setSheetOpen(true);
  }

  const total = STAGE_ORDER.reduce(
    (acc, s) => acc + stageMap[s].length,
    0,
  );

  return (
    <div className="space-y-4">
      {demo && <ConfigNotice variant="inline" />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {total}
          </span>{' '}
          prospect nel funnel
        </p>
        <Button onClick={() => openSheet('conoscitiva')}>
          <Plus className="h-4 w-4" aria-hidden />
          Nuovo prospect
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setStageMap(toStageMap(board));
        }}
      >
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {STAGE_ORDER.map((stage) => {
            const prospects = stageMap[stage];
            return (
              <BoardColumn
                key={stage}
                column={{
                  stage,
                  prospects,
                  value_total: sumValue(prospects),
                }}
                isDraggingActive={activeId !== null}
                busy={busyId !== null}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeProspect ? (
            <div className="w-72 sm:w-[19rem]">
              <ProspectCardBody prospect={activeProspect} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <NewProspectSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        contacts={contacts}
        ownerName={ownerName}
        defaultStage={sheetStage}
        onCreated={onCreated}
      />
    </div>
  );
}
