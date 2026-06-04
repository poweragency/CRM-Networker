'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { StatusPill } from '@/components/crm/status-pill';
import type { ProspectView } from './types';

/**
 * ProspectCard — a single prospect on the kanban board. Shows the name, the
 * owner (avatar + chip), how long it has sat in the current stage, and the
 * outcome pill for non-open prospects.
 *
 * Interaction split (avoids the classic drag-vs-click conflict): the left grip
 * is the ONLY drag handle (dnd-kit listeners bound there), while the card body
 * is a link into the detail route. So a click opens the prospect and a drag
 * starts only from the grip.
 */

/** Days a prospect has been in its current stage (>= 0). */
function daysInStage(since: string): number {
  const diff = Date.now() - new Date(since).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

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
  const days = daysInStage(prospect.current_stage_since);
  const stale = days >= 7;
  const fromList = Boolean(prospect.listaContattiId);

  return (
    <div
      ref={ref}
      className={cn(
        'group relative rounded-lg border bg-card p-3 text-card-foreground shadow-sm transition-shadow',
        fromList ? 'pl-3' : 'pl-7',
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

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-1 tabular-nums',
              stale ? 'text-warning' : 'text-muted-foreground',
            )}
            title={`In fase da ${days} giorni`}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {days === 0 ? 'oggi' : `${days}g in fase`}
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
    setActivatorNodeRef,
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
      handle={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={`Trascina ${prospect.full_name}`}
          className={cn(
            'absolute left-0 top-0 z-20 flex h-full w-7 touch-none items-center justify-center rounded-l-lg text-muted-foreground/40 transition-colors',
            'hover:bg-muted/60 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
          )}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      }
      link={
        <Link
          href={`/percorso-prospect/${prospect.id}`}
          className="absolute inset-y-0 left-7 right-0 z-0 rounded-r-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Apri ${prospect.full_name}`}
        />
      }
    />
  );
}
