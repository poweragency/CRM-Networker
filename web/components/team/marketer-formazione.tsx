'use client';

import * as React from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpen, Check, ListVideo, MonitorPlay } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import { saveFormazioneAction } from '@/app/(app)/team/[id]/actions';

/**
 * MarketerFormazione — the "Formazione" section of the marketer profile (mirrors
 * on /team/[id] and /impostazioni). Three areas — le playlist viste su WOW, le
 * playlist viste su Click e i libri letti — each a fixed checklist the marketer
 * spunta man mano. The catalog ({@link FORMAZIONE_CATALOG}) is the same for
 * everyone; only the ticked set is per-person, saved through the demo-safe action
 * (mock-backed for now). Read-only when viewing someone else's profile.
 */

export interface TrainingItem {
  id: string;
  title: string;
  /** Optional secondary line (es. il docente). */
  meta?: string;
}

/** Fixed catalog — same for every marketer; only the ticked set is per-person. */
export const FORMAZIONE_CATALOG: {
  wow: TrainingItem[];
  click: TrainingItem[];
  books: TrainingItem[];
} = {
  wow: [
    { id: 'wow_analisi_tecnica_base', title: 'Analisi tecnica di base', meta: 'Fabrizio' },
    { id: 'wow_basi_forex', title: 'Le basi del forex', meta: 'Fabrizio' },
    { id: 'wow_psicologia_trading', title: 'Psicologia del trading', meta: 'Giuliano' },
    { id: 'wow_base_a_pro', title: 'Da base a pro', meta: 'Giuliano' },
  ],
  click: [
    { id: 'click_onboarding', title: 'Onboarding' },
    { id: 'click_customer_onboarding', title: 'Customer onboarding' },
    { id: 'click_approfondimento_mercati', title: 'Approfondimento sui mercati' },
    {
      id: 'click_master_network_hop_on_the_bull',
      title: 'Master in network marketing — Hop on the Bull',
    },
    { id: 'click_master_social_media', title: 'Master in social media' },
    { id: 'click_6_month_premium_space', title: '6 month premium space' },
  ],
  books: [
    { id: 'book_b21', title: 'B21' },
    { id: 'book_segreti_mente_milionaria', title: 'Segreti di una mente milionaria' },
    { id: 'book_go_pro', title: 'Go Pro' },
    { id: 'book_go_for_no', title: 'Go for No' },
    { id: 'book_4_quadranti_cashflow', title: 'I 4 quadranti del cash flow' },
    { id: 'book_padre_ricco_padre_povero', title: 'Padre ricco padre povero' },
  ],
};

export function MarketerFormazione({
  marketerId,
  initialDone = [],
  readOnly = false,
}: {
  marketerId: string;
  /** Catalog IDs already ticked by this marketer. */
  initialDone?: string[];
  /** True when viewing someone else's profile — checkboxes are not editable. */
  readOnly?: boolean;
}) {
  const t = useTranslations('team');
  const { toast } = useToast();

  // A ref mirrors the ticked set so rapid toggles always build on the latest
  // value (each save replaces the whole set — a stale closure would drop ticks).
  const doneRef = React.useRef<Set<string>>(new Set(initialDone));
  const [done, setDone] = React.useState<Set<string>>(doneRef.current);

  function toggle(id: string) {
    if (readOnly) return;
    const next = new Set(doneRef.current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    doneRef.current = next;
    setDone(next);
    void persist([...next]);
  }

  async function persist(ids: string[]) {
    const res = await saveFormazioneAction(marketerId, ids);
    if (!res.ok) toast({ title: t('error'), variant: 'error' });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TrainingArea
        icon={<ListVideo className="h-[18px] w-[18px]" aria-hidden />}
        chip="bg-info/10 text-info"
        title={t('formazione_wow')}
        items={FORMAZIONE_CATALOG.wow}
        done={done}
        readOnly={readOnly}
        onToggle={toggle}
      />
      <TrainingArea
        icon={<MonitorPlay className="h-[18px] w-[18px]" aria-hidden />}
        chip="bg-primary/10 text-primary"
        title={t('formazione_click')}
        items={FORMAZIONE_CATALOG.click}
        done={done}
        readOnly={readOnly}
        onToggle={toggle}
      />
      <TrainingArea
        icon={<BookOpen className="h-[18px] w-[18px]" aria-hidden />}
        chip="bg-warning/10 text-warning"
        title={t('formazione_books')}
        items={FORMAZIONE_CATALOG.books}
        done={done}
        readOnly={readOnly}
        onToggle={toggle}
      />
    </div>
  );
}

function TrainingArea({
  icon,
  chip,
  title,
  items,
  done,
  readOnly,
  onToggle,
}: {
  icon: ReactNode;
  /** Tone classes for the icon chip (bg + text). */
  chip: string;
  title: string;
  items: TrainingItem[];
  done: Set<string>;
  readOnly: boolean;
  onToggle: (id: string) => void;
}) {
  const doneCount = items.reduce((n, it) => (done.has(it.id) ? n + 1 : n), 0);
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const complete = doneCount === items.length && items.length > 0;

  return (
    <Card
      className={cn(
        'flex flex-col transition-shadow duration-base ease-standard hover:shadow-card-hover',
        complete && 'ring-1 ring-warning/40 shadow-glow-warning',
      )}
    >
      <CardHeader className="space-y-0 p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', chip)}>
              {icon}
            </span>
            {title}
          </CardTitle>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              complete ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
            )}
          >
            {doneCount}/{items.length}
          </span>
        </div>
        {/* Progress bar — at-a-glance completion per area. Use a gradient
            (background-image), NOT a solid background-color: Samsung Internet's
            "dark mode for web" auto-darkens bright solid fills on mobile (the gold
            turns a muddy dark red right after it paints) but leaves background
            images untouched — same trick the wishlist bar already relies on. */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r transition-all duration-base ease-standard',
              complete ? 'from-warning/80 to-warning' : 'from-success/80 to-success',
            )}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4 pt-1">
        <ul className="space-y-1.5">
          {items.map((it) => {
            const isDone = done.has(it.id);
            return (
              <li key={it.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={it.title}
                  disabled={readOnly}
                  onClick={() => onToggle(it.id)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
                    isDone
                      ? complete
                        ? 'border-warning/40 bg-warning/[0.08]'
                        : 'border-success/30 bg-success/[0.06]'
                      : 'border-border/70 bg-card/60',
                    !readOnly && 'hover:border-ring/50 hover:bg-muted/40',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    readOnly && 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      // Same-colour gradients (background-image) so the filled box
                      // keeps its exact look but escapes Samsung Internet's auto-dark,
                      // which would otherwise turn the gold box dark red on mobile.
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border bg-gradient-to-br transition-colors',
                      isDone
                        ? complete
                          ? 'border-warning from-warning to-warning text-warning-foreground'
                          : 'border-success from-success to-success text-success-foreground'
                        : 'border-input from-transparent to-transparent',
                    )}
                    aria-hidden
                  >
                    {isDone && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-sm font-medium',
                        isDone ? 'text-muted-foreground line-through' : 'text-foreground',
                      )}
                    >
                      {it.title}
                    </span>
                    {it.meta && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {it.meta}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
