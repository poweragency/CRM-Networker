'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MapPin, Search, Users, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { RankBadge } from '@/components/ui/rank-badge';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/crm/empty-state';
import { WhatsAppButton } from '@/components/crm/whatsapp-button';
import { TopbarSlot } from '@/components/shell/topbar-slot';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import {
  STARTING_PACKAGE_LABELS,
  STATUS_LABELS,
  type MarketerStatus,
  type TeamMemberRow,
} from '@/lib/types/db';

/**
 * TeamRoster — the Statistiche roster. A client component for instant
 * name/città/regione search over the server rows. Premium table: a two-line
 * identity cell (avatar + name with città·regione subtitle + status dot), rank,
 * package, registration and team size, with the WHOLE row navigating to the
 * member profile (/team/[id]). A summary strip surfaces totals at a glance.
 */

const STATUS_TONE: Record<MarketerStatus, string> = {
  active: 'bg-success',
  inactive: 'bg-muted-foreground/50',
};

export function TeamRoster({ rows }: { rows: TeamMemberRow[] }) {
  const t = useTranslations('statistiche');
  const router = useRouter();
  const [q, setQ] = React.useState('');

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(
        (r) =>
          r.display_name.toLowerCase().includes(needle) ||
          (r.city ?? '').toLowerCase().includes(needle) ||
          (r.region ?? '').toLowerCase().includes(needle),
      )
    : rows;

  const activeCount = React.useMemo(
    () => rows.filter((r) => r.status === 'active').length,
    [rows],
  );
  const teamTotal = React.useMemo(
    () => rows.reduce((acc, r) => acc + r.team_size, 0),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <EmptyState icon={<Users />} title={t('empty_title')} description={t('empty_body')} />
    );
  }

  return (
    <div className="space-y-4">
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
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="×"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </TopbarSlot>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <SummaryStat label={t('stat_members')} value={rows.length} />
          <SummaryStat label={t('stat_active')} value={activeCount} tone="success" />
          <SummaryStat label={t('stat_team')} value={teamTotal} tone="info" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {needle
          ? t('count', { count: filtered.length })
          : t('count', { count: rows.length })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={t('no_results_title')}
          description={t('no_results_body')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full caption-bottom text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="h-10 px-4 text-left">{t('col_name')}</th>
                <th className="h-10 px-3 text-left">{t('col_rank')}</th>
                <th className="h-10 px-3 text-left">{t('col_package')}</th>
                <th className="hidden h-10 px-3 text-left lg:table-cell">
                  {t('col_registration')}
                </th>
                <th className="h-10 px-4 text-right">{t('col_team')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const location = [r.city, r.region].filter(Boolean).join(' · ');
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/team/${r.id}`)}
                    className="group cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
                  >
                    {/* Identity — two lines */}
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
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
                          <span className="block truncate font-medium text-foreground group-hover:text-primary">
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
                        <Badge variant="secondary">
                          {STARTING_PACKAGE_LABELS[r.starting_package]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">
                      {r.registration_date ? formatDate(r.registration_date) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1.5 tabular-nums text-foreground">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        {formatNumber(r.team_size)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'info';
}) {
  const dot =
    tone === 'success' ? 'bg-success' : tone === 'info' ? 'bg-info' : 'bg-muted-foreground/50';
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {formatNumber(value)}
      </p>
    </div>
  );
}
