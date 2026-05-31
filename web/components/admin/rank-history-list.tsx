import { getTranslations } from 'next-intl/server';
import { ArrowRight, Medal } from 'lucide-react';
import { RANK_LABELS, type RankHistoryEntry } from '@/lib/types/db';
import { RankBadge } from '@/components/ui/rank-badge';
import { EmptyState } from '@/components/crm/empty-state';
import { formatDate } from '@/lib/utils';

/**
 * Rank history — a reverse-chronological timeline of immutable rank changes
 * (`rank_history`), each showing previous → new rank, who changed it and when.
 * Server-rendered.
 */
export async function RankHistoryList({ data }: { data: RankHistoryEntry[] }) {
  const t = await getTranslations('admin_ranghi');

  if (data.length === 0) {
    return (
      <EmptyState icon={<Medal />} title={t('empty_title')} description={t('empty_body')} />
    );
  }

  return (
    <ul className="space-y-3">
      {data.map((e) => (
        <li key={e.id} className="flex items-start gap-3 rounded-lg border bg-background p-3.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <Medal className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">{e.marketer_name}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {e.previous_rank ? (
                <>
                  <RankBadge rank={e.previous_rank} />
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <RankBadge rank={e.new_rank} />
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">{t('first_rank')}:</span>
                  <RankBadge rank={e.new_rank} />
                </>
              )}
            </div>
            {e.notes && <p className="text-sm text-muted-foreground">{e.notes}</p>}
            <p className="text-xs text-muted-foreground">
              {formatDate(e.changed_at)}
              {e.changed_by_name && <> · {t('changed_by', { name: e.changed_by_name })}</>}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
