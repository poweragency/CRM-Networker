'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressMeter } from '@/components/ui/progress-meter';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import type { AttendanceMember, ZoomCallDef } from '@/lib/data/attendance-shared';
import {
  setZoomAttendanceAction,
  setZoomCamAction,
} from '@/app/(app)/presenze/actions';

/**
 * AttendanceTable — the Presenze Zoom grid for one day. People are the viewer's
 * subtree (themselves + everyone below). Calls are DYNAMIC: the visible calls for
 * the selected day are passed in (`calls`); each runs on a fixed weekday, so the
 * day picker drives which calls show. Present + cam toggles are optimistic and
 * persisted; a call hitting 100% of the team fires an achievement (confetti).
 */

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

type Flags = Record<string, Record<string, boolean>>; // memberId → callId → bool

function seed(members: AttendanceMember[], pick: (m: AttendanceMember) => Record<string, boolean>): Flags {
  return Object.fromEntries(members.map((m) => [m.id, { ...pick(m) }]));
}

export function AttendanceTable({
  date,
  calls,
  members,
  today,
}: {
  date: string;
  calls: ZoomCallDef[];
  members: AttendanceMember[];
  today: string;
}) {
  const t = useTranslations('presenze');
  const router = useRouter();
  const { toast } = useToast();

  const [present, setPresent] = React.useState<Flags>(() => seed(members, (m) => m.present));
  const [cam, setCam] = React.useState<Flags>(() => seed(members, (m) => m.cam));

  React.useEffect(() => {
    setPresent(seed(members, (m) => m.present));
    setCam(seed(members, (m) => m.cam));
  }, [members]);

  function go(nextDate: string) {
    router.push(`/presenze?date=${nextDate}`);
  }

  async function togglePresent(member: AttendanceMember, callId: string) {
    const next = !present[member.id]?.[callId];
    const before = members.filter((m) => present[m.id]?.[callId]).length;
    setPresent((prev) => ({ ...prev, [member.id]: { ...prev[member.id]!, [callId]: next } }));
    const res = await setZoomAttendanceAction(member.id, date, callId, next);
    if (!res.ok) {
      setPresent((prev) => ({ ...prev, [member.id]: { ...prev[member.id]!, [callId]: !next } }));
      toast({ title: t('error'), variant: 'error' });
      return;
    }
    const after = before + (next ? 1 : -1);
    if (next && members.length > 0 && after === members.length) {
      const call = calls.find((c) => c.id === callId);
      toast({
        title: t('full_house_title'),
        description: t('full_house_body', { call: call?.title ?? '' }),
        variant: 'achievement',
      });
    }
  }

  async function toggleCam(member: AttendanceMember, callId: string) {
    const next = !cam[member.id]?.[callId];
    setCam((prev) => ({ ...prev, [member.id]: { ...prev[member.id]!, [callId]: next } }));
    const res = await setZoomCamAction(member.id, date, callId, next);
    if (!res.ok) {
      setCam((prev) => ({ ...prev, [member.id]: { ...prev[member.id]!, [callId]: !next } }));
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
      ) : calls.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t('no_call_title')}
          description={t('no_call_body')}
        />
      ) : (
        <div className="space-y-5">
          {calls.map((c) => {
            const presentCount = members.filter((m) => present[m.id]?.[c.id]).length;
            const pct = members.length ? Math.round((presentCount / members.length) * 100) : 0;
            return (
              <section key={c.id} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight text-foreground">
                    {c.title}
                    {c.scope === 'team' && c.created_by_name && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {t('call_by', { name: c.created_by_name })}
                      </span>
                    )}
                    {c.start_time && (
                      <span className="text-[11px] font-normal tabular-nums text-muted-foreground">
                        {c.start_time}
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-2.5">
                    <ProgressMeter
                      value={pct}
                      gradient="from-success to-info"
                      heightClass="h-1.5"
                      className="w-24"
                    />
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {presentCount}/{members.length}
                    </span>
                  </div>
                </div>
                {/* Dense, wrapping grid: each cell = name + presence/cam toggles. */}
                <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
                  {members.map((m) => {
                    const isPresent = present[m.id]?.[c.id] ?? false;
                    const camOn = cam[m.id]?.[c.id] ?? false;
                    return (
                      <div key={m.id} className="flex flex-col gap-1.5 rounded-md border bg-background p-2">
                        <Link
                          href={`/team/${m.id}`}
                          title={m.display_name}
                          className="truncate text-xs font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {m.display_name}
                        </Link>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isPresent}
                            aria-label={`${m.display_name} — ${c.title} — ${isPresent ? t('present') : t('absent')}`}
                            onClick={() => togglePresent(m, c.id)}
                            className={cn(
                              'inline-flex h-6 flex-1 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              isPresent
                                ? 'bg-success/15 text-success hover:bg-success/25'
                                : 'bg-danger/15 text-danger hover:bg-danger/25',
                            )}
                          >
                            {isPresent ? t('present') : t('absent')}
                          </button>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={camOn}
                            aria-label={`${m.display_name} — ${camOn ? t('cam_on') : t('cam_off')}`}
                            onClick={() => toggleCam(m, c.id)}
                            className={cn(
                              'inline-flex h-6 flex-1 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              camOn
                                ? 'bg-success/15 text-success hover:bg-success/25'
                                : 'bg-danger/15 text-danger hover:bg-danger/25',
                            )}
                          >
                            {camOn ? t('cam_on') : t('cam_off')}
                          </button>
                        </div>
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
