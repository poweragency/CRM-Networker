'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { StatusPill } from '@/components/crm/status-pill';
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
  } & React.HTMLAttributes<HTMLDivElement>
>(function ProspectCardBody(
  { prospect, overlay, dragging, handle, link, className, ...props },
  ref,
) {
  const fromList = Boolean(prospect.listaContattiId);

  return (
    <div
      ref={ref}
      className={cn(
        'group relative rounded-lg border bg-card p-3 pl-7 text-card-foreground shadow-sm transition-shadow',
        'hover:shadow-md focus-within:ring-2 focus-within:ring-ring',
        overlay && 'rotate-1 cursor-grabbing shadow-xl ring-2 ring-primary/40',
        dragging && 'opacity-40',
        className,
      )}
      {...props}
    >
      {handle}
      {link}

      <div className="min-w-0 space-y-2">
        {/* Name + (for mirrored Lista contatti cards) a small source badge */}
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium leading-snug text-foreground">
            {prospect.full_name}
          </p>
          {fromList && (
            <span className="shrink-0 rounded-full bg-info/12 px-1.5 py-0.5 text-[10px] font-medium text-info">
              Lista contatti
            </span>
          )}
        </div>

        {/* Owner */}
        <div className="flex items-center gap-1.5">
          <Avatar
            name={prospect.owner_name}
            size="sm"
            className="h-5 w-5 text-[9px]"
          />
          <span className="truncate text-xs text-muted-foreground">
            {prospect.owner_name}
          </span>
        </div>

        {/* Next action / outcome */}
        {prospect.outcome !== 'open' ? (
          <StatusPill kind="prospect" value={prospect.outcome} />
        ) : (
          prospect.notes && (
            <p className="relative z-10 line-clamp-2 text-xs text-muted-foreground">
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
}

/** Sortable + draggable instance placed inside a column. */
export function ProspectCard({ prospect, disabled }: ProspectCardProps) {
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

  return (
    <ProspectCardBody
      ref={setNodeRef}
      prospect={prospect}
      dragging={isDragging}
      style={style}
      // Drag from anywhere on the card.
      {...attributes}
      {...listeners}
      className={cn(
        'touch-none',
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
      )}
      handle={
        <span
          aria-hidden
          className="absolute left-0 top-0 flex h-full w-7 items-center justify-center text-muted-foreground/40"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      }
      link={
        // Mirrored Lista contatti cards have no detail route — drag-only.
        prospect.listaContattiId ? undefined : (
          <Link
            href={`/percorso-prospect/${prospect.id}`}
            className="absolute inset-y-0 left-7 right-0 z-0 rounded-r-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Apri ${prospect.full_name}`}
          />
        )
      }
    />
  );
}
