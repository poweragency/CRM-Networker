import { getTranslations } from 'next-intl/server';
import { ArrowDownRight, ArrowUpRight, Building2, CalendarDays } from 'lucide-react';
import type { MetricsPayload, MonthlyReport } from '@/lib/types/db';
import { REPORT_PERIOD_LABELS } from '@/lib/types/db';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExportButton } from '@/components/reports/export-button';
import { cn, formatDate, formatNumber, formatPercent } from '@/lib/utils';

/** A signed MoM/QoQ change pill (↑ green / ↓ red). Hidden when there's no prior. */
function Delta({ pct }: { pct: number | undefined }) {
  if (pct == null || pct === 0) return null;
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
        up ? 'text-success' : 'text-danger',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {formatPercent(Math.abs(pct), 0)}
    </span>
  );
}

export async function ReportCard({ report }: { report: MonthlyReport }) {
  const t = await getTranslations('report');
  const m = report.metrics;
  const dp = report.delta_pct;

  const metrics: ReadonlyArray<{
    key: keyof MetricsPayload;
    labelKey: string;
    value: string;
  }> = [
    { key: 'iscrizione', labelKey: 'metric_iscrizioni', value: formatNumber(m.iscrizione) },
    { key: 'new_prospects', labelKey: 'metric_new_prospects', value: formatNumber(m.new_prospects) },
    { key: 'calls_total', labelKey: 'metric_calls', value: formatNumber(m.calls_total) },
    { key: 'conv_overall', labelKey: 'metric_conversion', value: formatPercent(m.conv_overall, 1) },
    { key: 'active_members', labelKey: 'metric_team', value: formatNumber(m.active_members) },
    { key: 'new_recruits', labelKey: 'metric_recruits', value: formatNumber(m.new_recruits) },
  ];

  const isOrg = report.marketer_id == null;
  const subject = isOrg ? t('subject_org') : report.subject_name ?? '—';

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-5 pb-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight text-foreground">
              {isOrg && <Building2 className="mr-1 inline h-4 w-4 text-muted-foreground" aria-hidden />}
              {subject}
            </h3>
            <Badge variant="secondary">{REPORT_PERIOD_LABELS[report.period]}</Badge>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {formatDate(report.period_start)} – {formatDate(report.period_end)}
            <span aria-hidden>·</span>
            {t('generated')} {formatDate(report.generated_at)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metrics.map(({ key, labelKey, value }) => (
            <div key={String(key)} className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">{t(labelKey)}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {value}
                </span>
                <Delta pct={dp?.[key]} />
              </p>
            </div>
          ))}
        </div>
        {report.previous_metrics && (
          <p className="text-xs text-muted-foreground">{t('vs_previous')}</p>
        )}
        <ExportButton reportType="monthly_performance" marketerId={report.marketer_id} />
      </CardContent>
    </Card>
  );
}
