import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  STATUS_LABELS,
  type ActivityIndicator,
  type MarketerStatus,
} from '@/lib/types/db';

/**
 * StatusDot — a colored dot signalling a marketer's `status` (or, with
 * `kind="activity"`, the rolled-up `activityIndicator` from doc 14 §7.2). Color
 * is never the sole signal: the dot carries an accessible label (visible when
 * `showLabel`, otherwise via `title`/`aria-label`).
 */

const statusTone: Record<MarketerStatus, { dot: string; ring: string }> = {
  active: { dot: 'bg-success', ring: 'ring-success/30' },
  pending: { dot: 'bg-warning', ring: 'ring-warning/30' },
  inactive: { dot: 'bg-muted-foreground', ring: 'ring-muted-foreground/30' },
};

const activityTone: Record<ActivityIndicator, { dot: string; ring: string }> = {
  hot: { dot: 'bg-activity-hot', ring: 'ring-activity-hot/30' },
  warm: { dot: 'bg-activity-warm', ring: 'ring-activity-warm/30' },
  cold: { dot: 'bg-activity-cold', ring: 'ring-activity-cold/30' },
  dormant: { dot: 'bg-activity-dormant', ring: 'ring-activity-dormant/30' },
};

const ACTIVITY_LABELS: Record<ActivityIndicator, string> = {
  hot: 'Molto attivo',
  warm: 'Attivo',
  cold: 'Poco attivo',
  dormant: 'Inattivo',
};

type StatusDotProps =
  | ({
      kind?: 'status';
      value: MarketerStatus;
    } & CommonProps)
  | ({
      kind: 'activity';
      value: ActivityIndicator;
    } & CommonProps);

interface CommonProps extends React.HTMLAttributes<HTMLSpanElement> {
  showLabel?: boolean;
  /** Subtle pulse for "live"/hot states. */
  pulse?: boolean;
  /** Override the resolved label text. */
  label?: string;
}

export function StatusDot(props: StatusDotProps) {
  const {
    kind = 'status',
    value,
    showLabel,
    pulse,
    label,
    className,
    ...rest
  } = props as StatusDotProps & { kind: 'status' | 'activity' };

  const tone =
    kind === 'activity'
      ? activityTone[value as ActivityIndicator]
      : statusTone[value as MarketerStatus];
  const text =
    label ??
    (kind === 'activity'
      ? ACTIVITY_LABELS[value as ActivityIndicator]
      : STATUS_LABELS[value as MarketerStatus]);

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={showLabel ? undefined : text}
      {...rest}
    >
      <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
        {pulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
              tone.dot,
            )}
            aria-hidden
          />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full ring-2',
            tone.dot,
            tone.ring,
          )}
          aria-hidden
        />
      </span>
      {showLabel ? (
        <span className="text-xs font-medium text-foreground">{text}</span>
      ) : (
        <span className="sr-only">{text}</span>
      )}
    </span>
  );
}
