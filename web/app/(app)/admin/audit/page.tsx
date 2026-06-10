import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listAuditLog } from '@/lib/data/admin';
import { AUDIT_ACTION_LABELS, type AuditAction } from '@/lib/types/db';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { AuditFilter, AuditTimeline } from '@/components/admin';

/**
 * /admin/audit — the org audit timeline (doc 01 §6.8 / doc 10 §5). RSC. Reads an
 * optional `?action=` filter and lists `audit_log` through the demo-safe data
 * layer (mock fallback when env is missing OR a query fails).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin_audit');
  return { title: t('title') };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AuditPage(props: {
  searchParams?: Promise<{ action?: string | string[] }>;
}) {
  const searchParams = await props.searchParams;
  const t = await getTranslations('admin_audit');
  const raw = one(searchParams?.action);
  const action: AuditAction | 'all' =
    raw && raw in AUDIT_ACTION_LABELS ? (raw as AuditAction) : 'all';

  const { data, demo } = await listAuditLog(action === 'all' ? undefined : action);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AuditFilter action={action} />
      {demo && <ConfigNotice variant="inline" />}
      <p className="text-sm text-muted-foreground">{t('count', { count: data.length })}</p>
      <AuditTimeline data={data} />
    </div>
  );
}
