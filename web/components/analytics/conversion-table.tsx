import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { STAGE_LABELS, type StageConversion } from '@/lib/types/db';
import { formatNumber, formatPercent } from '@/lib/utils';

/** Format an avg time-in-stage (seconds) as Italian days, e.g. "5,8 g". */
function formatDays(secs: number): string {
  if (!secs || secs <= 0) return '—';
  const days = secs / 86_400;
  return `${formatNumber(days, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g`;
}

/**
 * Conversion table — per-stage entries, the % that advanced to the next stage
 * (exited / entered) as a bar, and the average time spent in the stage. The last
 * stage (iscrizione) is terminal so it shows no onward conversion. Server-rendered.
 */
export async function ConversionTable({ data }: { data: StageConversion[] }) {
  const t = await getTranslations('analytics');

  return (
    <div className="space-y-3">
      {data.map((row, i) => {
        const isLast = i === data.length - 1;
        const rate = row.entered > 0 ? row.exited / row.entered : 0;
        return (
          <div
            key={row.stage}
            className="grid grid-cols-1 gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className="truncate">{STAGE_LABELS[row.stage]}</span>
                {!isLast && (
                  <>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate text-muted-foreground">
                      {STAGE_LABELS[data[i + 1]!.stage]}
                    </span>
                  </>
                )}
              </div>
              {!isLast ? (
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-success/70"
                    style={{ width: `${Math.min(100, rate * 100)}%` }}
                    aria-hidden
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('conversion_entered')}: {formatNumber(row.entered)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              {!isLast && (
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatPercent(rate, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('conversion_rate')}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatDays(row.avg_time_in_stage_secs)}
                </p>
                <p className="text-xs text-muted-foreground">{t('conversion_avg_time')}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
