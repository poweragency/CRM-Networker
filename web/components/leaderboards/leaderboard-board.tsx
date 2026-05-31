import { getTranslations } from 'next-intl/server';
import { Medal, Trophy } from 'lucide-react';
import {
  isRatioMetric,
  RANK_LABELS,
  type LeaderboardEntry,
  type LeaderboardMetric,
} from '@/lib/types/db';
import { EmptyState } from '@/components/crm/empty-state';
import { Badge } from '@/components/ui/badge';
import { cn, formatNumber, formatPercent, initials } from '@/lib/utils';

/**
 * Leaderboard board — a top-3 podium plus the full ranked table for a metric.
 * Server-rendered; the viewer's own row is highlighted (`is_self`). Values are
 * formatted as percentages for ratio metrics (conversion) and counts otherwise.
 */

function fmtValue(metric: LeaderboardMetric, value: number): string {
  return isRatioMetric(metric) ? formatPercent(value, 1) : formatNumber(value);
}

const PODIUM_TONE = ['text-warning', 'text-muted-foreground', 'text-[#cd7f32]'] as const;
const PODIUM_RING = [
  'ring-warning/40 bg-warning/5',
  'ring-border bg-muted/30',
  'ring-[#cd7f32]/30 bg-[#cd7f32]/5',
] as const;

export async function LeaderboardBoard({
  entries,
  metric,
}: {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
}) {
  const t = await getTranslations('classifiche');

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Trophy />}
        title={t('empty_title')}
        description={t('empty_body')}
      />
    );
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6">
      {/* Podium */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {podium.map((e, i) => (
          <div
            key={e.marketer_id}
            className={cn(
              'flex items-center gap-3 rounded-xl border p-4 ring-1',
              PODIUM_RING[i],
              e.is_self && 'border-primary/50',
            )}
          >
            <div className="relative shrink-0">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                {initials(e.display_name)}
              </span>
              <Medal
                className={cn(
                  'absolute -bottom-1 -right-1 h-5 w-5',
                  PODIUM_TONE[i],
                )}
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                {e.display_name}
                {e.is_self && (
                  <Badge variant="default" className="px-1.5 py-0">
                    {t('you_badge')}
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{RANK_LABELS[e.rank]}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {fmtValue(metric, e.value)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Full table */}
      {rest.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full caption-bottom text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b text-xs font-medium text-muted-foreground">
                <th className="h-11 w-14 px-3 text-left">{t('col_position')}</th>
                <th className="h-11 px-3 text-left">{t('col_marketer')}</th>
                <th className="h-11 px-3 text-right">{t('col_value')}</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((e) => (
                <tr
                  key={e.marketer_id}
                  className={cn(
                    'border-b transition-colors last:border-0',
                    e.is_self && 'bg-primary/5',
                  )}
                >
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {e.rank_position}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {initials(e.display_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate font-medium text-foreground">
                          {e.display_name}
                          {e.is_self && (
                            <Badge variant="default" className="px-1.5 py-0">
                              {t('you_badge')}
                            </Badge>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {RANK_LABELS[e.rank]}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">
                    {fmtValue(metric, e.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
