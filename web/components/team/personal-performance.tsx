'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Target, TrendingUp, UserPlus } from 'lucide-react';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import { CountUp } from '@/components/ui/count-up';
import { kpisFromStages } from '@/lib/prospect-kpis';
import type { ProspectStage } from '@/lib/types/db';

/**
 * PersonalPerformance — the marketer's OWN funnel KPIs (prospect / iscrizioni /
 * conversione) with a period filter on top (Sempre, Questo mese, Mese scorso,
 * Ultimi 30 giorni, or a custom Da→A range with a calendar). The cohort is
 * anchored on the prospect's funnel-entry date, so the numbers answer "dei
 * prospect entrati nel periodo, quanti hanno visto la Business Info e quanti si
 * sono iscritti". Conversion = iscritti ÷ business info. Client-side + instant.
 */

export interface PersonalProspect {
  stage: ProspectStage;
  /** ISO timestamp of funnel entry — the cohort anchor for period filtering. */
  enteredFunnelAt: string;
}

type Preset = 'all' | 'this_month' | 'last_month' | 'last_30' | 'custom';

/** Floor for the date pickers — guards against absurd years (e.g. 3450). */
const MIN_DATE = '2015-01-01';

/** Keep a YYYY-MM-DD value within [min, max] (ISO strings compare correctly). */
function clampDay(v: string, min: string, max: string): string {
  if (!v) return v;
  return v < min ? min : v > max ? max : v;
}

/** Resolve a [from, to) millisecond window for the selected period. */
function rangeFor(
  preset: Preset,
  fromStr: string,
  toStr: string,
): { from: number | null; to: number | null } {
  const now = new Date();
  switch (preset) {
    case 'this_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
      };
    case 'last_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
        to: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      };
    case 'last_30':
      return { from: now.getTime() - 30 * 86_400_000, to: null };
    case 'custom':
      return {
        from: fromStr ? new Date(fromStr).getTime() : null,
        // include the whole end day (range is [from, to))
        to: toStr ? new Date(toStr).getTime() + 86_400_000 : null,
      };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

export function PersonalPerformance({
  prospects,
}: {
  prospects: PersonalProspect[];
}) {
  const t = useTranslations('team');
  const tg = useTranslations('genealogia');

  const [preset, setPreset] = React.useState<Preset>('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  // Upper bound = today (no future cohorts); ISO YYYY-MM-DD.
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const kpis = React.useMemo(() => {
    const { from: lo, to: hi } = rangeFor(preset, from, to);
    const stages = prospects
      .filter((p) => {
        if (lo === null && hi === null) return true;
        const ts = new Date(p.enteredFunnelAt).getTime();
        if (lo !== null && ts < lo) return false;
        if (hi !== null && ts >= hi) return false;
        return true;
      })
      .map((p) => p.stage);
    return kpisFromStages(stages);
  }, [prospects, preset, from, to]);

  const PRESETS: ReadonlyArray<{ key: Preset; label: string }> = [
    { key: 'all', label: t('period_all') },
    { key: 'this_month', label: t('period_this_month') },
    { key: 'last_month', label: t('period_last_month') },
    { key: 'last_30', label: t('period_last_30') },
    { key: 'custom', label: t('period_custom') },
  ];

  return (
    <div className="border-t bg-muted/20">
      {/* Title + period selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('kpi_personal_title')}
        </p>
        <div
          className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/50 p-1"
          role="group"
          aria-label={t('period_label')}
        >
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              aria-pressed={preset === p.key}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                preset === p.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom range (calendar) */}
      {preset === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 px-4 pt-2.5">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            {t('period_from')}
            <input
              type="date"
              value={from}
              min={MIN_DATE}
              max={to || today}
              onChange={(e) => setFrom(e.target.value)}
              onBlur={(e) => setFrom(clampDay(e.target.value, MIN_DATE, to || today))}
              className="rounded-md border bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            {t('period_to')}
            <input
              type="date"
              value={to}
              min={from || MIN_DATE}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              onBlur={(e) => setTo(clampDay(e.target.value, from || MIN_DATE, today))}
              className="rounded-md border bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
      )}

      {/* KPIs (recomputed for the selected period) */}
      <div className="mt-2 grid grid-cols-3 divide-x">
        <Stat
          icon={Target}
          label={tg('kpi_prospects')}
          value={kpis.prospects}
          format={(n) => formatNumber(Math.round(n))}
          accent="text-info"
        />
        <Stat
          icon={UserPlus}
          label={tg('kpi_iscrizioni')}
          value={kpis.iscrizioni}
          format={(n) => formatNumber(Math.round(n))}
          accent="text-success"
        />
        <Stat
          icon={TrendingUp}
          label={tg('kpi_conversion')}
          value={kpis.conversionRate}
          format={formatPercent}
          accent="text-warning"
          hint={t('kpi_conversion_caption')}
        />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  format,
  accent,
  hint,
}: {
  icon: typeof Target;
  label: string;
  value: number;
  format: (n: number) => string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', accent ?? 'text-muted-foreground')} aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
        <CountUp value={value} format={format} />
      </span>
      {hint && (
        <span className="text-[10px] leading-tight text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}
