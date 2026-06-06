'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { LineChart, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn, formatPercent } from '@/lib/utils';
import {
  phaseConversionsFromStages,
  type FunnelPhaseConversions,
  type PhaseConversion,
} from '@/lib/prospect-kpis';
import type { ProspectStage } from '@/lib/types/db';
import type { PersonalProspect } from '@/components/team/personal-performance';

/**
 * PerformanceModal — a clickable "Performance" button that opens a LARGE modal
 * with the marketer's funnel STEP-conversion rates (Business Info → Follow-up →
 * Closing → Iscrizione). Two views:
 *   • Per mese — a trend line chart + a per-month table with the month-over-month
 *     delta (in percentage points) for every phase, so "−5% in Follow-up→Closing
 *     rispetto al mese scorso" is read at a glance.
 *   • Da data a data — the three conversions aggregated over a custom range.
 * Cohort anchored on the prospect's funnel-entry date. Lives only in "Produzione".
 */

type Mode = 'monthly' | 'custom';
type PhaseKey = keyof FunnelPhaseConversions;

const PHASES: ReadonlyArray<{ key: PhaseKey; labelKey: string; color: string }> = [
  { key: 'biToFup', labelKey: 'perf_bi_to_fup', color: 'text-info' },
  { key: 'fupToClosing', labelKey: 'perf_fup_to_closing', color: 'text-warning' },
  { key: 'closingToIscrizione', labelKey: 'perf_closing_to_iscrizione', color: 'text-success' },
];

interface MonthBucket {
  key: string;
  label: string;
  short: string;
  conv: FunnelPhaseConversions;
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMonth(key: string, style: 'long' | 'short'): string {
  const [y, m] = key.split('-').map(Number);
  const label = new Intl.DateTimeFormat('it-IT', {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
  }).format(new Date(y, m - 1, 1));
  return (label.charAt(0).toUpperCase() + label.slice(1)).replace('.', '');
}

export function PerformanceModal({
  prospects,
}: {
  prospects: PersonalProspect[];
}) {
  const t = useTranslations('team');
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        size="lg"
        onClick={() => setOpen(true)}
        className="group relative w-full gap-2.5 overflow-hidden px-8 text-base font-semibold shadow-glow sm:w-auto sm:min-w-[15rem]"
      >
        {/* Sweeping sheen on hover — gives the primary CTA a premium shimmer. */}
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-emphasized group-hover:translate-x-full"
          aria-hidden
        />
        <LineChart className="h-[18px] w-[18px]" aria-hidden />
        {t('performance_button')}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t('performance_title')}
        description={t('performance_subtitle')}
        size="xl"
      >
        <PerformanceContent prospects={prospects} />
      </Modal>
    </>
  );
}

function PerformanceContent({ prospects }: { prospects: PersonalProspect[] }) {
  const t = useTranslations('team');
  const [mode, setMode] = React.useState<Mode>('monthly');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  // Per-month buckets (cohort = month of funnel entry), most recent first.
  const months = React.useMemo<MonthBucket[]>(() => {
    const map = new Map<string, ProspectStage[]>();
    for (const p of prospects) {
      const k = monthKey(p.enteredFunnelAt);
      const arr = map.get(k);
      if (arr) arr.push(p.stage);
      else map.set(k, [p.stage]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, stages]) => ({
        key,
        label: fmtMonth(key, 'long'),
        short: fmtMonth(key, 'short'),
        conv: phaseConversionsFromStages(stages),
      }));
  }, [prospects]);

  // Aggregated conversions for the custom Da→A range.
  const customConv = React.useMemo<FunnelPhaseConversions>(() => {
    const lo = from ? new Date(from).getTime() : null;
    const hi = to ? new Date(to).getTime() + 86_400_000 : null;
    const stages = prospects
      .filter((p) => {
        if (lo === null && hi === null) return true;
        const ts = new Date(p.enteredFunnelAt).getTime();
        if (lo !== null && ts < lo) return false;
        if (hi !== null && ts >= hi) return false;
        return true;
      })
      .map((p) => p.stage);
    return phaseConversionsFromStages(stages);
  }, [prospects, from, to]);

  const MODES: ReadonlyArray<{ key: Mode; label: string }> = [
    { key: 'monthly', label: t('perf_by_month') },
    { key: 'custom', label: t('perf_custom') },
  ];

  return (
    <div className="space-y-5">
      {/* Mode toggle — segmented control */}
      <div
        className="inline-flex gap-1 rounded-lg border border-border/70 bg-muted/60 p-1"
        role="group"
        aria-label={t('period_label')}
      >
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            aria-pressed={mode === m.key}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              mode === m.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'monthly' ? (
        months.length === 0 ? (
          <EmptyPerf />
        ) : (
          <>
            <TrendChart months={months} />
            <MonthlyTable months={months} />
          </>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('period_from')}
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('period_to')}
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PHASES.map((p) => (
              <div
                key={p.key}
                className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-card transition-shadow duration-base ease-standard hover:shadow-card-hover"
              >
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full bg-current', p.color)} aria-hidden />
                  <p className="text-xs font-medium text-muted-foreground">{t(p.labelKey)}</p>
                </div>
                <div className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                  <Pct c={customConv[p.key]} big />
                </div>
                <span
                  className={cn(
                    'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-current opacity-30',
                    p.color,
                  )}
                  aria-hidden
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-tight text-muted-foreground">{t('perf_note')}</p>
    </div>
  );
}

/* ────────────────────────────── trend chart ────────────────────────────── */

const CHART_W = 720;
const CHART_H = 240;
const PAD = { top: 16, right: 16, bottom: 26, left: 38 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

function TrendChart({ months }: { months: MonthBucket[] }) {
  const t = useTranslations('team');
  // Chronological (oldest → newest) for left-to-right reading.
  const data = React.useMemo(() => [...months].reverse(), [months]);
  const n = data.length;

  const xAt = (i: number) =>
    PAD.left + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yAt = (rate: number) => PAD.top + (1 - rate) * PLOT_H;

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-card">
      {/* Title + legend */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{t('perf_chart_title')}</p>
        <div className="flex flex-wrap gap-3">
          {PHASES.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full bg-current', p.color)} aria-hidden />
              {t(p.labelKey)}
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t('perf_chart_title')}
      >
        {/* Y gridlines + labels */}
        {Y_TICKS.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={CHART_W - PAD.right}
              y1={yAt(tick)}
              y2={yAt(tick)}
              style={{ stroke: 'hsl(var(--border))' }}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={yAt(tick) + 3}
              textAnchor="end"
              className="text-[10px]"
              style={{ fill: 'hsl(var(--muted-foreground))' }}
            >
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}

        {/* X labels (months) */}
        {data.map((m, i) => (
          <text
            key={m.key}
            x={xAt(i)}
            y={CHART_H - 8}
            textAnchor="middle"
            className="text-[10px]"
            style={{ fill: 'hsl(var(--muted-foreground))' }}
          >
            {m.short}
          </text>
        ))}

        {/* One line + dots per phase (skip months with no denominator) */}
        {PHASES.map((p) => {
          const pts = data
            .map((m, i) => ({ i, c: m.conv[p.key] }))
            .filter((d) => d.c.from > 0);
          if (pts.length === 0) return null;
          const poly = pts.map((d) => `${xAt(d.i)},${yAt(d.c.rate)}`).join(' ');
          return (
            <g key={p.key} className={p.color}>
              {pts.length > 1 && (
                <polyline
                  points={poly}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {pts.map((d) => (
                <circle
                  key={d.i}
                  cx={xAt(d.i)}
                  cy={yAt(d.c.rate)}
                  r={3.5}
                  fill="currentColor"
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ────────────────────────────── monthly table ──────────────────────────── */

function MonthlyTable({ months }: { months: MonthBucket[] }) {
  const t = useTranslations('team');
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-foreground">{t('perf_table_title')}</p>
      <div className="overflow-x-auto rounded-xl border border-border/70 shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-[11px] uppercase tracking-wide">
              <th className="px-3 py-2.5 font-semibold text-muted-foreground">{t('perf_month')}</th>
              {PHASES.map((p) => (
                <th key={p.key} className="px-3 py-2.5 text-right font-semibold text-muted-foreground">
                  {t(p.labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {months.map((m, idx) => {
              // "Mese precedente" = the older month (one row below, recent-first list).
              const prev = months[idx + 1];
              return (
                <tr key={m.key} className="transition-colors hover:bg-muted/40">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                    {m.label}
                  </td>
                  {PHASES.map((p) => (
                    <td key={p.key} className="px-3 py-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <Pct c={m.conv[p.key]} />
                        <Delta curr={m.conv[p.key]} prev={prev?.conv[p.key]} />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────── small parts ───────────────────────────── */

/** A conversion value: percentage + the reached/total fraction (— when no data). */
function Pct({ c, big = false }: { c: PhaseConversion; big?: boolean }) {
  if (c.from === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-foreground">{formatPercent(c.rate, 0)}</span>{' '}
      <span className={cn('font-normal text-muted-foreground', big ? 'text-sm' : 'text-xs')}>
        ({c.to}/{c.from})
      </span>
    </span>
  );
}

/** Relative month-over-month change of the rate, with arrow + color. */
function Delta({ curr, prev }: { curr: PhaseConversion; prev?: PhaseConversion }) {
  const t = useTranslations('team');
  if (!prev || curr.from === 0 || prev.from === 0 || prev.rate === 0) return null;
  // Variazione relativa: di quanto è cambiato il tasso rispetto al mese prima.
  const d = (curr.rate - prev.rate) / prev.rate;
  const Icon = d > 0.0005 ? ArrowUpRight : d < -0.0005 ? ArrowDownRight : Minus;
  const tone =
    d > 0.0005 ? 'text-success' : d < -0.0005 ? 'text-danger' : 'text-muted-foreground';
  const sign = d > 0.0005 ? '+' : d < -0.0005 ? '−' : '';
  return (
    <span
      className={cn('flex items-center gap-0.5 text-[11px] font-medium tabular-nums', tone)}
      title={t('perf_vs_prev')}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {sign}
      {formatPercent(Math.abs(d), 0)}
    </span>
  );
}

function EmptyPerf() {
  const t = useTranslations('team');
  return (
    <div className="rounded-lg border border-dashed bg-card/40 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{t('perf_empty')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('perf_empty_body')}</p>
    </div>
  );
}
