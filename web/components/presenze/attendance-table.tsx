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
  Check,
  X,
  Radio,
  Flame,
  Trophy,
  Crown,
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

/** Podium tone per rank position: gold / silver / bronze, then muted. */
const MEDAL: Record<number, string> = {
  1: 'bg-warning/15 text-warning ring-1 ring-warning/30',
  2: 'bg-muted text-foreground ring-1 ring-border',
  3: 'bg-package-starter/15 text-package-starter ring-1 ring-package-starter/30',
};

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

  // ── Day-wide aggregates (derived only from the live `present` flags). ──────
  const totalSlots = members.length * calls.length;
  const filledSlots = members.reduce(
    (acc, m) => acc + calls.filter((c) => present[m.id]?.[c.id]).length,
    0,
  );
  const dayPct = totalSlots ? Math.round((filledSlots / totalSlots) * 100) : 0;

  // Per-member presence across today's calls → the competitive leaderboard.
  const leaderboard = React.useMemo(() => {
    return members
      .map((m) => ({
        member: m,
        score: calls.filter((c) => present[m.id]?.[c.id]).length,
      }))
      .sort((a, b) => b.score - a.score || a.member.display_name.localeCompare(b.member.display_name))
      .slice(0, 5);
  }, [members, calls, present]);

  const perfectAttendees = members.filter(
    (m) => calls.length > 0 && calls.every((c) => present[m.id]?.[c.id]),
  ).length;

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
        <>
          {/* ── Overview hero: aggregate gauge + day leaderboard ──────────── */}
          {showOverview && (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <DayPulse
                dayPct={dayPct}
                filledSlots={filledSlots}
                totalSlots={totalSlots}
                memberCount={members.length}
                callCount={calls.length}
                perfectAttendees={perfectAttendees}
              />
              <DayLeaderboard
                leaderboard={leaderboard}
                callCount={calls.length}
              />
            </div>
          )}

          {/* ── Per-call challenge cards ──────────────────────────────────── */}
          <div className="space-y-5">
            {calls.map((c) => {
              const presentCount = members.filter((m) => present[m.id]?.[c.id]).length;
              const pct = members.length ? Math.round((presentCount / members.length) * 100) : 0;
              const full = members.length > 0 && presentCount === members.length;
              return (
                <section
                  key={c.id}
                  className={cn(
                    'group/call overflow-hidden rounded-xl border bg-card shadow-card transition-shadow duration-base ease-standard hover:shadow-card-hover',
                    full && 'ring-1 ring-success/30 shadow-glow-success',
                  )}
                >
                  {/* Call header: identity + live gauge + XP bar. */}
                  <header className="relative flex flex-wrap items-center gap-4 border-b border-border/70 p-4">
                    {/* faint accent wash behind the header */}
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent',
                        full ? 'from-success/[0.08]' : 'from-primary/[0.05]',
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                        full
                          ? 'bg-success/12 text-success ring-success/25'
                          : 'bg-primary/10 text-primary ring-primary/20',
                      )}
                      aria-hidden
                    >
                      <Radio className="h-5 w-5" />
                    </span>
                    <div className="relative min-w-0 flex-1">
                      <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold tracking-tight text-foreground">
                        <span className="truncate">{c.title}</span>
                        {c.scope === 'team' && c.created_by_name && (
                          <span className="text-[11px] font-normal text-muted-foreground">
                            {t('call_by', { name: c.created_by_name })}
                          </span>
                        )}
                        {c.start_time && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                            {c.start_time}
                          </span>
                        )}
                        {full && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success animate-pop">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            100%
                          </span>
                        )}
                      </h2>
                      {/* XP-style attendance bar */}
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressMeter
                          value={pct}
                          gradient={full ? 'from-success to-success' : 'from-primary to-info'}
                          heightClass="h-2"
                          className="max-w-md flex-1"
                        />
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                          <span className={cn(full ? 'text-success' : 'text-foreground')}>
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
                              ? 'border-success/30 bg-success/[0.04]'
                              : 'border-border bg-background hover:border-border',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={m.display_name}
                              size="sm"
                              className={cn(
                                'ring-1 transition-shadow',
                                isPresent ? 'ring-success/30' : 'ring-border',
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
                              onClick={() => togglePresent(m, c.id)}
                              ariaLabel={`${m.display_name} — ${c.title} — ${isPresent ? t('present') : t('absent')}`}
                              onIcon={Check}
                              offIcon={X}
                              onLabel={t('present')}
                              offLabel={t('absent')}
                            />
                            <ToggleChip
                              checked={camOn}
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
}: {
  checked: boolean;
  onClick: () => void;
  ariaLabel: string;
  onIcon: typeof Check;
  offIcon: typeof X;
  onLabel: string;
  offLabel: string;
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
          ? 'bg-success/15 text-success ring-success/25 hover:bg-success/25'
          : 'bg-danger/10 text-danger ring-danger/20 hover:bg-danger/20',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="truncate">{checked ? onLabel : offLabel}</span>
    </button>
  );
}

/** Aggregate day gauge — the "are we winning today?" panel. */
function DayPulse({
  dayPct,
  filledSlots,
  totalSlots,
  memberCount,
  callCount,
  perfectAttendees,
}: {
  dayPct: number;
  filledSlots: number;
  totalSlots: number;
  memberCount: number;
  callCount: number;
  perfectAttendees: number;
}) {
  return (
    <div className="surface-grid relative overflow-hidden rounded-xl border bg-card p-5 shadow-card">
      {/* drifting accent aurora behind the gauge */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl animate-aurora"
        aria-hidden
      />
      <div className="relative flex items-center gap-5">
        <CompletionRing present={filledSlots} total={totalSlots} size={104} stroke={9} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
              <CountUp value={dayPct} />
              <span className="text-lg font-semibold text-muted-foreground">%</span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat icon={CalendarDays} value={callCount} />
            <MiniStat icon={Radio} value={memberCount} />
            <MiniStat icon={Crown} value={perfectAttendees} accent="text-warning" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{filledSlots}</span>
            <span className="text-muted-foreground"> / {totalSlots}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  value,
  accent,
}: {
  icon: typeof CalendarDays;
  value: number;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
      <Icon className={cn('h-4 w-4 shrink-0', accent ?? 'text-muted-foreground')} aria-hidden />
      <span className="text-base font-bold tabular-nums tracking-tight text-foreground">
        <CountUp value={value} />
      </span>
    </div>
  );
}

/** Competitive ranking of members by presence across the day's calls. */
function DayLeaderboard({
  leaderboard,
  callCount,
}: {
  leaderboard: { member: AttendanceMember; score: number }[];
  callCount: number;
}) {
  const max = callCount || 1;
  return (
    <div className="flex flex-col rounded-xl border bg-card shadow-card">
      <div className="flex items-center gap-2.5 border-b border-border/70 px-5 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/15 text-warning shadow-glow-warning">
          <Trophy className="h-4 w-4" aria-hidden />
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
          <Crown className="h-3.5 w-3.5 text-warning" aria-hidden />
          {leaderboard.length}
        </span>
      </div>
      <ol className="space-y-0.5 p-3">
        {leaderboard.map(({ member, score }, i) => {
          const pos = i + 1;
          const pct = max > 0 ? Math.max(8, Math.round((score / max) * 100)) : 0;
          const perfect = score === callCount && callCount > 0;
          return (
            <li
              key={member.id}
              className="animate-rank-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Link
                href={`/team/${member.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                    MEDAL[pos] ?? 'text-muted-foreground',
                    pos === 1 && perfect && 'shadow-glow-warning',
                  )}
                >
                  {pos}
                </span>
                <Avatar name={member.display_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                    <span className="truncate">{member.display_name}</span>
                    {perfect && (
                      <Flame className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                    )}
                  </p>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        'block h-full rounded-full transition-[width] duration-700 ease-emphasized',
                        perfect ? 'bg-warning' : 'bg-primary',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                  {score}
                  <span className="text-xs font-medium text-muted-foreground">/{callCount}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
