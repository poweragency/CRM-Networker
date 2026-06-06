import * as React from 'react';
import { Check, CircleDot, MessageSquare, User } from 'lucide-react';
import { cn, formatDateTime, formatDuration } from '@/lib/utils';
import { StatusPill } from '@/components/crm/status-pill';
import {
  STAGE_LABELS,
  stageIndex,
  type ProspectJourneyEvent,
} from '@/lib/types/db';
import { stageTokens } from './stage-tokens';

/**
 * JourneyTimeline — the prospect's stage history as a vertical timeline. One
 * node per stage transition: entered / exited timestamps, time-in-stage,
 * responsible marketer and any transition note. The open (current) stage is
 * highlighted; closed stages show a check. Server-safe (no hooks) so it renders
 * inside the RSC detail page.
 */

export interface JourneyTimelineProps {
  events: ProspectJourneyEvent[];
  /** marketer_id → display name (resolved server-side). */
  responsibleNames?: Record<string, string>;
  className?: string;
}

export function JourneyTimeline({
  events,
  responsibleNames,
  className,
}: JourneyTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nessuna fase registrata.</p>
    );
  }

  // Most-recent-first reads better as a history feed.
  const ordered = [...events].sort(
    (a, b) => new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime(),
  );

  return (
    <ol className={cn('relative space-y-0', className)}>
      {ordered.map((ev, i) => {
        const open = ev.exited_at === null;
        const last = i === ordered.length - 1;
        const tok = stageTokens(ev.to_stage);
        const responsible =
          responsibleNames?.[ev.responsible_marketer_id] ?? null;
        const duration =
          ev.time_in_stage_secs != null
            ? formatDuration(ev.time_in_stage_secs)
            : null;

        return (
          <li key={ev.id} className="relative flex gap-3.5 pb-6 last:pb-0">
            {/* Connector line */}
            {!last && (
              <span
                className="absolute left-[15px] top-8 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-border to-border/40"
                aria-hidden
              />
            )}

            {/* Node */}
            <span
              className={cn(
                'relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 shadow-xs',
                open
                  ? cn('bg-card', tok.border, tok.text)
                  : 'border-success/40 bg-success/12 text-success',
              )}
              aria-hidden
            >
              {open ? (
                <CircleDot className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </span>

            <div
              className={cn(
                'min-w-0 flex-1 space-y-2 rounded-xl border p-3.5 transition-shadow',
                open
                  ? cn('border-border/70 bg-card shadow-card', tok.bgFaint)
                  : 'border-border/50 bg-card/60',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill kind="stage" value={ev.to_stage} />
                <span className="text-xs tabular-nums text-muted-foreground">
                  Fase {stageIndex(ev.to_stage)}/6
                </span>
                {open && (
                  <span
                    className={cn(
                      'ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      tok.bgSoft,
                      tok.text,
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        tok.bg,
                        'animate-glow-pulse',
                      )}
                      aria-hidden
                    />
                    In corso
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Ingresso{' '}
                  <span className="font-medium text-foreground">
                    {formatDateTime(ev.entered_at)}
                  </span>
                </span>
                {ev.exited_at && (
                  <span>
                    Uscita{' '}
                    <span className="font-medium text-foreground">
                      {formatDateTime(ev.exited_at)}
                    </span>
                  </span>
                )}
                {duration && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold text-foreground">
                    {duration} in fase
                  </span>
                )}
              </div>

              {ev.from_stage && (
                <p className="text-xs text-muted-foreground">
                  Da{' '}
                  <span className="font-medium text-foreground">
                    {STAGE_LABELS[ev.from_stage]}
                  </span>{' '}
                  → {STAGE_LABELS[ev.to_stage]}
                </p>
              )}

              {responsible && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5" aria-hidden />
                  {responsible}
                </p>
              )}

              {ev.notes && (
                <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-xs leading-relaxed text-foreground">
                  <MessageSquare
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  {ev.notes}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
