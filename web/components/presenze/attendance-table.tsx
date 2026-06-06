'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Video,
  VideoOff,
  UserCheck,
  Check,
  X,
  Radio,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressMeter } from '@/components/ui/progress-meter';
import { Avatar } from '@/components/ui/avatar';
import { RankBadge } from '@/components/ui/rank-badge';
import { CountUp } from '@/components/ui/count-up';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import type { AttendanceMember, ZoomCallDef } from '@/lib/data/attendance-shared';
import { CompletionRing } from '@/components/presenze/completion-ring';
import {
  setZoomAttendanceAction,
  setZoomCamAction,
} from '@/app/(app)/presenze/actions';

/**
 * AttendanceTable — the Presenze Zoom grid for one day, restyled as a competitive
 * analytics surface. People are the viewer's subtree (themselves + everyone
 * below). Calls are DYNAMIC: the visible calls for the selected day are passed in
 * (`calls`); each runs on a fixed weekday, so the day picker drives which calls
 * show. Present + cam toggles are optimistic and persisted; a call hitting 100%
 * of the team fires an achievement (confetti).
 *
 * The redesign layers an overview hero (aggregate rings + day leaderboard) over
 * per-call "challenge" cards — all derived purely from the present/cam flags, no
 * new data. The per-member grid preserves the exact columns: name + Present +
 * Cam toggles (no cam-rate here — that lives only in the dashboard leaderboard).
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

/**
 * Per-call tone ramp — mirrors CompletionRing so the bar/icon/count match the
 * gauge at every level: cold (info) → accent (primary) → success → GOLD (100%).
 */
function callTone(ratio: number): {
  bar: string;
  chipBg: string;
  text: string;
  ring: string;
  wash: string;
} {
  if (ratio >= 1)
    return { bar: 'from-warning to-warning', chipBg: 'bg-warning/15', text: 'text-warning', ring: 'ring-warning/30', wash: 'from-warning/[0.10]' };
  if (ratio >= 0.75)
    return { bar: 'from-success to-success', chipBg: 'bg-success/12', text: 'text-success', ring: 'ring-success/25', wash: 'from-success/[0.06]' };
  if (ratio >= 0.4)
    return { bar: 'from-primary to-primary', chipBg: 'bg-primary/12', text: 'text-primary', ring: 'ring-primary/25', wash: 'from-primary/[0.06]' };
  return { bar: 'from-info to-info', chipBg: 'bg-info/12', text: 'text-info', ring: 'ring-info/25', wash: 'from-info/[0.06]' };
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

  const isToday = date === today;

  // ── Day-wide aggregates (derived only from the live present/cam flags). ────
  const totalSlots = members.length * calls.length;
  const filledSlots = members.reduce(
    (acc, m) => acc + calls.filter((c) => present[m.id]?.[c.id]).length,
    0,
  );
  const filledCams = members.reduce(
    (acc, m) => acc + calls.filter((c) => cam[m.id]?.[c.id]).length,
    0,
  );
  const dayPct = totalSlots ? Math.round((filledSlots / totalSlots) * 100) : 0;

  const showOverview = members.length > 0 && calls.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Day navigator — frosted command bar ──────────────────────────── */}
      <div className="glass flex flex-wrap items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5 shadow-sm">
        <Button variant="outline" size="sm" onClick={() => go(shiftDay(date, -1))}>
          <ChevronLeft aria-hidden />
          {t('prev_day')}
        </Button>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-xs">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="capitalize">{dayLabel}</span>
          {isToday && (
            <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-glow-pulse" aria-hidden />
              {t('today')}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => go(shiftDay(date, 1))}>
          {t('next_day')}
          <ChevronRight aria-hidden />
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" onClick={() => go(today)}>
            {t('today')}
          </Button>
        )}
        <input
          type="date"
          // Uncontrolled + remount-on-date so typing isn't fought by React;
          // `key` re-seeds the value after a real navigation (buttons/picker).
          key={date}
          defaultValue={date}
          onChange={(e) => {
            const v = e.target.value;
            // Navigate ONLY on a complete date (4-digit year ≥ 1000). While the
            // user types the year digit-by-digit (0002 → 0020 → 0202 → 2026) each
            // intermediate value is < 1000, so the page no longer jumps away.
            if (v && Number(v.slice(0, 4)) >= 1000 && v !== date) go(v);
          }}
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
        <>
          {/* ── Overview hero: full-width aggregate gauge ─────────────────── */}
          {showOverview && (
            <DayPulse
              dayPct={dayPct}
              filledSlots={filledSlots}
              totalSlots={totalSlots}
              cams={filledCams}
            />
          )}

          {/* ── Per-call challenge cards ──────────────────────────────────── */}
          <div className="space-y-5">
            {calls.map((c) => {
              const presentCount = members.filter((m) => present[m.id]?.[c.id]).length;
              const ratio = members.length ? presentCount / members.length : 0;
              const pct = Math.round(ratio * 100);
              const full = members.length > 0 && presentCount === members.length;
              const tone = callTone(ratio);
              return (
                <section
                  key={c.id}
                  className={cn(
                    'group/call overflow-hidden rounded-xl border bg-card shadow-card transition-shadow duration-base ease-standard hover:shadow-card-hover',
                    full && 'ring-1 ring-warning/40 shadow-glow-warning',
                  )}
                >
                  {/* Call header: identity + live gauge + XP bar. */}
                  <header className="relative flex flex-wrap items-center gap-4 border-b border-border/70 p-4">
                    {/* faint accent wash behind the header */}
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent',
                        tone.wash,
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                        tone.chipBg,
                        tone.text,
                        tone.ring,
                      )}
                      aria-hidden
                    >
                      <Radio className="h-5 w-5" />
                    </span>
                    <div className="relative min-w-0 flex-1">
                      <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold tracking-tight text-foreground">
                        <span className="truncate">{c.title}</span>
                        {c.start_time && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                            {c.start_time}
                          </span>
                        )}
                        {full && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning animate-pop">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            100%
                          </span>
                        )}
                      </h2>
                      {/* XP-style attendance bar */}
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressMeter
                          value={pct}
                          gradient={tone.bar}
                          heightClass="h-2"
                          className="max-w-md flex-1"
                        />
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                          <span className={tone.text}>
                            {presentCount}
                          </span>
                          /{members.length}
                        </span>
                      </div>
                    </div>
                    <CompletionRing
                      present={presentCount}
                      total={members.length}
                      size={64}
                      className="relative"
                    />
                  </header>

                  {/* Member grid: each cell = name + presence/cam toggles. */}
                  <div className="grid gap-2 p-4 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
                    {members.map((m) => {
                      const isPresent = present[m.id]?.[c.id] ?? false;
                      const camOn = cam[m.id]?.[c.id] ?? false;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'group/cell flex flex-col gap-2 rounded-lg border p-2.5 transition-[box-shadow,transform,border-color] duration-base ease-standard hover:-translate-y-px hover:shadow-sm',
                            isPresent
                              ? full
                                ? 'border-warning/40 bg-warning/[0.06]'
                                : 'border-success/30 bg-success/[0.04]'
                              : 'border-border bg-background hover:border-border',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={m.display_name}
                              size="sm"
                              className={cn(
                                'ring-1 transition-shadow',
                                isPresent ? (full ? 'ring-warning/30' : 'ring-success/30') : 'ring-border',
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/team/${m.id}`}
                                title={m.display_name}
                                className="block truncate text-xs font-semibold text-foreground transition-colors hover:text-primary"
                              >
                                {m.display_name}
                              </Link>
                              <RankBadge
                                rank={m.rank}
                                variant="dot"
                                className="mt-0.5 truncate text-[10px] text-muted-foreground"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ToggleChip
                              checked={isPresent}
                              checkedTone={full ? 'warning' : 'success'}
                              onClick={() => togglePresent(m, c.id)}
                              ariaLabel={`${m.display_name} — ${c.title} — ${isPresent ? t('present') : t('absent')}`}
                              onIcon={Check}
                              offIcon={X}
                              onLabel={t('present')}
                              offLabel={t('absent')}
                            />
                            <ToggleChip
                              checked={camOn}
                              checkedTone={full ? 'warning' : 'success'}
                              onClick={() => toggleCam(m, c.id)}
                              ariaLabel={`${m.display_name} — ${camOn ? t('cam_on') : t('cam_off')}`}
                              onIcon={Video}
                              offIcon={VideoOff}
                              onLabel={t('cam_on')}
                              offLabel={t('cam_off')}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** A pill toggle that reads as a presence/cam badge: icon + label, tone-coded. */
function ToggleChip({
  checked,
  onClick,
  ariaLabel,
  onIcon: OnIcon,
  offIcon: OffIcon,
  onLabel,
  offLabel,
  checkedTone = 'success',
}: {
  checked: boolean;
  onClick: () => void;
  ariaLabel: string;
  onIcon: typeof Check;
  offIcon: typeof X;
  onLabel: string;
  offLabel: string;
  /** Tone of the "on" state — gold when the whole call is at 100%. */
  checkedTone?: 'success' | 'warning';
}) {
  const Icon = checked ? OnIcon : OffIcon;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked
          ? checkedTone === 'warning'
            ? 'bg-warning/15 text-warning ring-warning/25 hover:bg-warning/25'
            : 'bg-success/15 text-success ring-success/25 hover:bg-success/25'
          : 'bg-danger/10 text-danger ring-danger/20 hover:bg-danger/20',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="truncate">{checked ? onLabel : offLabel}</span>
    </button>
  );
}

/** Aggregate day gauge — the full-width "are we winning today?" panel. */
function DayPulse({
  dayPct,
  filledSlots,
  totalSlots,
  cams,
}: {
  dayPct: number;
  filledSlots: number;
  totalSlots: number;
  cams: number;
}) {
  return (
    <div className="surface-grid relative overflow-hidden rounded-xl border bg-card p-5 shadow-card">
      {/* drifting accent aurora behind the gauge */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl animate-aurora"
        aria-hidden
      />
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4">
        <CompletionRing present={filledSlots} total={totalSlots} size={104} stroke={9} />
        <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
          <CountUp value={dayPct} />
          <span className="text-lg font-semibold text-muted-foreground">%</span>
        </span>
        {/* Presenze + cam attive — the two figures that matter for the day. */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <MiniStat icon={UserCheck} value={filledSlots} label="Presenze" accent="text-success" />
          <MiniStat icon={Video} value={cams} label="Cam attive" accent="text-info" />
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof CalendarDays;
  value: number;
  label: string;
  accent?: string;
}) {
  return (
    <div className="flex min-w-[8.5rem] items-center gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted',
          accent ?? 'text-muted-foreground',
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="text-base font-bold tabular-nums tracking-tight text-foreground">
          <CountUp value={value} />
        </p>
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
