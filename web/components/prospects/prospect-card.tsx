'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpRight, GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { StatusPill } from '@/components/crm/status-pill';
import { stageTokens } from './stage-tokens';
import type { ProspectView } from './types';

/**
 * ProspectCard — a single prospect on the kanban board. Shows the name, the
 * owner (avatar + chip), how long it has sat in the current stage, and the
 * outcome pill for non-open prospects.
 *
 * The WHOLE card is the drag surface (dnd-kit listeners on the root), so you can
 * grab it from anywhere — the left grip is just a visual affordance. A real
 * prospect's body is still a link to its detail route; the sensor's activation
 * distance keeps a plain click (open) distinct from a drag (move).
 */

/** Pure presentation — shared by the sortable item and the drag overlay. */
export const ProspectCardBody = React.forwardRef<
  HTMLDivElement,
  {
    prospect: ProspectView;
    /** Render as the floating drag overlay (lifted, no interactive children). */
    overlay?: boolean;
    dragging?: boolean;
    /** Slot for the grip handle (sortable instance injects the drag listeners). */
    handle?: React.ReactNode;
    /** Slot for the full-card detail link (omitted on the overlay). */
    link?: React.ReactNode;
    /** Detail route — renders an explicit, easy-to-hit "open profile" button. */
    detailHref?: string;
    /** Delete handler — renders a trash button (omitted on the overlay). */
    onDelete?: () => void;
  } & React.HTMLAttributes<HTMLDivElement>
>(function ProspectCardBody(
  { prospect, overlay, dragging, handle, link, detailHref, onDelete, className, ...props },
  ref,
) {
  const fromList = Boolean(prospect.listaContattiId);
  const tok = stageTokens(prospect.current_stage);

  return (
    <div
      ref={ref}
      className={cn(
        'group/card relative overflow-hidden rounded-xl border border-border/70 bg-card pl-4 pr-3 py-3 text-card-foreground',
        'shadow-card transition-all duration-base ease-emphasized',
        'hover:-translate-y-px hover:border-border hover:shadow-card-hover',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background',
        overlay &&
          'rotate-[1.5deg] scale-[1.03] cursor-grabbing border-primary/40 shadow-glow ring-1 ring-primary/30',
        dragging && 'opacity-40',
        className,
      )}
      {...props}
    >
      {/* Stage color accent rail */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-1',
          tok.bg,
        )}
      />
      {/* Soft stage tint that warms on hover (depth) */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-base bg-gradient-to-r to-transparent',
          tok.from,
          'group-hover/card:opacity-100',
        )}
      />

      {handle}
      {link}

      <div className="relative min-w-0 space-y-2.5">
        {/* Name + actions. Real prospects: open + delete. Mirrored Lista contatti
            cards: a "Lista" badge + delete (→ flagged non iscritto). Enrollment is
            done by dragging the card into the "Iscritto" column (no button). */}
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold leading-snug tracking-tight text-foreground">
            {prospect.full_name}
          </p>
          {overlay ? (
            <ArrowUpRight
              className="relative z-10 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-all duration-base group-hover/card:translate-x-0.5 group-hover/card:opacity-100 group-hover/card:text-foreground"
              aria-hidden
            />
          ) : (
            <div className="relative z-20 flex shrink-0 items-center gap-1">
              {fromList && (
                <span className="rounded-full bg-info/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
                  Lista
                </span>
              )}
              {detailHref && (
                <Link
                  href={detailHref}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Apri ${prospect.full_name}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
              {onDelete && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onDelete();
                  }}
                  aria-label={`Elimina ${prospect.full_name}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground transition-colors hover:bg-danger/15 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Owner */}
        <div className="flex items-center gap-2">
          <Avatar
            name={prospect.owner_name}
            size="sm"
            className="h-6 w-6 text-[10px] ring-1 ring-border/60"
          />
          <span className="truncate text-xs font-medium text-muted-foreground">
            {prospect.owner_name}
          </span>
        </div>

        {/* Next action / outcome */}
        {prospect.outcome !== 'open' ? (
          <StatusPill kind="prospect" value={prospect.outcome} />
        ) : (
          prospect.notes && (
            <p className="relative z-10 line-clamp-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
              {prospect.notes}
            </p>
          )
        )}
      </div>
    </div>
  );
});

export interface ProspectCardProps {
  prospect: ProspectView;
  /** Disable dragging (e.g. while a stage change is in flight). */
  disabled?: boolean;
  /** Profile URL to return to — threaded into the detail link as `?from=`. */
  backHref?: string;
  /** Ask the board to delete this card (real prospect → soft-delete; Lista mirror →
   *  flagged "non iscritto" and removed from the board). */
  onRequestDelete?: (prospect: ProspectView) => void;
}

/** Sortable + draggable instance placed inside a column. */
export function ProspectCard({
  prospect,
  disabled,
  backHref,
  onRequestDelete,
}: ProspectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: prospect.id,
    data: { type: 'prospect', stage: prospect.current_stage },
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  // Mirrored Lista contatti cards have no detail route — drag-only.
  const detailHref = prospect.listaContattiId
    ? undefined
    : backHref
      ? `/percorso-prospect/${prospect.id}?from=${encodeURIComponent(backHref)}`
      : `/percorso-prospect/${prospect.id}`;

  return (
    <ProspectCardBody
      ref={setNodeRef}
      prospect={prospect}
      dragging={isDragging}
      detailHref={detailHref}
      onDelete={onRequestDelete ? () => onRequestDelete(prospect) : undefined}
      style={style}
      // Drag from anywhere on the card.
      {...attributes}
      {...listeners}
      className={cn(
        // `touch-manipulation` (not `touch-none`): on mobile a normal swipe scrolls
        // the page/list like touching the background; only a long-press (TouchSensor
        // delay) starts a drag. `touch-none` made cards "eat" the scroll.
        'touch-manipulation',
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
      )}
      handle={
        <span
          aria-hidden
          className="absolute left-0 top-0 z-10 flex h-full w-4 items-center justify-center text-muted-foreground/0 transition-colors duration-base group-hover/card:text-muted-foreground/40"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      }
      link={
        detailHref ? (
          <Link
            href={detailHref}
            tabIndex={-1}
            className="absolute inset-y-0 left-4 right-0 z-0 rounded-r-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Apri ${prospect.full_name}`}
          />
        ) : undefined
      }
    />
  );
}
