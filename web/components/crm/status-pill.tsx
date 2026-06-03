import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CALL_OUTCOME_LABELS,
  CALL_OUTCOME_TONE,
  CENTOS_RAPPORTO_LABELS,
  CENTOS_RAPPORTO_TONE,
  CENTOS_STATUS_LABELS,
  CENTOS_STATUS_TONE,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUS_TONE,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONE,
  PROSPECT_OUTCOME_LABELS,
  PROSPECT_OUTCOME_TONE,
  STAGE_LABELS,
  type CallOutcome,
  type CentosRapporto,
  type CentosStatus,
  type ContactStatus,
  type DocumentStatus,
  type ProspectOutcome,
  type ProspectStage,
} from '@/lib/types/db';

/**
 * StatusPill — a thin, domain-aware wrapper over the shared Badge primitive that
 * resolves the Italian label + the semantic tone for each CRM enum, so screens
 * render statuses consistently with one component. A small leading dot reinforces
 * the tone (color is never the sole signal — the text label is always present).
 */

type Tone = NonNullable<BadgeProps['variant']>;

const DOT_BY_TONE: Record<Tone, string> = {
  default: 'bg-primary',
  secondary: 'bg-muted-foreground',
  outline: 'bg-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  global: 'bg-branch-global',
  left: 'bg-branch-left',
  right: 'bg-branch-right',
};

interface BaseProps {
  /** Hide the leading tone dot. */
  hideDot?: boolean;
  className?: string;
}

type StatusPillProps = BaseProps &
  (
    | { kind: 'contact'; value: ContactStatus }
    | { kind: 'call'; value: CallOutcome }
    | { kind: 'document'; value: DocumentStatus }
    | { kind: 'prospect'; value: ProspectOutcome }
    | { kind: 'stage'; value: ProspectStage }
    | { kind: 'centos'; value: CentosStatus }
    | { kind: 'centos_rapporto'; value: CentosRapporto }
  );

function resolve(props: StatusPillProps): { label: string; tone: Tone } {
  switch (props.kind) {
    case 'contact':
      return { label: CONTACT_STATUS_LABELS[props.value], tone: CONTACT_STATUS_TONE[props.value] };
    case 'call':
      return { label: CALL_OUTCOME_LABELS[props.value], tone: CALL_OUTCOME_TONE[props.value] };
    case 'document':
      return { label: DOCUMENT_STATUS_LABELS[props.value], tone: DOCUMENT_STATUS_TONE[props.value] };
    case 'prospect':
      return { label: PROSPECT_OUTCOME_LABELS[props.value], tone: PROSPECT_OUTCOME_TONE[props.value] };
    case 'centos':
      return { label: CENTOS_STATUS_LABELS[props.value], tone: CENTOS_STATUS_TONE[props.value] };
    case 'centos_rapporto':
      return { label: CENTOS_RAPPORTO_LABELS[props.value], tone: CENTOS_RAPPORTO_TONE[props.value] };
    case 'stage':
      return { label: STAGE_LABELS[props.value], tone: 'secondary' };
  }
}

export function StatusPill(props: StatusPillProps) {
  const { hideDot, className } = props;
  const { label, tone } = resolve(props);
  return (
    <Badge variant={tone} className={className}>
      {!hideDot && (
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_BY_TONE[tone])}
          aria-hidden
        />
      )}
      {label}
    </Badge>
  );
}
