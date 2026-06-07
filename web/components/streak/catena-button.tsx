'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Flame,
  Check,
  Loader2,
  RefreshCw,
  Video,
  ListChecks,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DmoStatus } from '@/lib/data/streak';
import { refreshDmoStatusAction } from '@/app/(app)/team/[id]/actions';

/**
 * "Catena d'Oro" — the daily-streak chip shown next to the user's own name. A
 * flame + day count that glows RED while today's DMO tasks are pending and GOLD
 * once all are done. Tapping it opens a gamified sheet with the 3 daily tasks and
 * the streak. The status is seeded from the server and can be refreshed in-place
 * (so completing a task and tapping "Aggiorna" updates the chain without a reload).
 */
export function CatenaButton({ initial }: { initial: DmoStatus }) {
  const t = useTranslations('catena');
  const [status, setStatus] = React.useState<DmoStatus>(initial);
  const [open, setOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const done = status.allDone;
  const doneCount = [status.present, status.lista, status.funnel].filter(Boolean).length;

  async function refresh() {
    setRefreshing(true);
    try {
      const next = await refreshDmoStatusAction();
      if (!next.demo) setStatus(next);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('tooltip', { n: status.streak })}
        aria-label={t('tooltip', { n: status.streak })}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-bold tabular-nums transition-all duration-base ease-standard hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          done
            ? 'border-warning/45 bg-warning/10 text-warning shadow-[0_0_14px_hsl(var(--warning)/0.45)]'
            : 'border-danger/45 bg-danger/10 text-danger shadow-[0_0_14px_hsl(var(--danger)/0.4)] animate-glow-pulse',
        )}
      >
        <Flame className="h-4 w-4 transition-transform group-hover:scale-110" aria-hidden />
        <span>{status.streak}</span>
      </button>

      <Modal open={open} onOpenChange={setOpen} title={t('title')} size="md">
        <div className="space-y-5">
          {/* Streak hero */}
          <div
            className={cn(
              'relative overflow-hidden rounded-2xl border p-6 text-center',
              done
                ? 'border-warning/40 bg-gradient-to-b from-warning/[0.12] to-transparent'
                : 'border-danger/30 bg-gradient-to-b from-danger/[0.08] to-transparent',
            )}
          >
            <span
              className={cn(
                'pointer-events-none absolute left-1/2 top-0 h-28 w-28 -translate-x-1/2 -translate-y-10 rounded-full blur-3xl',
                done ? 'bg-warning/30 animate-glow-pulse' : 'bg-danger/20',
              )}
              aria-hidden
            />
            <Flame
              className={cn(
                'relative mx-auto h-12 w-12',
                done ? 'text-warning' : 'text-danger',
              )}
              aria-hidden
            />
            <p
              className={cn(
                'relative mt-2 text-4xl font-extrabold tabular-nums tracking-tight',
                done ? 'text-warning' : 'text-foreground',
              )}
            >
              {status.streak}
            </p>
            <p className="relative text-sm font-medium text-muted-foreground">
              {t('streak_days', { n: status.streak })}
            </p>
            <p
              className={cn(
                'relative mt-3 text-sm font-semibold',
                done ? 'text-warning' : 'text-danger',
              )}
            >
              {done ? t('today_done') : t('progress', { done: doneCount })}
            </p>
            <p className="relative mt-0.5 text-xs text-muted-foreground">
              {done ? t('subtitle_done') : t('subtitle_pending')}
            </p>
          </div>

          {/* Daily tasks */}
          <div className="space-y-2">
            <TaskRow icon={Video} label={t('task_call')} done={status.present} />
            <TaskRow icon={ListChecks} label={t('task_lista')} done={status.lista} />
            <TaskRow icon={Target} label={t('task_funnel')} done={status.funnel} />
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              {t('refresh')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function TaskRow({
  icon: Icon,
  label,
  done,
}: {
  icon: LucideIcon;
  label: string;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
        done ? 'border-success/30 bg-success/[0.06]' : 'border-border/70 bg-card',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          done ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 text-sm font-medium',
          done ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          done ? 'border-success bg-success text-white' : 'border-input',
        )}
        aria-hidden
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </span>
    </div>
  );
}
