import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Video } from 'lucide-react';
import { getAttendanceView } from '@/lib/data/attendance';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { AttendanceTable } from '@/components/presenze/attendance-table';
import { todayInTimeZone } from '@/lib/utils';

/**
 * /presenze — the Zoom attendance table (RSC). Each viewer sees everyone from
 * themselves DOWN (their visible subtree) and marks, per day, whether each person
 * attended the three calls (Wake Up / Golden / Join The Dream). The day is read
 * from `?date=` (defaults to today); the table is "divided by days". Data flows
 * through the demo-safe attendance layer (mock-backed for now).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('presenze');
  return { title: t('title') };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function PresenzePage({
  searchParams,
}: {
  searchParams?: { date?: string | string[] };
}) {
  const t = await getTranslations('presenze');

  // Org-local day (Europe/Rome), NOT UTC: otherwise "today"/the "OGGI" anchor and
  // the live banner are off by one for ~1-2h every night.
  const today = todayInTimeZone();
  const param = one(searchParams?.date);
  const date = param && ISO_DAY.test(param) ? param : today;

  // First page of members + day-wide summary. Real teams are small (5-20 people →
  // one page); large subtrees page/search server-side instead of shipping 10k rows.
  const PAGE_SIZE = 100;
  const { calls, members, total, summary, demo } = await getAttendanceView(date, {
    limit: PAGE_SIZE,
  });

  return (
    <div className="animate-fade-in space-y-5">
      {demo && <ConfigNotice variant="inline" />}
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={<Video className="text-primary" />}
        className="mb-0"
      />
      <AttendanceTable
        date={date}
        calls={calls}
        members={members}
        total={total}
        summary={summary}
        pageSize={PAGE_SIZE}
        today={today}
      />
    </div>
  );
}
