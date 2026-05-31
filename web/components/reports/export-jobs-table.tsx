import { getTranslations } from 'next-intl/server';
import { Download, FileClock } from 'lucide-react';
import {
  EXPORT_FORMAT_LABELS,
  EXPORT_STATUS_LABELS,
  EXPORT_STATUS_TONE,
  type ExportJob,
} from '@/lib/types/db';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/crm/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn, formatDate, formatNumber } from '@/lib/utils';

/** Known report-type keys → i18n label keys (unknown types show raw). */
const TYPE_KEY: Record<string, string> = {
  monthly_performance: 'type_monthly_performance',
  team_report: 'type_team_report',
  funnel_report: 'type_funnel_report',
  conversion_report: 'type_conversion_report',
  rank_report: 'type_rank_report',
  leaderboard_export: 'type_leaderboard_export',
};

/**
 * Export jobs table — the caller's `report_export_jobs` (doc 15 §11.2) with the
 * lifecycle status, format and row count. Ready artifacts expose a download link;
 * other states are read-only. Server-rendered.
 */
export async function ExportJobsTable({ data }: { data: ExportJob[] }) {
  const t = await getTranslations('report');

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<FileClock />}
        title={t('empty_jobs_title')}
        description={t('empty_jobs_body')}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full caption-bottom text-sm">
        <thead className="bg-muted/60">
          <tr className="border-b text-xs font-medium text-muted-foreground">
            <th className="h-11 px-3 text-left">{t('col_type')}</th>
            <th className="h-11 px-3 text-left">{t('col_format')}</th>
            <th className="h-11 px-3 text-left">{t('col_status')}</th>
            <th className="h-11 px-3 text-right">{t('col_rows')}</th>
            <th className="h-11 px-3 text-left">{t('col_created')}</th>
            <th className="h-11 px-3 text-right">{t('col_download')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((job) => {
            const typeKey = TYPE_KEY[job.report_type];
            return (
              <tr key={job.id} className="border-b transition-colors last:border-0">
                <td className="px-3 py-2.5 font-medium text-foreground">
                  {typeKey ? t(typeKey) : job.report_type}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline">{EXPORT_FORMAT_LABELS[job.format]}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={EXPORT_STATUS_TONE[job.status]}>
                    {EXPORT_STATUS_LABELS[job.status]}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {job.row_count != null ? formatNumber(job.row_count) : '—'}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {formatDate(job.created_at)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {job.status === 'ready' ? (
                    <span
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'cursor-default',
                      )}
                      aria-disabled
                      title={t('download')}
                    >
                      <Download aria-hidden />
                      {t('download')}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
