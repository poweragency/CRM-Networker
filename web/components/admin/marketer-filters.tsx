'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import {
  ACCOUNT_STATUS_LABELS,
  STATUS_LABELS,
  type AccountStatus,
  type MarketerStatus,
} from '@/lib/types/db';

/**
 * Marketer registry filters — URL-driven search + status + account selectors.
 * Pushes `?q=&status=&account=` so the filtered registry is a server component
 * reading `searchParams`. Search submits on Enter; selects navigate on change.
 * Builds the URL from the current values (no `useSearchParams`, no Suspense).
 */

const fieldClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export interface MarketerFiltersProps {
  q: string;
  status: MarketerStatus | 'all';
  account: AccountStatus | 'all';
}

export function MarketerFilters({ q, status, account }: MarketerFiltersProps) {
  const t = useTranslations('admin_marketer');
  const tc = useTranslations('common');
  const router = useRouter();
  const [query, setQuery] = React.useState(q);

  function go(next: {
    q?: string;
    status?: MarketerStatus | 'all';
    account?: AccountStatus | 'all';
  }) {
    const params = new URLSearchParams();
    const qv = next.q ?? query;
    const sv = next.status ?? status;
    const av = next.account ?? account;
    if (qv.trim()) params.set('q', qv.trim());
    if (sv !== 'all') params.set('status', sv);
    if (av !== 'all') params.set('account', av);
    const qs = params.toString();
    router.push(qs ? `/admin/marketer?${qs}` : '/admin/marketer', { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          go({});
        }}
      >
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search_placeholder')}
          aria-label={tc('search')}
          className={`${fieldClass} w-64 pl-8`}
        />
      </form>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t('filter_status')}</span>
        <select
          className={fieldClass}
          value={status}
          onChange={(e) => go({ status: e.target.value as MarketerStatus | 'all' })}
        >
          <option value="all">{tc('all')}</option>
          {(Object.keys(STATUS_LABELS) as MarketerStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t('filter_account')}</span>
        <select
          className={fieldClass}
          value={account}
          onChange={(e) => go({ account: e.target.value as AccountStatus | 'all' })}
        >
          <option value="all">{tc('all')}</option>
          {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((a) => (
            <option key={a} value={a}>
              {ACCOUNT_STATUS_LABELS[a]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
