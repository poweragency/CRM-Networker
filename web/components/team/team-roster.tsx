'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { RankBadge } from '@/components/ui/rank-badge';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/crm/empty-state';
import { formatDate, formatNumber, initials } from '@/lib/utils';
import { STARTING_PACKAGE_LABELS, type TeamMemberRow } from '@/lib/types/db';

/**
 * TeamRoster — the Statistiche list of team members. A client component so it can
 * offer instant name/città search over the server-provided rows. Each member is a
 * clickable link to their profile (/team/[id]).
 */
export function TeamRoster({ rows }: { rows: TeamMemberRow[] }) {
  const t = useTranslations('statistiche');
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

  if (rows.length === 0) {
    return (
      <EmptyState icon={<Users />} title={t('empty_title')} description={t('empty_body')} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search_placeholder')}
          className="pl-9"
          aria-label={t('search_placeholder')}
        />
      </div>

      <p className="text-sm text-muted-foreground">{t('count', { count: rows.length })}</p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={t('no_results_title')}
          description={t('no_results_body')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full caption-bottom text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b text-xs font-medium text-muted-foreground">
                <th className="h-11 px-3 text-left">{t('col_name')}</th>
                <th className="h-11 px-3 text-left">{t('col_rank')}</th>
                <th className="h-11 px-3 text-left">{t('col_package')}</th>
                <th className="h-11 px-3 text-left">{t('col_city')}</th>
                <th className="h-11 px-3 text-left">{t('col_region')}</th>
                <th className="h-11 px-3 text-left">{t('col_registration')}</th>
                <th className="h-11 px-3 text-right">{t('col_team')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {initials(r.display_name)}
                      </span>
                      <Link
                        href={`/team/${r.id}`}
                        className="truncate font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {r.display_name}
                      </Link>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <RankBadge rank={r.rank} />
                  </td>
                  <td className="px-3 py-2.5">
                    {r.starting_package ? (
                      <Badge variant="secondary">
                        {STARTING_PACKAGE_LABELS[r.starting_package]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.city ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.region ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {r.registration_date ? formatDate(r.registration_date) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {formatNumber(r.team_size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
