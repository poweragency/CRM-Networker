import { getTranslations } from 'next-intl/server';
import { RANK_LABELS, type MarketerRank } from '@/lib/types/db';
import { formatNumber } from '@/lib/utils';

/**
 * Rank distribution — one horizontal bar per rank, width scaled to the largest
 * bucket, with the absolute count. Server-rendered (CSS bars, no chart lib).
 */
export async function RankDistribution({
  data,
}: {
  data: { rank: MarketerRank; count: number }[];
}) {
  const t = await getTranslations('admin_ranghi');
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="space-y-2.5">
      {data.map((row) => (
        <div key={row.rank} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3">
          <span className="truncate text-sm font-medium text-foreground">
            {RANK_LABELS[row.rank]}
          </span>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(row.count / max) * 100}%` }}
              aria-hidden
            />
          </div>
          <span className="text-right text-sm tabular-nums text-muted-foreground">
            {formatNumber(row.count)}
          </span>
        </div>
      ))}
      <p className="pt-1 text-xs text-muted-foreground">
        {formatNumber(data.reduce((a, b) => a + b.count, 0))} {t('marketers')}
      </p>
    </div>
  );
}
