'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronRight, Loader2, MapPin, Search, Users, UserCheck, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { CountUp } from '@/components/ui/count-up';
import { RankBadge } from '@/components/ui/rank-badge';
import { PackageBadge, PACKAGE_TONE } from '@/components/ui/package-badge';
import { EmptyState } from '@/components/crm/empty-state';
import { WhatsAppButton } from '@/components/crm/whatsapp-button';
import { TopbarSlot } from '@/components/shell/topbar-slot';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import {
  STATUS_LABELS,
  type MarketerStatus,
  type StartingPackage,
  type TeamMemberRow,
} from '@/lib/types/db';
import { teamRosterPageAction } from '@/app/(app)/statistiche/actions';

/**
 * TeamRoster — the Statistiche roster, SERVER-DRIVEN so it scales to any org size:
 * the page ships only the first ~50 rows + the totals; search and "load more" fetch
 * more from the server (trigram name search, RLS-scoped). Premium presentation: KPI
 * summary cards, then a roster table with a package-tinted rail, a two-line identity
 * cell, rank, package and team size; the whole row links to /team/[id].
 */

const STATUS_TONE: Record<MarketerStatus, string> = {
  active: 'bg-success',
  inactive: 'bg-muted-foreground/50',
};

/** Left accent rail tone per package (falls back to a neutral border). */
function packageRail(pkg: StartingPackage | null): string {
  if (!pkg) return 'bg-border';
  return PACKAGE_TONE[pkg]?.dot ?? 'bg-border';
}

export function TeamRoster({
  initialRows,
  total: initialTotal,
  totalAll,
  activeAll,
  pageSize,
}: {
  initialRows: TeamMemberRow[];
  total: number;
  totalAll: number;
  activeAll: number;
  pageSize: number;
}) {
  const t = useTranslations('statistiche');
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<TeamMemberRow[]>(initialRows);
  const [total, setTotal] = React.useState(initialTotal);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const reqRef = React.useRef(0);
  const firstRun = React.useRef(true);

  // Debounced server search. The first run is skipped (the initial page came from
  // the server); clearing the box re-fetches page 1 instantly.
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const needle = q.trim();
    const id = ++reqRef.current;
    setLoading(true);
    const timer = window.setTimeout(
      async () => {
        try {
          const res = await teamRosterPageAction({ search: needle, limit: pageSize });
          if (reqRef.current === id) {
            setRows(res.rows);
            setTotal(res.total);
          }
        } finally {
          if (reqRef.current === id) setLoading(false);
        }
      },
      needle ? 220 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [q, pageSize]);

  const loadMore = React.useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await teamRosterPageAction({
        search: q.trim(),
        offset: rows.length,
        limit: pageSize,
      });
      setRows((prev) => [...prev, ...res.rows]);
      setTotal(res.total);
    } finally {
      setLoadingMore(false);
    }
  }, [q, rows.length, pageSize]);

  if (totalAll === 0) {
    return (
      <EmptyState icon={<Users />} title={t('empty_title')} description={t('empty_body')} />
    );
  }

  return (
    <div className="space-y-5">
      {/* Search lives in the top navbar (only while this screen is up). */}
      <TopbarSlot>
        <div className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search_placeholder')}
            className="pl-9 pr-9"
            aria-label={t('search_placeholder')}
          />
          {loading ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
          ) : q ? (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="×"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </TopbarSlot>

      {/* KPI summary cards (org-wide totals, independent of the search) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryStat
          icon={Users}
          label={t('stat_members')}
          value={totalAll}
          chip="bg-primary/10 text-primary"
          bar="from-primary/60"
        />
        <SummaryStat
          icon={UserCheck}
          label={t('stat_active')}
          value={activeAll}
          chip="bg-success/10 text-success"
          bar="from-success/60"
        />
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('count', { count: total })}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={t('no_results_title')}
          description={t('no_results_body')}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="h-11 px-4 text-left">{t('col_name')}</th>
                  <th className="h-11 px-3 text-left">{t('col_rank')}</th>
                  <th className="h-11 px-3 text-left">{t('col_package')}</th>
                  <th className="hidden h-11 px-3 text-left lg:table-cell">
                    {t('col_registration')}
                  </th>
                  <th className="h-11 px-4 text-right">{t('col_team')}</th>
                  <th className="h-11 w-8 px-2" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const location = [r.city, r.region].filter(Boolean).join(' · ');
                  return (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/team/${r.id}`)}
                      className="group relative cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      <td className="relative py-3 pl-4 pr-4">
                        <span
                          className={cn(
                            'absolute inset-y-1.5 left-0 w-1 rounded-full opacity-70 transition-opacity group-hover:opacity-100',
                            packageRail(r.starting_package),
                          )}
                          aria-hidden
                        />
                        <span className="flex items-center gap-3 pl-2">
                          <span className="relative shrink-0">
                            <Avatar name={r.display_name} size="md" />
                            <span
                              className={cn(
                                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
                                STATUS_TONE[r.status],
                              )}
                              title={STATUS_LABELS[r.status]}
                              aria-hidden
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                              {r.display_name}
                            </span>
                            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              {location ? (
                                <>
                                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                                  {location}
                                </>
                              ) : (
                                STATUS_LABELS[r.status]
                              )}
                            </span>
                          </span>
                          <WhatsAppButton
                            phone={r.phone}
                            name={r.display_name}
                            className="ml-auto shrink-0"
                          />
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <RankBadge rank={r.rank} variant="dot" />
                      </td>
                      <td className="px-3 py-3">
                        {r.starting_package ? (
                          <PackageBadge pkg={r.starting_package} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">
                        {r.registration_date ? formatDate(r.registration_date) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-foreground">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          {formatNumber(r.team_size)}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <ChevronRight
                          className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                          aria-hidden
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length < total && (
            <div className="flex items-center justify-center gap-3 border-t border-border/70 bg-muted/20 px-4 py-3">
              <span className="text-xs text-muted-foreground">
                {rows.length} / {total}
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
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  chip,
  bar,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  /** Tone classes for the icon chip (bg + text). */
  chip: string;
  /** Gradient start color for the bottom accent bar. */
  bar: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-card transition-all duration-base ease-standard hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', chip)}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
        <CountUp value={value} format={formatNumber} />
      </p>
      <span
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r to-transparent opacity-0 transition-opacity duration-base group-hover:opacity-100',
          bar,
        )}
        aria-hidden
      />
    </div>
  );
}
