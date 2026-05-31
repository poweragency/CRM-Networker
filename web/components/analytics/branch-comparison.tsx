import { getTranslations } from 'next-intl/server';
import { PanelLeft, PanelRight } from 'lucide-react';
import type { BranchMetrics, SubtreeMetrics } from '@/lib/types/db';
import { formatNumber } from '@/lib/utils';

/**
 * Branch comparison — LEFT vs RIGHT on the key period metrics, each as a paired
 * bar scaled to the larger leg, with the GLOBAL total alongside. Reinforces the
 * binary model (doc 11 §7) at a glance. Server-rendered, branch-colored.
 */
const METRICS: ReadonlyArray<{ key: keyof SubtreeMetrics; labelKey: string }> = [
  { key: 'calls_total', labelKey: 'branch_metric_calls' },
  { key: 'new_prospects', labelKey: 'branch_metric_prospects' },
  { key: 'iscrizione', labelKey: 'branch_metric_iscrizioni' },
  { key: 'new_recruits', labelKey: 'branch_metric_recruits' },
];

export async function BranchComparison({ data }: { data: BranchMetrics }) {
  const t = await getTranslations('analytics');
  const tb = await getTranslations('branch');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 text-branch-left">
          <PanelLeft className="h-3.5 w-3.5" aria-hidden />
          {tb('left')}
        </span>
        <span className="inline-flex items-center gap-1.5 text-branch-right">
          <PanelRight className="h-3.5 w-3.5" aria-hidden />
          {tb('right')}
        </span>
      </div>

      {METRICS.map(({ key, labelKey }) => {
        const left = data.LEFT[key];
        const right = data.RIGHT[key];
        const total = data.GLOBAL[key];
        const max = Math.max(1, left, right);
        return (
          <div key={String(key)} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{t(labelKey)}</span>
              <span className="text-xs text-muted-foreground">
                {t('branch_total')}:{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatNumber(total)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-branch-left">
                {formatNumber(left)}
              </span>
              <div className="flex h-2.5 flex-1 items-center justify-end overflow-hidden rounded-l-full bg-muted/50">
                <div
                  className="h-full rounded-l-full bg-branch-left/70"
                  style={{ width: `${(left / max) * 100}%` }}
                  aria-hidden
                />
              </div>
              <div className="flex h-2.5 flex-1 items-center overflow-hidden rounded-r-full bg-muted/50">
                <div
                  className="h-full rounded-r-full bg-branch-right/70"
                  style={{ width: `${(right / max) * 100}%` }}
                  aria-hidden
                />
              </div>
              <span className="w-10 shrink-0 text-xs font-medium tabular-nums text-branch-right">
                {formatNumber(right)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
