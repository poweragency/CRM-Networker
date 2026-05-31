'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import {
  ZOOM_CALL_LABELS,
  callsForDate,
  type AttendanceMember,
  type ZoomCall,
} from '@/lib/data/attendance-shared';
import { setZoomAttendanceAction } from '@/app/(app)/presenze/actions';

/**
 * AttendanceTable — the Presenze Zoom grid for one day. The people are the
 * viewer's subtree (themselves + everyone below — each person only ever sees
 * their own downline). Each call runs on a FIXED weekday — Wake Up Call on
 * Monday, Golden Call on Thursday, Join The Dream on Sunday — so only the call(s)
 * scheduled on the selected day are shown (a notice when none).
 *
 * Layout is a dense horizontal grid of compact "Nome — presenza" cells that pack
 * as many per row as fit and then wrap, so large teams stay readable at a glance.
 * The day is driven by the `?date=` URL param (the table is "divided by days"):
 * prev/next/today + a date picker re-navigate. Toggles are optimistic, demo-safe.
 */

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function AttendanceTable({
  date,
  members,
  today,
}: {
  date: string;
  members: AttendanceMember[];
  today: string;
}) {
  const t = useTranslations('presenze');
  const router = useRouter();
  const { toast } = useToast();

  // Local optimistic copy of the attendance flags.
  const [state, setState] = React.useState<Record<string, Record<ZoomCall, boolean>>>(
    () => Object.fromEntries(members.map((m) => [m.id, { ...m.present }])),
  );

  React.useEffect(() => {
    setState(Object.fromEntries(members.map((m) => [m.id, { ...m.present }])));
  }, [members]);

  function go(nextDate: string) {
    router.push(`/presenze?date=${nextDate}`);
  }

  async function toggle(member: AttendanceMember, call: ZoomCall) {
    const next = !state[member.id]?.[call];
    setState((prev) => ({
      ...prev,
      [member.id]: { ...prev[member.id]!, [call]: next },
    }));
    const res = await setZoomAttendanceAction(member.id, date, call, next);
    if (!res.ok) {
      // rollback
      setState((prev) => ({
        ...prev,
        [member.id]: { ...prev[member.id]!, [call]: !next },
      }));
      toast({ title: t('error'), variant: 'error' });
    }
  }

  const dayLabel = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));

  // Only the call(s) that actually run on this weekday get a column.
  const calls = callsForDate(date);

  return (
    <div className="space-y-4">
      {/* Day navigator */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => go(shiftDay(date, -1))}>
          <ChevronLeft aria-hidden />
          {t('prev_day')}
        </Button>
        <div className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="capitalize">{dayLabel}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => go(shiftDay(date, 1))}>
          {t('next_day')}
          <ChevronRight aria-hidden />
        </Button>
        {date !== today && (
          <Button variant="ghost" size="sm" onClick={() => go(today)}>
            {t('today')}
          </Button>
        )}
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="ml-auto h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('pick_day')}
        />
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t('empty_title')}
          description={t('empty_body')}
        />
      ) : calls.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t('no_call_title')}
          description={t('no_call_body')}
        />
      ) : (
        <div className="space-y-5">
          {calls.map((c) => {
            const presentCount = members.filter(
              (m) => state[m.id]?.[c],
            ).length;
            const pct = members.length
              ? Math.round((presentCount / members.length) * 100)
              : 0;
            return (
              <section
                key={c}
                className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold tracking-tight text-foreground">
                    {ZOOM_CALL_LABELS[c]}
                  </h2>
                  <div className="flex items-center gap-2.5">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-success transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {presentCount}/{members.length}
                    </span>
                  </div>
                </div>
                {/* Dense, wrapping grid: each cell = name + presence toggle. */}
                <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))]">
                  {members.map((m) => {
                    const present = state[m.id]?.[c] ?? false;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-background py-1 pl-2.5 pr-1"
                      >
                        <Link
                          href={`/team/${m.id}`}
                          title={m.display_name}
                          className="min-w-0 flex-1 truncate text-xs font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {m.display_name}
                        </Link>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={present}
                          aria-label={`${m.display_name} — ${ZOOM_CALL_LABELS[c]}`}
                          onClick={() => toggle(m, c)}
                          className={cn(
                            'inline-flex h-6 min-w-[2.75rem] shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            present
                              ? 'bg-success/15 text-success hover:bg-success/25'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70',
                          )}
                        >
                          {present ? t('present') : t('absent')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
