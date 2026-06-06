'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Plus, Users } from 'lucide-react';
import {
  STAGE_LABELS,
  STAGE_ORDER,
  type ListaContattiEntry,
  type ProspectStage,
} from '@/lib/types/db';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/crm/toaster';
import { ConfigNotice } from '@/components/config-notice';
import { useListaContattiStoreOptional } from '@/components/team/lista-contatti-store';
import {
  changeStageAction,
  deleteProspectAction,
} from '@/app/(app)/percorso-prospect/actions';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
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
  /**
   * Owner of prospects created here. On a marketer's profile this is that
   * marketer's id (so a new prospect belongs to them, not the viewer); omitted
   * on your own board → defaults to the caller server-side.
   */
  ownerMarketerId?: string;
  /** Profile URL to return to from a prospect's detail (`?from=`). */
  backHref?: string;
}

/** Flatten the board into a stage→prospects map for cheap immutable updates. */
type StageMap = Record<ProspectStage, ProspectView[]>;

// Kanban columns = every funnel stage EXCEPT iscrizione. Enrolling completes the
// journey, so an enrolled person leaves the board (still counted in KPIs/podi).
const BOARD_STAGES = STAGE_ORDER.filter((s) => s !== 'iscrizione');

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

/**
 * Mirror an invited Lista contatti entry into a read-only board card. The entry's
 * `percorso` (0..5) IS the funnel stage index, so the card lands in the matching
 * column; phase changes are made via the Percorso checkboxes (this card is not
 * draggable here).
 */
function listaContattiToCard(
  e: ListaContattiEntry,
  ownerName: string,
): ProspectView {
  const stage =
    STAGE_ORDER[Math.min(Math.max(e.percorso ?? 0, 0), STAGE_ORDER.length - 1)];
  return {
    id: `lc-${e.id}`,
    org_id: e.org_id,
    owner_marketer_id: e.owner_marketer_id,
    contact_id: null,
    full_name: e.full_name,
    current_stage: stage,
    outcome: stage === 'iscrizione' ? 'enrolled' : 'open',
    current_stage_since: e.updated_at,
    entered_funnel_at: e.created_at,
    closed_at: null,
    notes: e.relationship ?? null,
    created_by: e.owner_marketer_id,
    updated_by: e.owner_marketer_id,
    created_at: e.created_at,
    updated_at: e.updated_at,
    deleted_at: null,
    owner_name: ownerName,
    listaContattiId: e.id,
  };
}

export function ProspectBoard({
  board,
  demo,
  contacts,
  ownerName,
  ownerMarketerId,
  backHref,
}: ProspectBoardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const listaStore = useListaContattiStoreOptional();

  // Invited Lista contatti contacts mirrored into the board (read-only here),
  // grouped by the stage their `percorso` maps to. Live: re-derives whenever the
  // shared store changes (e.g. a Percorso checkbox toggled in the Lista tab).
  const lcByStage = React.useMemo(() => {
    const map = {} as Record<ProspectStage, ProspectView[]>;
    for (const s of STAGE_ORDER) map[s] = [];
    if (listaStore) {
      for (const e of listaStore.entries) {
        if (e.stato === 'non_invitato') continue;
        // No funnel phase done yet (percorso 0 = conoscitiva, che con la lista
        // contatti si salta) → non compare nel kanban finché non parte la prima
        // fase (business info). Vedi i contatti invitati nella tab Lista contatti.
        if ((e.percorso ?? 0) < 1) continue;
        const card = listaContattiToCard(e, ownerName);
        map[card.current_stage].push(card);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaStore?.entries, ownerName]);

  const [stageMap, setStageMap] = React.useState<StageMap>(() =>
    toStageMap(board),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetStage, setSheetStage] =
    React.useState<ProspectStage>('conoscitiva');
  const [deleteTarget, setDeleteTarget] = React.useState<ProspectView | null>(null);
  const [enrollTarget, setEnrollTarget] = React.useState<ProspectView | null>(null);

  // Re-sync when the server sends fresh data (e.g. after router.refresh()).
  React.useEffect(() => {
    setStageMap(toStageMap(board));
  }, [board]);

  const sensors = useSensors(
    // Desktop (mouse): a small drag distance so clicks/links work without dragging.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Mobile (touch): require a ~1s long-press to start a drag, so scrolling or
    // tapping to view never moves a card by accident. `tolerance` cancels the
    // press (→ treated as a scroll) if the finger moves before the delay elapses.
    useSensor(TouchSensor, { activationConstraint: { delay: 1000, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeProspect = React.useMemo(() => {
    if (!activeId) return null;
    for (const stage of STAGE_ORDER) {
      const found =
        stageMap[stage].find((p) => p.id === activeId) ??
        lcByStage[stage].find((p) => p.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, stageMap, lcByStage]);

  // The pre-drag board snapshot, captured BEFORE onDragOver mutates stageMap, so a
  // failed write can be rolled back to the true original (not the moved state).
  const preDragMapRef = React.useRef<StageMap | null>(null);

  function onDragStart(e: DragStartEvent) {
    preDragMapRef.current = stageMap;
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

    const overId = String(over.id);
    const destStage = (STAGE_ORDER as readonly string[]).includes(overId)
      ? (overId as ProspectStage)
      : (findStageOf(stageMap, overId) ?? findStageOf(lcByStage, overId));

    // Lista contatti card → update its `percorso` via the shared store; the card
    // then re-derives into the destination column (optimistic, no server prospect).
    if (id.startsWith('lc-')) {
      if (destStage && listaStore) {
        const entry = listaStore.entries.find((x) => x.id === id.slice(3));
        const target = STAGE_ORDER.indexOf(destStage);
        if (entry && (entry.percorso ?? 0) !== target) {
          void listaStore.setField(entry, { percorso: target });
        }
      }
      return;
    }

    const originStage =
      board.columns.find((c) => c.prospects.some((p) => p.id === id))?.stage ??
      null;

    if (!destStage || destStage === originStage) {
      // Snap back to the server state if nothing meaningful changed.
      if (!destStage) setStageMap(toStageMap(board));
      return;
    }

    // Roll back to the PRE-drag snapshot (onDragOver already moved the card in
    // stageMap, so reading it here would "restore" the moved state).
    const snapshot = preDragMapRef.current ?? toStageMap(board);
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
      variant: enrolled ? 'achievement' : 'success',
    });

    if (!res.demo) router.refresh();
  }

  function onCreated(prospect: ProspectView) {
    setStageMap((prev) => ({
      ...prev,
      [prospect.current_stage]: [prospect, ...prev[prospect.current_stage]],
    }));
  }

  async function handleDelete() {
    const target = deleteTarget;
    if (!target) return;
    const res = await deleteProspectAction(target.id);
    if (!res.ok) {
      toast({ title: 'Operazione non riuscita. Riprova.', variant: 'error' });
      return;
    }
    setStageMap((prev) => {
      const next = {} as StageMap;
      for (const stage of STAGE_ORDER) {
        next[stage] = prev[stage].filter((p) => p.id !== target.id);
      }
      return next;
    });
    toast({ title: 'Prospect eliminato', variant: 'success' });
  }

  async function handleEnroll() {
    const target = enrollTarget;
    if (!target) return;
    // Enrolling = move to the 'iscrizione' stage → the funnel completes and the
    // prospect leaves the board (iscrizione isn't a column).
    const res = await changeStageAction(target.id, 'iscrizione');
    if (!res.ok) {
      toast({ title: 'Operazione non riuscita. Riprova.', variant: 'error' });
      return;
    }
    setStageMap((prev) => {
      const next = {} as StageMap;
      for (const stage of STAGE_ORDER) {
        next[stage] = prev[stage].filter((p) => p.id !== target.id);
      }
      return next;
    });
    toast({
      title: 'Prospect iscritto! 🎉',
      description: res.demo ? 'Simulato in modalità demo.' : undefined,
      variant: 'achievement',
    });
  }

  function openSheet(stage: ProspectStage = 'conoscitiva') {
    setSheetStage(stage);
    setSheetOpen(true);
  }

  const total = BOARD_STAGES.reduce(
    (acc, s) => acc + stageMap[s].length + lcByStage[s].length,
    0,
  );

  return (
    <div className="space-y-4">
      {demo && <ConfigNotice variant="inline" />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-xs">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15"
            aria-hidden
          >
            <Users className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
              {total}
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              prospect nel funnel
            </p>
          </div>
        </div>
        <Button onClick={() => openSheet('conoscitiva')} className="shadow-sm">
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
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-4">
          {BOARD_STAGES.map((stage) => {
            const prospects = stageMap[stage];
            return (
              <BoardColumn
                key={stage}
                column={{
                  stage,
                  prospects,
                }}
                isDraggingActive={activeId !== null}
                busy={busyId !== null}
                extraCards={lcByStage[stage]}
                backHref={backHref}
                onRequestDelete={setDeleteTarget}
                onRequestEnroll={setEnrollTarget}
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
        ownerMarketerId={ownerMarketerId}
        defaultStage={sheetStage}
        onCreated={onCreated}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Elimina prospect"
        description={
          deleteTarget
            ? `Vuoi eliminare “${deleteTarget.full_name}” dal percorso? L'azione non è reversibile.`
            : undefined
        }
        confirmLabel="Elimina"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={enrollTarget !== null}
        onOpenChange={(o) => {
          if (!o) setEnrollTarget(null);
        }}
        title="Segna come iscritto"
        description={
          enrollTarget
            ? `Confermi che “${enrollTarget.full_name}” si è iscritto? Uscirà dal percorso (kanban).`
            : undefined
        }
        confirmLabel="Iscritto"
        destructive={false}
        onConfirm={handleEnroll}
      />
    </div>
  );
}
