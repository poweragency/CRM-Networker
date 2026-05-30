import * as React from 'react';
import { ChevronRight, Lock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { WhyProgress } from './why-progress';
import type { SevenWhysRosterRow } from '@/lib/data/seven-whys-shared';

/**
 * PersonCard — one roster tile: a marketer (subject) with their Sette Perché
 * progress and headline. Self records are highlighted and labelled "Tu"; team
 * records carry a read-only lock. Server-safe (no hooks) — interactivity is
 * supplied by the parent via `onOpen` (rendered as a button when provided) or by
 * wrapping in a link. The whole card is the click target.
 */
export interface PersonCardProps {
  row: SevenWhysRosterRow;
  /** Label for the "you" badge / not-started / read-only — passed from the i18n-aware parent. */
  labels: {
    you: string;
    notStarted: string;
    noSubject: string;
    readOnly: string;
  };
  onOpen?: () => void;
  className?: string;
}

export function PersonCard({ row, labels, onOpen, className }: PersonCardProps) {
  const { person_name, is_self, record, filled } = row;
  const subject = record?.subject?.trim();
  const primary = record?.primary_why_index ?? null;

  const inner = (
    <>
      <div className="flex items-start gap-3">
        <Avatar name={person_name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-foreground">{person_name}</p>
            {is_self ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {labels.you}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                title={labels.readOnly}
              >
                <Lock className="h-2.5 w-2.5" aria-hidden />
                {labels.readOnly}
              </span>
            )}
          </div>
          <p
            className={cn(
              'mt-0.5 line-clamp-2 text-xs',
              subject ? 'text-muted-foreground' : 'italic text-muted-foreground/70',
            )}
          >
            {subject || (filled > 0 ? labels.noSubject : labels.notStarted)}
          </p>
        </div>
        <WhyProgress filled={filled} size={40} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-3">
        {primary ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            <Star className="h-3 w-3 fill-current" aria-hidden />
            {`Perché ${primary}`}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {filled > 0 ? `${filled}/7` : labels.notStarted}
          </span>
        )}
        <ChevronRight
          className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </>
  );

  const cardClass = cn(
    'group flex w-full flex-col rounded-xl border bg-card p-4 text-left transition-colors',
    is_self
      ? 'border-primary/40 ring-1 ring-primary/20 hover:border-primary/60'
      : 'border-border hover:border-foreground/20 hover:bg-muted/30',
    className,
  );

  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={cardClass}>
        {inner}
      </button>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}
