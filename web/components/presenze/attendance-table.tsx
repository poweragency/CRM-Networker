'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RankBadge } from '@/components/ui/rank-badge';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { cn, initials } from '@/lib/utils';
import {
  ZOOM_CALLS,
  ZOOM_CALL_LABELS,
  type AttendanceMember,
  type ZoomCall,
} from '@/lib/data/attendance-shared';
import { setZoomAttendanceAction } from '@/app/(app)/presenze/actions';

/**
 * AttendanceTable — the Presenze Zoom grid for one day. Rows are the viewer's
 * subtree (themselves + everyone below); columns are the three calls (Wake Up,
 * Golden, Join The Dream) with a present/absent toggle each. The day is driven by
 * the `?date=` URL param (the table is "divided by days"): prev/next/today + a
 * date picker re-navigate. Toggles are optimistic and demo-safe.
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
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full caption-bottom text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b text-xs font-medium text-muted-foreground">
                <th className="h-11 px-3 text-left">{t('col_member')}</th>
                {ZOOM_CALLS.map((c) => (
                  <th key={c} className="h-11 px-3 text-center">
                    {ZOOM_CALL_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {initials(m.display_name)}
                      </span>
                      <span className="min-w-0">
                        <Link
                          href={`/team/${m.id}`}
                          className="block truncate font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {m.display_name}
                        </Link>
                        <RankBadge rank={m.rank} variant="dot" className="text-[11px]" />
                      </span>
                    </span>
                  </td>
                  {ZOOM_CALLS.map((c) => {
                    const present = state[m.id]?.[c] ?? false;
                    return (
                      <td key={c} className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={present}
                          aria-label={`${m.display_name} — ${ZOOM_CALL_LABELS[c]}`}
                          onClick={() => toggle(m, c)}
                          className={cn(
                            'inline-flex h-7 min-w-[3.25rem] items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            present
                              ? 'bg-success/15 text-success hover:bg-success/25'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70',
                          )}
                        >
                          {present ? t('present') : t('absent')}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
