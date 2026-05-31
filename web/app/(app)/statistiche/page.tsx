import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listTeamMembers } from '@/lib/data/team';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { TeamRoster } from '@/components/team/team-roster';

/**
 * /statistiche — the team roster (RSC). Lists every member of the team; each row
 * links to that member's profile (/team/[id]). Data flows through the demo-safe
 * team layer (mock fallback when env is missing OR a query fails).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('statistiche');
  return { title: t('title') };
}

export default async function StatistichePage() {
  const t = await getTranslations('statistiche');
  const { data, demo } = await listTeamMembers();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {demo && <ConfigNotice variant="inline" />}
      <TeamRoster rows={data} />
    </div>
  );
}
