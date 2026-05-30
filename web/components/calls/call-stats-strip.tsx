'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Phone, PhoneCall, Clock, CalendarCheck } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { formatDuration, formatNumber, formatPercent } from '@/lib/utils';
import type { CallStats } from '@/lib/types/db';

/**
 * CallStatsStrip — the four-tile summary for the selected period (total calls,
 * connected + connect-rate, total talk time, appointments/enrollments). Reuses
 * the dashboard KpiCard so the calls page matches the slice-1 KPI language.
 * Recomputed client-side from the filtered log so it stays in sync as the user
 * changes the period filter or logs a new call.
 */

export interface CallStatsStripProps {
  stats: CallStats;
}

export function CallStatsStrip({ stats }: CallStatsStripProps) {
  const t = useTranslations('chiamate');

  return (
    <section
      aria-label={t('stats_title')}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiCard
        label={t('stats_total')}
        value={formatNumber(stats.total)}
        hint={t('stats_total_hint')}
        icon={Phone}
        accent="primary"
      />
      <KpiCard
        label={t('stats_connected')}
        value={formatNumber(stats.connected)}
        hint={t('stats_connected_hint', {
          rate: formatPercent(stats.connect_rate),
        })}
        icon={PhoneCall}
        accent="info"
      />
      <KpiCard
        label={t('stats_duration')}
        value={stats.duration_secs > 0 ? formatDuration(stats.duration_secs) : '—'}
        hint={t('stats_duration_hint')}
        icon={Clock}
        accent="success"
      />
      <KpiCard
        label={t('stats_appointments')}
        value={formatNumber(stats.appointments)}
        hint={t('stats_outcomes_hint', {
          appointments: stats.appointments,
          enrollments: stats.enrollments,
        })}
        icon={CalendarCheck}
        accent="warning"
      />
    </section>
  );
}
