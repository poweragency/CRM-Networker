'use client';

import * as React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STAGE_LABELS, stageIndex } from '@/lib/types/db';
import { ProspectCard } from './prospect-card';
import { stageTokens } from './stage-tokens';
import type { ProspectView, StageColumnView } from './types';

/**
 * BoardColumn — one of the 6 canonical funnel columns. A droppable target whose
 * header shows the stage label and the prospect count. Cards inside are a
 * vertical sortable list. The column highlights while a card is dragged over it.
 */

export interface BoardColumnProps {
  column: StageColumnView;
  /** true while ANY card is being dragged (dims non-target columns subtly). */
  isDraggingActive?: boolean;
  /** disable card dragging while a move is committing. */
  busy?: boolean;
  /**
   * Cards mirrored from the Lista contatti (invited contacts at this phase).
   * Draggable like any other card — dropping one updates its `percorso` via the
   * shared store; they carry no detail route.
   */
  extraCards?: ProspectView[];
  /** Profile URL to return to — threaded into each card's detail link. */
  backHref?: string;
  /** Delete a card (real prospect → soft-delete; Lista mirror → flagged non iscritto). */
  onRequestDelete?: (prospect: ProspectView) => void;
}

export function BoardColumn({
  column,
  isDraggingActive,
  busy,
  extraCards = [],
  backHref,
  onRequestDelete,
}: BoardColumnProps) {
  const { stage, prospects } = column;
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    data: { type: 'column', stage },
  });

  const count = prospects.length + extraCards.length;
  // Real prospects + mirrored Lista contatti cards, always alphabetical by name.
  const cards = [...prospects, ...extraCards].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'it', { sensitivity: 'base' }),
  );

  const idx = stageIndex(stage);
  const tok = stageTokens(stage);

  return (
    <section
      aria-label={STAGE_LABELS[stage]}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl transition-opacity duration-base sm:w-[19rem]',
        // Subtly recede the non-target columns while dragging for focus.
        isDraggingActive && !isOver && 'opacity-[0.92]',
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'relative mb-2.5 overflow-hidden rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs',
        )}
      >
        {/* stage-colored top accent */}
        <span
          aria-hidden
          className={cn('absolute inset-x-0 top-0 h-[3px]', tok.bg)}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent opacity-60',
            tok.from,
          )}
        />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tabular-nums ring-1 ring-inset',
                tok.bgSoft,
                tok.text,
                tok.border,
              )}
              aria-hidden
            >
              {idx}
            </span>
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {STAGE_LABELS[stage]}
            </h2>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
              count > 0
                ? cn(tok.bgSoft, tok.text)
                : 'bg-muted text-muted-foreground',
            )}
          >
            {count}
          </span>
        </div>
      </div>

      {/* Droppable body */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2.5 rounded-xl p-2 transition-all duration-base ease-standard',
          'min-h-[8rem]',
          isOver
            ? cn('bg-card shadow-inner ring-2 ring-inset', tok.ring)
            : isDraggingActive
              ? 'bg-muted/40'
              : 'bg-muted/25',
        )}
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((c) => (
            <ProspectCard
              key={c.id}
              prospect={c}
              disabled={busy}
              backHref={backHref}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </SortableContext>

        {count === 0 && (
          <div
            className={cn(
              'flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center text-xs transition-colors duration-base',
              isOver
                ? cn(tok.border, tok.text, 'bg-card')
                : 'border-border/60 text-muted-foreground/60',
            )}
          >
            <Inbox
              className={cn('h-5 w-5', isOver ? tok.text : 'opacity-50')}
              aria-hidden
            />
            <span className="font-medium">
              {isOver ? 'Rilascia qui' : 'Nessun prospect'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
