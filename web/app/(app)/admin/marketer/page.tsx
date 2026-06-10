import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { UserPlus } from 'lucide-react';
import { listMarketers, type MarketerFilter } from '@/lib/data/admin';
import type { AccountStatus, MarketerStatus } from '@/lib/types/db';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { buttonVariants } from '@/components/ui/button';
import { MarketerFilters, MarketerTable } from '@/components/admin';

/**
 * /admin/marketer — the marketer registry (ADR-008, build seq §11). RSC.
 * Reads search/status/account filters from the URL and lists the org's profiles
 * through the demo-safe data layer (mock fallback when env is missing OR a query
 * fails). Pre-registration is the header action.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin_marketer');
  return { title: t('title') };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminMarketerPage(props: {
  searchParams?: Promise<{ q?: string | string[]; status?: string | string[]; account?: string | string[] }>;
}) {
  const searchParams = await props.searchParams;
  const t = await getTranslations('admin_marketer');

  const q = one(searchParams?.q) ?? '';
  const status = (one(searchParams?.status) as MarketerStatus | undefined) ?? 'all';
  const account = (one(searchParams?.account) as AccountStatus | undefined) ?? 'all';
  const filter: MarketerFilter = { q, status, account };

  const { data, demo } = await listMarketers(filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Link href="/admin/marketer/nuovo" className={buttonVariants({ size: 'sm' })}>
            <UserPlus aria-hidden />
            {t('new')}
          </Link>
        }
      />

      <MarketerFilters q={q} status={status} account={account} />

      {demo && <ConfigNotice variant="inline" />}

      <p className="text-sm text-muted-foreground">{t('count', { count: data.length })}</p>
      <MarketerTable rows={data} />
    </div>
  );
}
