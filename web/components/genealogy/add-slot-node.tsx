'use client';

import * as React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';
import type { PlacementLeg } from '@/lib/types/db';
import { cn } from '@/lib/utils';

/**
 * AddSlotNode — the "+" affordance rendered in an empty placement leg of the
 * targeted node (the selected node, or the root when nothing is selected). Same
 * footprint as a marketer card so the tidy layout stays aligned; clicking it asks
 * the view to open the "add member" dialog for (parentId, leg). Static (not
 * draggable/selectable); the inner button stops propagation so the canvas
 * select handler ignores it.
 */

export interface AddSlotNodeData {
  parentId: string;
  leg: PlacementLeg;
  onAdd: (parentId: string, leg: PlacementLeg) => void;
  [key: string]: unknown;
}

function AddSlotNodeImpl({ data }: NodeProps) {
  const d = data as AddSlotNodeData;
  const legTint =
    d.leg === 'LEFT'
      ? 'hover:border-branch-left/60 hover:bg-branch-left/10 hover:text-branch-left'
      : 'hover:border-branch-right/60 hover:bg-branch-right/10 hover:text-branch-right';
  return (
    <div className="group relative h-[150px] w-[248px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-1.5 !w-1.5 !border-0 !bg-border"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          d.onAdd(d.parentId, d.leg);
        }}
        aria-label="Aggiungi membro"
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/80 bg-muted/20 text-muted-foreground transition-all duration-base ease-emphasized',
          'hover:-translate-y-0.5 hover:shadow-card-hover',
          legTint,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-current transition-transform duration-base group-hover:scale-110">
          <Plus className="h-6 w-6" aria-hidden />
        </span>
      </button>
    </div>
  );
}

export const AddSlotNode = React.memo(AddSlotNodeImpl);
