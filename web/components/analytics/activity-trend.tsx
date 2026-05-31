import { getTranslations } from 'next-intl/server';
import { Phone, Target, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MetricDayPoint } from '@/lib/types/db';
import { cn, formatNumber } from '@/lib/utils';

/**
 * Activity trend — three mini sparklines (calls, new prospects, enrollments)
 * over the period, each with its total. Pure inline SVG (no chart lib), each
 * series normalized to its own max so the shape reads regardless of magnitude.
 * Server-rendered.
 */

type Accent = 'primary' | 'info' | 'success';

const ACCENT: Record<Accent, { stroke: string; fill: string; chip: string }> = {
  primary: { stroke: 'stroke-primary', fill: 'fill-primary/15', chip: 'bg-primary/10 text-primary' },
  info: { stroke: 'stroke-info', fill: 'fill-info/15', chip: 'bg-info/12 text-info' },
  success: { stroke: 'stroke-success', fill: 'fill-success/15', chip: 'bg-success/12 text-success' },
};

function Sparkline({ values, accent }: { values: number[]; accent: Accent }) {
  const n = values.length;
  const max = Math.max(1, ...values);
  const W = 100;
  const H = 36;
  const pad = 2;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  const a = ACCENT[accent];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-12 w-full"
      role="img"
      aria-hidden
    >
      <polygon points={area} className={cn('stroke-none', a.fill)} />
      <polyline
        points={line}
        className={cn('fill-none stroke-[1.5]', a.stroke)}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export async function ActivityTrend({ data }: { data: MetricDayPoint[] }) {
  const t = await getTranslations('analytics');

  const series: ReadonlyArray<{
    key: keyof Pick<MetricDayPoint, 'calls' | 'new_prospects' | 'iscrizioni'>;
    labelKey: string;
    icon: LucideIcon;
    accent: Accent;
  }> = [
    { key: 'calls', labelKey: 'trend_calls', icon: Phone, accent: 'primary' },
    { key: 'new_prospects', labelKey: 'trend_prospects', icon: Target, accent: 'info' },
    { key: 'iscrizioni', labelKey: 'trend_iscrizioni', icon: UserPlus, accent: 'success' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {series.map(({ key, labelKey, icon: Icon, accent }) => {
        const values = data.map((d) => d[key]);
        const total = values.reduce((a, b) => a + b, 0);
        return (
          <div key={key} className="rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-md',
                    ACCENT[accent].chip,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                {t(labelKey)}
              </span>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {formatNumber(total)}
              </span>
            </div>
            <div className="mt-2">
              <Sparkline values={values} accent={accent} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
