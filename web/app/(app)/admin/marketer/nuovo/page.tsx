import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getMarketerOptions } from '@/lib/data/admin';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { PreRegisterForm } from '@/components/admin';

/**
 * /admin/marketer/nuovo — pre-registration (ADR-001 operator-driven placement).
 * RSC shell that loads the marketer picker options through the demo-safe data
 * layer and hands them to the client form, which submits via a demo-safe Server
 * Action (`place_marketer`).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin_marketer');
  return { title: t('new_title') };
}

export default async function PreRegisterPage() {
  const t = await getTranslations('admin_marketer');
  const { data, demo } = await getMarketerOptions();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('new_title')}
        description={t('new_subtitle')}
        breadcrumbs={[
          { label: t('title'), href: '/admin/marketer' },
          { label: t('new_title') },
        ]}
      />
      {demo && <ConfigNotice variant="inline" />}
      <PreRegisterForm options={data} />
    </div>
  );
}
