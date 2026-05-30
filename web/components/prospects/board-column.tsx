'use client';

import * as React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { cn, formatNumber } from '@/lib/utils';
import { STAGE_DESCRIPTIONS, STAGE_LABELS, stageIndex } from '@/lib/types/db';
import { Tooltip } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { ProspectCard } from './prospect-card';
import type { StageColumnView } from './types';

/**
 * BoardColumn — one of the 6 canonical funnel columns. A droppable target whose
 * header shows the stage label, the prospect count and the summed expected
 * value of the column. Cards inside are a vertical sortable list. The column
 * highlights while a card is dragged over it.
 */

export interface BoardColumnProps {
  column: StageColumnView;
  /** true while ANY card is being dragged (dims non-target columns subtly). */
  isDraggingActive?: boolean;
  /** disable card dragging while a move is committing. */
  busy?: boolean;
}

export function BoardColumn({ column, isDraggingActive, busy }: BoardColumnProps) {
  const { stage, prospects, value_total } = column;
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    data: { type: 'column', stage },
  });

  const idx = stageIndex(stage);
  const isEnrollment = stage === 'iscrizione';

  return (
    <section
      aria-label={STAGE_LABELS[stage]}
      className="flex w-72 shrink-0 flex-col sm:w-[19rem]"
    >
      {/* Header */}
      <div
        className={cn(
          'mb-2 rounded-lg border bg-muted/40 px-3 py-2.5',
          isEnrollment && 'border-success/30 bg-success/5',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold tabular-nums',
                isEnrollment
                  ? 'bg-success/15 text-success'
                  : 'bg-background text-muted-foreground',
              )}
              aria-hidden
            >
              {idx}
            </span>
            <h2 className="truncate text-sm font-semibold text-foreground">
              {STAGE_LABELS[stage]}
            </h2>
            <Tooltip content={STAGE_DESCRIPTIONS[stage]} side="top">
              <button
                type="button"
                className="shrink-0 text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Info ${STAGE_LABELS[stage]}`}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </Tooltip>
          </div>
          <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {prospects.length}
          </span>
        </div>
        <p className="mt-1 pl-7 text-xs tabular-nums text-muted-foreground">
          {value_total > 0 ? (
            <>
              <span className="font-medium text-foreground">
                € {formatNumber(value_total)}
              </span>{' '}
              pipeline
            </>
          ) : (
            <span className="text-muted-foreground/70">Nessun valore</span>
          )}
        </p>
      </div>

      {/* Droppable body */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 rounded-lg p-1.5 transition-colors',
          'min-h-[8rem]',
          isOver
            ? 'bg-primary/8 ring-2 ring-inset ring-primary/40'
            : isDraggingActive
              ? 'bg-muted/30'
              : 'bg-muted/20',
        )}
      >
        <SortableContext
          items={prospects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {prospects.map((p) => (
            <ProspectCard key={p.id} prospect={p} disabled={busy} />
          ))}
        </SortableContext>

        {prospects.length === 0 && (
          <div
            className={cn(
              'flex h-24 items-center justify-center rounded-lg border border-dashed text-center text-xs',
              isOver
                ? 'border-primary/50 text-primary'
                : 'border-border/70 text-muted-foreground/70',
            )}
          >
            {isOver ? 'Rilascia qui' : 'Nessun prospect in questa fase'}
          </div>
        )}
      </div>
    </section>
  );
}
