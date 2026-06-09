'use client';

import * as React from 'react';
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
  Search,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressMeter } from '@/components/ui/progress-meter';
import { Avatar } from '@/components/ui/avatar';
import { RankBadge } from '@/components/ui/rank-badge';
import { CountUp } from '@/components/ui/count-up';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type {
  AttendanceMember,
  AttendanceSummary,
  ZoomCallDef,
} from '@/lib/data/attendance-shared';
import { CompletionRing } from '@/components/presenze/completion-ring';
import {
  getAttendancePageAction,
  getAttendanceSummaryAction,
  getAttendanceViewAction,
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
 * SCALE: the grid PAGES through members (server search + "mostra altri") instead
 * of holding the whole subtree, and the day-wide gauges read a server-computed
 * SUMMARY (X/total present, day %, 100% achievement) so they stay exact even
 * though the client only holds a page of people.
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

/** Add ONLY new members to the flags (load-more append), preserving live marks. */
function mergeSeed(
  prev: Flags,
  members: AttendanceMember[],
  pick: (m: AttendanceMember) => Record<string, boolean>,
): Flags {
  let changed = false;
  const next: Flags = { ...prev };
  for (const m of members) {
    if (!next[m.id]) {
      next[m.id] = { ...pick(m) };
      changed = true;
    }
  }
  return changed ? next : prev;
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
  date: initialDate,
  calls: initialCalls,
  members: initialMembers,
  total: initialTotal,
  summary: initialSummary,
  pageSize,
  today,
}: {
  date: string;
  calls: ZoomCallDef[];
  members: AttendanceMember[];
  total: number;
  summary: AttendanceSummary;
  pageSize: number;
  today: string;
}) {
  const t = useTranslations('presenze');
  const { toast } = useToast();

  // Day + calls are CLIENT state: switching day refetches the day's page +
  // summary (NOT the whole team) and syncs the URL via history.
  const [date, setDate] = React.useState(initialDate);
  const [calls, setCalls] = React.useState<ZoomCallDef[]>(initialCalls);
  const [dayLoading, setDayLoading] = React.useState(false);
  const dateRef = React.useRef(date);
  dateRef.current = date;

  // Members are SERVER-PAGINATED: a page at a time, search + "mostra altri" fetch
  // more. `total` = members matching the current search.
  const [members, setMembers] = React.useState<AttendanceMember[]>(initialMembers);
  const [total, setTotal] = React.useState(initialTotal);
  // Day-wide counters (whole subtree) — the denominator of every gauge.
  const [summary, setSummary] = React.useState<AttendanceSummary>(initialSummary);

  const [present, setPresent] = React.useState<Flags>(() => seed(initialMembers, (m) => m.present));
  const [cam, setCam] = React.useState<Flags>(() => seed(initialMembers, (m) => m.cam));
  const [query, setQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const reqRef = React.useRef(0);
  const firstRun = React.useRef(true);

  // ── Debounced SERVER search: typing fetches the matching first page. ──
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const needle = query.trim();
    const id = ++reqRef.current;
    setSearching(true);
    const timer = window.setTimeout(
      async () => {
        try {
          const res = await getAttendancePageAction(dateRef.current, needle, 0, pageSize);
          if (reqRef.current !== id) return;
          setMembers(res.members);
          setTotal(res.total);
          setPresent(seed(res.members, (m) => m.present));
          setCam(seed(res.members, (m) => m.cam));
        } finally {
          if (reqRef.current === id) setSearching(false);
        }
      },
      needle ? 160 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [query, pageSize]);

  const loadMore = React.useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await getAttendancePageAction(dateRef.current, query.trim(), members.length, pageSize);
      setMembers((prev) => [...prev, ...res.members]);
      setTotal(res.total);
      setPresent((prev) => mergeSeed(prev, res.members, (m) => m.present));
      setCam((prev) => mergeSeed(prev, res.members, (m) => m.cam));
    } finally {
      setLoadingMore(false);
    }
  }, [query, members.length, pageSize]);

  // ── Realtime: reflect everyone else's check-ins live (no manual refresh). ──
  // RLS on zoom_attendance scopes the stream to the viewer's subtree. We update
  // the cell only when the member is on the loaded page; the gauges are kept exact
  // by a debounced refetch of the server summary (works for off-page members too).
  const supabase = React.useMemo(() => createClient(), []);
  const memberIdSet = React.useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const callIdSet = React.useMemo(() => new Set(calls.map((c) => c.id)), [calls]);
  const memberIdSetRef = React.useRef(memberIdSet);
  const callIdSetRef = React.useRef(callIdSet);
  memberIdSetRef.current = memberIdSet;
  callIdSetRef.current = callIdSet;
  const pendingRef = React.useRef<Set<string>>(new Set());
  const summaryTimerRef = React.useRef<number | null>(null);
  // Per-cell timestamp of our OWN recent check-ins (key `${marketerId}|${callId}`).
  // The realtime echo of our own write can reread a count that still lags the
  // just-written row and briefly revert the optimistic gauge (the gold→green→gold
  // flicker). We skip the refetch ONLY for an echo matching a cell we just wrote —
  // OTHER people's changes (no matching recent write) always reconcile the gauge.
  const recentLocalWritesRef = React.useRef<Map<string, number>>(new Map());
  const markLocalWrite = React.useCallback((marketerId: string, callId: string) => {
    const m = recentLocalWritesRef.current;
    m.set(`${marketerId}|${callId}`, Date.now());
    // Prune stale entries so the map can't grow over a long session.
    for (const [k, ts] of m) if (Date.now() - ts > 10_000) m.delete(k);
  }, []);

  const refetchSummary = React.useCallback(() => {
    if (summaryTimerRef.current) window.clearTimeout(summaryTimerRef.current);
    const forDate = dateRef.current;
    summaryTimerRef.current = window.setTimeout(async () => {
      const s = await getAttendanceSummaryAction(forDate);
      if (dateRef.current === forDate) setSummary(s);
    }, 400);
  }, []);

  React.useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`zoom_attendance:${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'zoom_attendance',
          filter: `call_date=eq.${date}`,
        },
        (payload) => {
          const rec = (
            payload.new && Object.keys(payload.new).length > 0
              ? payload.new
              : payload.old
          ) as { marketer_id?: string; call_id?: string | null; present?: boolean; cam?: boolean };
          const mid = rec?.marketer_id;
          const cid = rec?.call_id ?? undefined;
          if (!mid || !cid || !callIdSetRef.current.has(cid)) return;
          const removed = payload.eventType === 'DELETE';
          const nextPresent = removed ? false : Boolean(rec.present);
          const nextCam = removed ? false : Boolean(rec.cam);
          // Update the visible cell only when the member is on the loaded page.
          if (memberIdSetRef.current.has(mid)) {
            if (!pendingRef.current.has(`${mid}|${cid}|p`)) {
              setPresent((prev) =>
                prev[mid]?.[cid] === nextPresent
                  ? prev
                  : { ...prev, [mid]: { ...(prev[mid] ?? {}), [cid]: nextPresent } },
              );
            }
            if (!pendingRef.current.has(`${mid}|${cid}|c`)) {
              setCam((prev) =>
                prev[mid]?.[cid] === nextCam
                  ? prev
                  : { ...prev, [mid]: { ...(prev[mid] ?? {}), [cid]: nextCam } },
              );
            }
          }
          // Keep the day-wide gauges exact (also for off-page members). Skip ONLY
          // the echo of a cell we just wrote ourselves (the optimistic gauge already
          // counted it, and a server reread can lag the just-written row → flicker).
          // Everyone else's changes still reconcile the gauge.
          const writtenAt = recentLocalWritesRef.current.get(`${mid}|${cid}`);
          const ownRecentEcho = writtenAt !== undefined && Date.now() - writtenAt < 3000;
          if (!ownRecentEcho) refetchSummary();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, date, refetchSummary]);

  // Switch day: refetch the day's first page + summary (NOT the whole team).
  const go = React.useCallback(
    async (nextDate: string) => {
      if (nextDate === date || dayLoading) return;
      setDayLoading(true);
      try {
        const res = await getAttendanceViewAction(nextDate, query.trim(), pageSize);
        setDate(nextDate);
        setCalls(res.calls);
        setMembers(res.members);
        setTotal(res.total);
        setSummary(res.summary);
        setPresent(seed(res.members, (m) => m.present));
        setCam(seed(res.members, (m) => m.cam));
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/presenze?date=${nextDate}`);
        }
      } catch {
        toast({ title: t('error'), variant: 'error' });
      } finally {
        setDayLoading(false);
      }
    },
    [date, dayLoading, query, pageSize, t, toast],
  );

  async function togglePresent(member: AttendanceMember, callId: string) {
    const next = !present[member.id]?.[callId];
    const key = `${member.id}|${callId}|p`;
    markLocalWrite(member.id, callId);
    pendingRef.current.add(key);
    setPresent((prev) => ({ ...prev, [member.id]: { ...prev[member.id], [callId]: next } }));
    // Optimistic gauge: bump the day-wide count for this call.
    const before = summary.presentCounts[callId] ?? 0;
    setSummary((prev) => ({
      ...prev,
      presentCounts: { ...prev.presentCounts, [callId]: Math.max(0, (prev.presentCounts[callId] ?? 0) + (next ? 1 : -1)) },
    }));
    let res: { ok: boolean };
    try {
      res = await setZoomAttendanceAction(member.id, date, callId, next);
    } finally {
      pendingRef.current.delete(key);
    }
    if (!res.ok) {
      setPresent((prev) => ({ ...prev, [member.id]: { ...prev[member.id], [callId]: !next } }));
      setSummary((prev) => ({
        ...prev,
        presentCounts: { ...prev.presentCounts, [callId]: Math.max(0, (prev.presentCounts[callId] ?? 0) + (next ? -1 : 1)) },
      }));
      toast({ title: t('error'), variant: 'error' });
      return;
    }
    // Whole team present for this call → achievement.
    const after = before + (next ? 1 : -1);
    if (next && summary.totalMembers > 0 && after === summary.totalMembers) {
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
    const key = `${member.id}|${callId}|c`;
    markLocalWrite(member.id, callId);
    pendingRef.current.add(key);
    setCam((prev) => ({ ...prev, [member.id]: { ...prev[member.id], [callId]: next } }));
    setSummary((prev) => ({
      ...prev,
      camCounts: { ...prev.camCounts, [callId]: Math.max(0, (prev.camCounts[callId] ?? 0) + (next ? 1 : -1)) },
    }));
    let res: { ok: boolean };
    try {
      res = await setZoomCamAction(member.id, date, callId, next);
    } finally {
      pendingRef.current.delete(key);
    }
    if (!res.ok) {
      setCam((prev) => ({ ...prev, [member.id]: { ...prev[member.id], [callId]: !next } }));
      setSummary((prev) => ({
        ...prev,
        camCounts: { ...prev.camCounts, [callId]: Math.max(0, (prev.camCounts[callId] ?? 0) + (next ? -1 : 1)) },
      }));
      toast({ title: t('error'), variant: 'error' });
    }
  }

  // No year in the top label (the native date picker keeps it, formatted by the
  // browser) — "Lunedì 8 Giugno" reads cleaner.
  const dayLabel = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T00:00:00`));

  const isToday = date === today;

  // ── Live banner, synced to the call schedule ──────────────────────────────
  // A call is "in diretta" for one hour from its start time (no end time is
  // stored — fixed 60' window). Re-evaluated every 30s so the banner appears and
  // clears on schedule; only meaningful for today.
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const liveCall = React.useMemo(() => {
    if (!isToday) return null;
    const d = new Date(nowMs);
    const mins = d.getHours() * 60 + d.getMinutes();
    return (
      calls.find((c) => {
        if (!c.start_time) return false;
        const [h, m] = c.start_time.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return false;
        const start = h * 60 + m;
        return mins >= start && mins < start + 60;
      }) ?? null
    );
  }, [calls, isToday, nowMs]);

  // ── Day-wide aggregates (from the SERVER summary, whole subtree). ──────────
  const totalMembers = summary.totalMembers;
  const totalSlots = totalMembers * calls.length;
  const filledSlots = calls.reduce((acc, c) => acc + (summary.presentCounts[c.id] ?? 0), 0);
  const filledCams = calls.reduce((acc, c) => acc + (summary.camCounts[c.id] ?? 0), 0);

  const showOverview = totalMembers > 0 && calls.length > 0;
  const searchEmpty = members.length === 0 && query.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* ── Day navigator — frosted command bar ──────────────────────────── */}
      <div className="glass flex flex-wrap items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5 shadow-sm">
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(shiftDay(date, -1))}
          aria-label={t('prev_day')}
        >
          <ChevronLeft aria-hidden />
          <span className="hidden sm:inline">{t('prev_day')}</span>
        </Button>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-xs">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            {dayLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            )}
          </span>
          <span className="capitalize">{dayLabel}</span>
          {/* "OGGI" badge hidden on mobile (keeps the bar compact on phones). */}
          {isToday && (
            <span className="ml-0.5 hidden items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-glow-pulse" aria-hidden />
              {t('today')}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(shiftDay(date, 1))}
          aria-label={t('next_day')}
        >
          <span className="hidden sm:inline">{t('next_day')}</span>
          <ChevronRight aria-hidden />
        </Button>
        {!isToday && (
          <Button variant="secondary" size="sm" onClick={() => go(today)}>
            <CalendarDays aria-hidden />
            {t('go_to_today')}
          </Button>
        )}
        {/* On mobile this control group drops to its own full-width row and wraps,
            so the native date picker never spills off the right edge of the screen. */}
        <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
          {/* Server name search — typing fetches the matching first page. */}
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search_placeholder')}
              aria-label={t('search_placeholder')}
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-7 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-52"
            />
            {searching ? (
              <Loader2
                className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="×"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          <input
            type="date"
            // Uncontrolled + remount-on-date so typing isn't fought by React;
            // `key` re-seeds the value after a real navigation (buttons/picker).
            key={date}
            defaultValue={date}
            onChange={(e) => {
              const v = e.target.value;
              if (v && Number(v.slice(0, 4)) >= 1000 && v !== date) go(v);
            }}
            className="h-9 shrink-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('pick_day')}
          />
        </div>
      </div>

      {totalMembers === 0 ? (
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
              filledSlots={filledSlots}
              totalSlots={totalSlots}
              cams={filledCams}
              liveLabel={t('live')}
              liveCallTitle={liveCall?.title ?? null}
            />
          )}

          {searchEmpty ? (
            <div className="rounded-xl border border-border/70 bg-card py-10 text-center text-sm text-muted-foreground shadow-card">
              {t('search_empty')}
            </div>
          ) : (
            <>
              {/* ── Per-call challenge cards ──────────────────────────────── */}
              <div className="space-y-5">
                {calls.map((c) => {
                  const presentCount = summary.presentCounts[c.id] ?? 0;
                  const ratio = totalMembers ? presentCount / totalMembers : 0;
                  const pct = Math.round(ratio * 100);
                  const full = totalMembers > 0 && presentCount >= totalMembers;
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
                              <span className={tone.text}>{presentCount}</span>/{totalMembers}
                            </span>
                          </div>
                        </div>
                        <CompletionRing
                          present={presentCount}
                          total={totalMembers}
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

              {/* One "mostra altri" for the whole grid (members are shared across calls). */}
              {members.length < total && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {members.length} / {total}
                  </span>
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    {t('show_more')}
                  </button>
                </div>
              )}
            </>
          )}
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
  filledSlots,
  totalSlots,
  cams,
  liveLabel,
  liveCallTitle,
}: {
  filledSlots: number;
  totalSlots: number;
  cams: number;
  /** Translated "In diretta" label. */
  liveLabel: string;
  /** Title of the call currently live (within its first hour), else null. */
  liveCallTitle: string | null;
}) {
  return (
    <div className="surface-grid relative overflow-hidden rounded-xl border bg-card p-5 shadow-card">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl animate-aurora"
        aria-hidden
      />
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4">
        <CompletionRing present={filledSlots} total={totalSlots} size={104} stroke={9} />
        {/* Live banner — sits where the redundant day % used to be; only while a
            call is in its first hour (see liveCall in AttendanceTable). */}
        {liveCallTitle && (
          <span className="inline-flex items-center gap-2.5 rounded-full border border-success/30 bg-success/12 px-4 py-2 text-success ring-1 ring-success/25">
            <Radio className="h-4 w-4 shrink-0 animate-glow-pulse" aria-hidden />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold uppercase tracking-wide">{liveLabel}</span>
              <span className="truncate text-[11px] font-medium text-success/80">{liveCallTitle}</span>
            </span>
          </span>
        )}
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
