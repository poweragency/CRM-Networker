import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listTeamMembers } from '@/lib/data/team';
import { ConfigNotice } from '@/components/config-notice';
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
    <div className="animate-fade-in space-y-5">
      {demo && <ConfigNotice variant="inline" />}

      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <TeamRoster rows={data} />
    </div>
  );
}
