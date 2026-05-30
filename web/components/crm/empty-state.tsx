import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * EmptyState — the standard "nothing here yet" surface for lists, boards and
 * filtered results. Server-safe; pass an action (e.g. a "Crea" button) as
 * children or via `action`.
 */
export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Defaults to an inbox glyph; pass a lucide icon element to override. */
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** `card` (bordered panel) or `bare` (inline, e.g. inside a table). */
  variant?: 'card' | 'bare';
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  variant = 'card',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        variant === 'card' && 'rounded-xl border border-dashed bg-card/40',
        className,
      )}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:h-6 [&_svg]:w-6"
        aria-hidden
      >
        {icon ?? <Inbox />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
