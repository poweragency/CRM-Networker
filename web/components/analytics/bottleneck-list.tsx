import { getTranslations } from 'next-intl/server';
import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  BOTTLENECK_SEVERITY_LABELS,
  BOTTLENECK_SEVERITY_TONE,
  BOTTLENECK_TYPE_LABELS,
  STAGE_LABELS,
  type BottleneckFinding,
  type BottleneckSeverity,
} from '@/lib/types/db';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/crm/empty-state';
import { cn } from '@/lib/utils';

const SEVERITY_ICON: Record<BottleneckSeverity, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  critical: ShieldAlert,
};

const SEVERITY_ACCENT: Record<BottleneckSeverity, string> = {
  info: 'border-l-info',
  warning: 'border-l-warning',
  critical: 'border-l-danger',
};

const SEVERITY_ICON_TONE: Record<BottleneckSeverity, string> = {
  info: 'text-info',
  warning: 'text-warning',
  critical: 'text-danger',
};

/**
 * Bottleneck list — the open `bottleneck_findings` (doc 11 §10), each with its
 * severity, the affected marketer/stage, the breached threshold and the Italian
 * recommendation. Server-rendered; shows a positive empty state when clear.
 */
export async function BottleneckList({ data }: { data: BottleneckFinding[] }) {
  const t = await getTranslations('analytics');

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 />}
        title={t('bottleneck_empty_title')}
        description={t('bottleneck_empty_body')}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {data.map((f) => {
        const Icon = SEVERITY_ICON[f.severity];
        return (
          <li
            key={f.id}
            className={cn(
              'rounded-lg border border-l-4 bg-background p-3.5',
              SEVERITY_ACCENT[f.severity],
            )}
          >
            <div className="flex items-start gap-3">
              <Icon
                className={cn('mt-0.5 h-5 w-5 shrink-0', SEVERITY_ICON_TONE[f.severity])}
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{f.title_it}</p>
                  <Badge variant={BOTTLENECK_SEVERITY_TONE[f.severity]}>
                    {BOTTLENECK_SEVERITY_LABELS[f.severity]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{f.recommendation_it}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{BOTTLENECK_TYPE_LABELS[f.type]}</span>
                  {f.marketer_name && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-medium text-foreground">{f.marketer_name}</span>
                    </>
                  )}
                  {f.stage && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{STAGE_LABELS[f.stage]}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
