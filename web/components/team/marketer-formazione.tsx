import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { BookOpen, Check, ListVideo, MonitorPlay } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/crm/empty-state';

/**
 * MarketerFormazione — the "Formazione" section of the marketer profile (mirrors
 * on /team/[id] and /impostazioni). Three areas: le playlist viste su WOW, le
 * playlist viste su Click e i libri letti. Content is per-person and still to be
 * defined, so each area renders its items when present and an empty placeholder
 * otherwise. Pure presentation; data is passed in by the page.
 */

export interface TrainingItem {
  id: string;
  title: string;
  /** Optional secondary line (es. autore, numero di episodi, data). */
  meta?: string;
  /** Visto / letto. */
  done?: boolean;
}

export async function MarketerFormazione({
  wow = [],
  click = [],
  books = [],
}: {
  wow?: TrainingItem[];
  click?: TrainingItem[];
  books?: TrainingItem[];
}) {
  const t = await getTranslations('team');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TrainingArea
        icon={<ListVideo className="h-[18px] w-[18px]" aria-hidden />}
        title={t('formazione_wow')}
        items={wow}
        emptyTitle={t('formazione_empty')}
        emptyBody={t('formazione_empty_body')}
      />
      <TrainingArea
        icon={<MonitorPlay className="h-[18px] w-[18px]" aria-hidden />}
        title={t('formazione_click')}
        items={click}
        emptyTitle={t('formazione_empty')}
        emptyBody={t('formazione_empty_body')}
      />
      <TrainingArea
        icon={<BookOpen className="h-[18px] w-[18px]" aria-hidden />}
        title={t('formazione_books')}
        items={books}
        emptyTitle={t('formazione_empty')}
        emptyBody={t('formazione_empty_body')}
      />
    </div>
  );
}

function TrainingArea({
  icon,
  title,
  items,
  emptyTitle,
  emptyBody,
}: {
  icon: ReactNode;
  title: string;
  items: TrainingItem[];
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </span>
          {title}
        </CardTitle>
        {items.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {items.length}
          </span>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-4 pt-0">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyBody} icon={icon} />
        ) : (
          <ul className="space-y-1.5">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-start gap-2.5 rounded-lg border bg-card/60 p-2.5"
              >
                <span
                  className={
                    it.done
                      ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success'
                      : 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
                  }
                  aria-hidden
                >
                  {it.done ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {it.title}
                  </span>
                  {it.meta && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {it.meta}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
