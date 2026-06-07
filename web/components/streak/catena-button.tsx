'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Flame,
  Check,
  BookOpen,
  Instagram,
  Video,
  UserPlus,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import type { DmoStatus } from '@/lib/data/streak';
import { toggleDmoTaskAction } from '@/app/(app)/team/[id]/actions';

/**
 * "Catena d'Oro" — the daily-streak chip shown next to the user's own name. A
 * flame + day count + label that glows GREEN while today's DMO is in progress and
 * turns GOLD once all 5 tasks are ticked. Tapping it opens a gamified sheet with
 * the 5 MANUAL daily tasks: each lights up green as you tick it (the next one to do
 * is highlighted), and when all are done everything turns gold and the day is added
 * to the chain. Ticks persist to the DB via {@link toggleDmoTaskAction}; the streak
 * is recomputed server-side and synced back once the in-flight ticks settle.
 */

type TaskKey = 'readPages' | 'igStory' | 'tiktokReel' | 'meetPerson' | 'training';

/** The 5 tasks in order, with their DB column + icon + label key. */
const TASKS: {
  key: TaskKey;
  column: string;
  icon: LucideIcon;
  labelKey: string;
}[] = [
  { key: 'readPages', column: 'read_pages', icon: BookOpen, labelKey: 'task_read' },
  { key: 'igStory', column: 'ig_story', icon: Instagram, labelKey: 'task_ig' },
  { key: 'tiktokReel', column: 'tiktok_reel', icon: Video, labelKey: 'task_tiktok' },
  { key: 'meetPerson', column: 'meet_person', icon: UserPlus, labelKey: 'task_meet' },
  { key: 'training', column: 'training', icon: GraduationCap, labelKey: 'task_training' },
];

function withAllDone(s: DmoStatus): DmoStatus {
  return { ...s, allDone: TASKS.every((t) => s[t.key]) };
}

export function CatenaButton({ initial }: { initial: DmoStatus }) {
  const t = useTranslations('catena');
  const [status, setStatus] = React.useState<DmoStatus>(initial);
  const [open, setOpen] = React.useState(false);
  // Only sync a server response when no other tick is still in flight, so quick
  // successive taps don't clobber each other with a stale aggregate.
  const inflight = React.useRef(0);

  const done = status.allDone;
  const doneCount = TASKS.filter((task) => status[task.key]).length;
  const firstUndone = TASKS.findIndex((task) => !status[task.key]);

  const toggle = React.useCallback(
    async (task: (typeof TASKS)[number]) => {
      const nextVal = !status[task.key];
      setStatus((prev) => withAllDone({ ...prev, [task.key]: nextVal }));
      inflight.current += 1;
      try {
        const res = await toggleDmoTaskAction(task.column, nextVal);
        inflight.current -= 1;
        // Settle from the server only on the last response (real streak update).
        if (!res.demo && inflight.current === 0) setStatus(res);
      } catch {
        inflight.current -= 1;
      }
    },
    [status],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('tooltip', { n: status.streak })}
        aria-label={t('tooltip', { n: status.streak })}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold tabular-nums transition-all duration-base ease-standard hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          done
            ? 'border-warning/50 bg-warning/15 text-warning shadow-[0_0_18px_hsl(var(--warning)/0.5)]'
            : 'border-success/50 bg-success/12 text-success shadow-[0_0_16px_hsl(var(--success)/0.4)] animate-glow-pulse',
        )}
      >
        <Flame className="h-4 w-4 transition-transform group-hover:scale-110" aria-hidden />
        <span>{status.streak}</span>
        <span className="hidden border-l border-current/20 pl-1.5 text-xs font-semibold uppercase tracking-wide sm:inline">
          {t('button')}
        </span>
      </button>

      <Modal open={open} onOpenChange={setOpen} title={t('title')} size="md">
        <div className="space-y-5">
          {/* Streak hero — green while in progress, gold when the chain is closed. */}
          <div
            className={cn(
              'relative overflow-hidden rounded-2xl border p-6 text-center',
              done
                ? 'border-warning/40 bg-gradient-to-b from-warning/[0.12] to-transparent'
                : 'border-success/30 bg-gradient-to-b from-success/[0.10] to-transparent',
            )}
          >
            <span
              className={cn(
                'pointer-events-none absolute left-1/2 top-0 h-28 w-28 -translate-x-1/2 -translate-y-10 rounded-full blur-3xl',
                done ? 'bg-warning/30 animate-glow-pulse' : 'bg-success/25',
              )}
              aria-hidden
            />
            <Flame
              className={cn(
                'relative mx-auto h-12 w-12',
                done ? 'text-warning' : 'text-success',
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
                done ? 'text-warning' : 'text-success',
              )}
            >
              {done ? t('today_done') : t('progress', { done: doneCount })}
            </p>
            <p className="relative mt-0.5 text-xs text-muted-foreground">
              {done ? t('subtitle_done') : t('subtitle_pending')}
            </p>
          </div>

          {/* Daily tasks — tap to tick. The next one to do is highlighted. */}
          <div className="space-y-2">
            <p className="px-0.5 text-xs font-medium text-muted-foreground">
              {t('tap_hint')}
            </p>
            {TASKS.map((task, i) => (
              <TaskRow
                key={task.key}
                icon={task.icon}
                label={t(task.labelKey)}
                done={status[task.key]}
                gold={done}
                highlight={!done && i === firstUndone}
                onClick={() => toggle(task)}
              />
            ))}
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
  gold,
  highlight,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  done: boolean;
  gold: boolean;
  highlight: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-base ease-standard hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        done && gold
          ? 'border-warning/40 bg-warning/[0.08]'
          : done
            ? 'border-success/40 bg-success/[0.08]'
            : 'border-border/70 bg-card hover:border-success/40',
        highlight && 'ring-2 ring-success/50 animate-glow-pulse',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
          done && gold
            ? 'bg-warning/15 text-warning'
            : done
              ? 'bg-success/12 text-success'
              : 'bg-muted text-muted-foreground',
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
          done && gold
            ? 'border-warning bg-warning text-white'
            : done
              ? 'border-success bg-success text-white'
              : 'border-input',
        )}
        aria-hidden
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}
