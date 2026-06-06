'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Bell,
  Cake,
  CalendarClock,
  Check,
  CheckCheck,
  FileBarChart,
  Inbox,
  Mail,
  Medal,
  UserPlus,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  NOTIFICATION_TYPE_LABELS,
  notificationHref,
  type AppNotification,
  type NotificationType,
} from '@/lib/types/db';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  dismissAction,
  markAllReadAction,
  markReadAction,
} from '@/app/(app)/notifiche/actions';

/**
 * Notifications inbox (doc 01 §6.7). Client manager fed by the server page with
 * the caller's notifications. Supports filter (all / unread), mark-read (single
 * + all) and dismiss — each applied optimistically to local state and persisted
 * through demo-safe Server Actions (simulated in "modalità demo"). Deep-links
 * route on the type + payload via {@link notificationHref}.
 */

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  new_member: UserPlus,
  follow_up_due: CalendarClock,
  rank_changed: Medal,
  bottleneck_alert: AlertTriangle,
  monthly_report_ready: FileBarChart,
  invitation: Mail,
  birthday: Cake,
  system: Bell,
};

const TYPE_TONE: Record<NotificationType, string> = {
  new_member: 'bg-primary/10 text-primary',
  follow_up_due: 'bg-warning/15 text-warning',
  rank_changed: 'bg-branch-global/12 text-branch-global',
  bottleneck_alert: 'bg-danger/12 text-danger',
  monthly_report_ready: 'bg-primary/10 text-primary',
  invitation: 'bg-info/12 text-info',
  birthday: 'bg-success/12 text-success',
  system: 'bg-muted text-muted-foreground',
};

type Filter = 'all' | 'unread';

export function NotificationsManager({
  initial,
  initialDemo,
}: {
  initial: AppNotification[];
  initialDemo: boolean;
}) {
  const t = useTranslations('notifiche');
  const { toast } = useToast();
  const [items, setItems] = React.useState<AppNotification[]>(initial);
  const [filter, setFilter] = React.useState<Filter>('all');

  const unread = items.filter((n) => !n.read_at).length;
  const visible = filter === 'unread' ? items.filter((n) => !n.read_at) : items;

  function notifyDemo(title: string, demo: boolean) {
    toast({
      title,
      description: demo || initialDemo ? t('action_demo') : undefined,
      variant: 'success',
    });
  }

  async function markRead(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.read_at) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    const res = await markReadAction(id);
    notifyDemo(t('marked_read'), res.demo);
  }

  async function markAll() {
    if (unread === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const res = await markAllReadAction();
    notifyDemo(t('all_marked_read'), res.demo);
  }

  async function dismiss(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    const res = await dismissAction(id);
    notifyDemo(t('dismissed'), res.demo);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t('title')}
          className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors',
              filter === 'all' ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
            )}
          >
            {t('filter_all')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            onClick={() => setFilter('unread')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
              filter === 'unread'
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:text-foreground',
            )}
          >
            {t('filter_unread')}
            {unread > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {unread}
              </span>
            )}
          </button>
        </div>

        <Button variant="outline" size="sm" onClick={markAll} disabled={unread === 0}>
          <CheckCheck aria-hidden />
          {t('mark_all_read')}
        </Button>
      </div>

      {visible.length === 0 ? (
        filter === 'unread' ? (
          <EmptyState
            icon={<CheckCheck />}
            title={t('all_read_title')}
            description={t('all_read_body')}
          />
        ) : (
          <EmptyState icon={<Inbox />} title={t('empty_title')} description={t('empty_body')} />
        )
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => {
            const Icon = TYPE_ICON[n.type];
            const isUnread = !n.read_at;
            return (
              <li
                key={n.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border bg-card p-3.5 transition-colors',
                  isUnread && 'border-primary/30 bg-primary/[0.03]',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    TYPE_TONE[n.type],
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm font-medium text-foreground">
                      {n.title_it}
                      {isUnread && (
                        <span
                          className="ml-2 inline-block h-2 w-2 rounded-full bg-primary align-middle"
                          aria-label={t('new_badge')}
                        />
                      )}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(n.created_at)}
                    </span>
                  </div>
                  {n.body_it && (
                    <p className="text-sm text-muted-foreground">{n.body_it}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
                    <span className="text-muted-foreground">
                      {NOTIFICATION_TYPE_LABELS[n.type]}
                    </span>
                    <Link
                      href={notificationHref(n)}
                      onClick={() => markRead(n.id)}
                      className="font-medium text-primary hover:underline"
                    >
                      {t('open')}
                    </Link>
                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {t('mark_read')}
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => dismiss(n.id)}
                  aria-label={t('dismiss')}
                  title={t('dismiss')}
                  className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
