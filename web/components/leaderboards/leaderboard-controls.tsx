'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LEADERBOARD_METRIC_LABELS,
  LEADERBOARD_METRIC_ORDER,
  LEADERBOARD_SCOPE_LABELS,
  type BranchScope,
  type LeaderboardMetric,
  type LeaderboardScope,
} from '@/lib/types/db';
import { cn } from '@/lib/utils';

/**
 * Leaderboard controls — URL-driven metric / scope / branch selectors. Pushes
 * `?metric=&scope=&branch=` so the ranking is shareable and the page stays a
 * server component reading `searchParams`. The branch selector appears only for
 * the `branch` scope. Uses `router.push` from the current values (no
 * `useSearchParams`, so no Suspense boundary needed).
 */

const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export interface LeaderboardControlsProps {
  metric: LeaderboardMetric;
  scope: LeaderboardScope;
  branch: BranchScope;
}

export function LeaderboardControls({
  metric,
  scope,
  branch,
}: LeaderboardControlsProps) {
  const t = useTranslations('classifiche');
  const tb = useTranslations('branch');
  const router = useRouter();

  function go(next: { metric?: LeaderboardMetric; scope?: LeaderboardScope; branch?: BranchScope }) {
    const m = next.metric ?? metric;
    const s = next.scope ?? scope;
    const b = next.branch ?? (branch === 'GLOBAL' ? 'LEFT' : branch);
    const params = new URLSearchParams();
    params.set('metric', m);
    params.set('scope', s);
    if (s === 'branch') params.set('branch', b);
    router.push(`/classifiche?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t('metric')}</span>
        <select
          className={selectClass}
          value={metric}
          onChange={(e) => go({ metric: e.target.value as LeaderboardMetric })}
        >
          {LEADERBOARD_METRIC_ORDER.map((opt) => (
            <option key={opt} value={opt}>
              {LEADERBOARD_METRIC_LABELS[opt]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t('scope')}</span>
        <select
          className={selectClass}
          value={scope}
          onChange={(e) => go({ scope: e.target.value as LeaderboardScope })}
        >
          {(['org', 'team', 'branch'] as const).map((opt) => (
            <option key={opt} value={opt}>
              {LEADERBOARD_SCOPE_LABELS[opt]}
            </option>
          ))}
        </select>
      </label>

      {scope === 'branch' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('branch')}</span>
          <select
            className={cn(selectClass)}
            value={branch === 'GLOBAL' ? 'LEFT' : branch}
            onChange={(e) => go({ branch: e.target.value as BranchScope })}
          >
            <option value="LEFT">{tb('left')}</option>
            <option value="RIGHT">{tb('right')}</option>
          </select>
        </label>
      )}
    </div>
  );
}
