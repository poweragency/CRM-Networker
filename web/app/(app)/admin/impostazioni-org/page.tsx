import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getOrgSettings } from '@/lib/data/admin';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { OrgSettingsForm } from '@/components/admin';

/**
 * /admin/impostazioni-org — organization settings (doc 01 §1.1). RSC shell that
 * loads the org config through the demo-safe data layer and hands it to the
 * client form (saves via a demo-safe Server Action).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin_org');
  return { title: t('title') };
}

export default async function OrgSettingsPage() {
  const t = await getTranslations('admin_org');
  const { data, demo } = await getOrgSettings();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {demo && <ConfigNotice variant="inline" />}
      <OrgSettingsForm initial={data} initialDemo={demo} />
    </div>
  );
}
