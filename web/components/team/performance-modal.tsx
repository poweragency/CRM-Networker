'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { LineChart } from 'lucide-react';
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
 * PerformanceModal — a clickable "Performance" button that opens a modal with the
 * marketer's funnel STEP-conversion rates: Business Info → Follow-up →
 * Closing → Iscrizione. Two views: a per-month breakdown (default) and a custom
 * Da→A date range. Cohort anchored on the prospect's funnel-entry date (same as
 * {@link PersonalPerformance}). Lives only in the "Produzione" section.
 */

type Mode = 'monthly' | 'custom';

const PHASES = [
  { key: 'biToFup', labelKey: 'perf_bi_to_fup' },
  { key: 'fupToClosing', labelKey: 'perf_fup_to_closing' },
  { key: 'closingToIscrizione', labelKey: 'perf_closing_to_iscrizione' },
] as const;

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const label = new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
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
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <LineChart className="h-4 w-4" aria-hidden />
        {t('performance_button')}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t('performance_title')}
        description={t('performance_subtitle')}
        size="lg"
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
  const months = React.useMemo(() => {
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
        label: monthLabel(key),
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
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1" role="group" aria-label={t('period_label')}>
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            aria-pressed={mode === m.key}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              mode === m.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground">
                    {t('perf_month')}
                  </th>
                  {PHASES.map((p) => (
                    <th
                      key={p.key}
                      className="px-3 py-2 text-right font-medium text-muted-foreground"
                    >
                      {t(p.labelKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {months.map((m) => (
                  <tr key={m.key}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                      {m.label}
                    </td>
                    {PHASES.map((p) => (
                      <td key={p.key} className="px-3 py-2 text-right">
                        <Pct c={m.conv[p.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {/* Custom range pickers */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('period_from')}
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('period_to')}
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          {/* Aggregated phase cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PHASES.map((p) => (
              <div key={p.key} className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t(p.labelKey)}
                </p>
                <div className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                  <Pct c={customConv[p.key]} big />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-tight text-muted-foreground">
        {t('perf_note')}
      </p>
    </div>
  );
}

/** A conversion cell: percentage + the reached/total fraction (— when no data). */
function Pct({ c, big = false }: { c: PhaseConversion; big?: boolean }) {
  if (c.from === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-foreground">
        {formatPercent(c.rate, 0)}
      </span>{' '}
      <span
        className={cn(
          'font-normal text-muted-foreground',
          big ? 'text-sm' : 'text-xs',
        )}
      >
        ({c.to}/{c.from})
      </span>
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
