import * as React from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, Video, MessageCircle } from 'lucide-react';
import { cn, formatDateTime, formatDuration } from '@/lib/utils';
import { StatusPill } from '@/components/crm/status-pill';
import { CALL_TYPE_LABELS, type CallType, type CallWithTarget } from '@/lib/types/db';

/**
 * ProspectCalls — the call history for a single prospect, rendered as a compact
 * list (type icon, outcome pill, duration, when, note). Server-safe (no hooks);
 * used inside the RSC prospect-detail page.
 */

const CALL_ICON: Record<CallType, typeof Phone> = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  video: Video,
  whatsapp: MessageCircle,
};

export interface ProspectCallsProps {
  calls: CallWithTarget[];
  className?: string;
}

export function ProspectCalls({ calls, className }: ProspectCallsProps) {
  if (calls.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessuna chiamata registrata per questo prospect.
      </p>
    );
  }

  return (
    <ul className={cn('space-y-2', className)}>
      {calls.map((call) => {
        const Icon = CALL_ICON[call.call_type];
        return (
          <li
            key={call.id}
            className="flex items-start gap-3 rounded-lg border bg-background p-3"
          >
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {CALL_TYPE_LABELS[call.call_type]}
                </span>
                <StatusPill kind="call" value={call.outcome} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {formatDateTime(call.occurred_at)}
                </span>
                {call.duration_secs > 0 && (
                  <span className="tabular-nums">
                    {formatDuration(call.duration_secs)}
                  </span>
                )}
              </div>
              {call.notes && (
                <p className="text-xs text-foreground">{call.notes}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
