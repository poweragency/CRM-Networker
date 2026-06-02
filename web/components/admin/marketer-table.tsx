import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import {
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_STATUS_TONE,
  ROLE_LABELS,
  STATUS_LABELS,
  type AdminMarketerRow,
  type MarketerStatus,
} from '@/lib/types/db';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { EmptyState } from '@/components/crm/empty-state';
import { formatNumber, initials } from '@/lib/utils';

const MARKETER_STATUS_TONE: Record<
  MarketerStatus,
  'success' | 'info' | 'secondary'
> = {
  active: 'success',
  pending: 'info',
  inactive: 'secondary',
};

/**
 * Marketer registry table — server-rendered list of the org's profiles with
 * rank, profile status, account status, role and team size. Read-only; the
 * pre-registration entry point lives in the page header.
 */
export async function MarketerTable({ rows }: { rows: AdminMarketerRow[] }) {
  const t = await getTranslations('admin_marketer');

  if (rows.length === 0) {
    return (
      <EmptyState icon={<Users />} title={t('empty_title')} description={t('empty_body')} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full caption-bottom text-sm">
        <thead className="bg-muted/60">
          <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="h-11 px-3 text-left">{t('col_name')}</th>
            <th className="h-11 px-3 text-left">{t('col_rank')}</th>
            <th className="h-11 px-3 text-left">{t('col_status')}</th>
            <th className="h-11 px-3 text-left">{t('col_account')}</th>
            <th className="h-11 px-3 text-left">{t('col_role')}</th>
            <th className="h-11 px-3 text-right">{t('col_team')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {initials(r.display_name)}
                  </span>
                  <span className="min-w-0">
                    <Link
                      href={`/team/${r.id}`}
                      className="block truncate font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {r.display_name}
                    </Link>
                    {r.email && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.email}
                      </span>
                    )}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2.5">
                <RankBadge rank={r.rank} />
              </td>
              <td className="px-3 py-2.5">
                <Badge variant={MARKETER_STATUS_TONE[r.status]}>
                  {STATUS_LABELS[r.status]}
                </Badge>
              </td>
              <td className="px-3 py-2.5">
                <Badge variant={ACCOUNT_STATUS_TONE[r.account_status]}>
                  {ACCOUNT_STATUS_LABELS[r.account_status]}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {r.role ? ROLE_LABELS[r.role] : t('no_role')}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                {formatNumber(r.team_size)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
