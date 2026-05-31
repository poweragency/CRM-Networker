import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getMarketerOptions } from '@/lib/data/admin';
import { listInvitations } from '@/lib/data/admin-invitations';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { InvitationsManager } from '@/components/admin';

/**
 * /admin/attivazioni — the "Activate CRM Access" workflow (doc 01 §3, ADR-003).
 * RSC shell that loads invitations + the marketer picker through the demo-safe
 * data layer and hands them to the client manager (issue/revoke via demo-safe
 * Server Actions; the real token/email runs in the Edge Function).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin_attivazioni');
  return { title: t('title') };
}

export default async function AttivazioniPage() {
  const t = await getTranslations('admin_attivazioni');
  const [invitationsRes, optionsRes] = await Promise.all([
    listInvitations(),
    getMarketerOptions(),
  ]);
  const demo = invitationsRes.demo || optionsRes.demo;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {demo && <ConfigNotice variant="inline" />}
      <InvitationsManager
        initial={invitationsRes.data}
        options={optionsRes.data}
        initialDemo={demo}
      />
    </div>
  );
}
