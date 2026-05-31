import { getTranslations } from 'next-intl/server';
import { STAGE_LABELS, type FunnelStageOccupancy } from '@/lib/types/db';
import { formatNumber, formatPercent } from '@/lib/utils';

/**
 * Funnel chart — horizontal CSS bars, one per canonical stage, width scaled to
 * the prospects that ever *reached* the stage (throughput). A nested bar shows
 * how many are still *open* there, and a per-step drop-off % annotates the
 * narrowing. Server-rendered (no chart lib — Recharts isn't a dependency).
 */
export async function FunnelChart({ data }: { data: FunnelStageOccupancy[] }) {
  const t = await getTranslations('analytics');
  const max = Math.max(1, ...data.map((d) => d.reached));

  return (
    <div className="space-y-3">
      {data.map((row, i) => {
        const prev = i > 0 ? data[i - 1]! : null;
        const drop =
          prev && prev.reached > 0
            ? 1 - row.reached / prev.reached
            : null;
        const reachedPct = (row.reached / max) * 100;
        const openPct = row.reached > 0 ? (row.open / row.reached) * 100 : 0;
        return (
          <div key={row.stage} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">
                {STAGE_LABELS[row.stage]}
              </span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {formatNumber(row.reached)}
                </span>{' '}
                {t('funnel_reached').toLowerCase()}
                {row.open > 0 && (
                  <>
                    {' · '}
                    {formatNumber(row.open)} {t('funnel_open').toLowerCase()}
                  </>
                )}
              </span>
            </div>
            <div className="relative h-7 w-full overflow-hidden rounded-md bg-muted/50">
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-primary/25"
                style={{ width: `${reachedPct}%` }}
                aria-hidden
              />
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-primary/70"
                style={{ width: `${(reachedPct * openPct) / 100}%` }}
                aria-hidden
              />
            </div>
            {drop != null && drop > 0 && (
              <p className="text-right text-xs text-muted-foreground">
                {t('funnel_drop')} −{formatPercent(drop, 0)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
