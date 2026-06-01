import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getZoomAttendance } from '@/lib/data/attendance';
import { ConfigNotice } from '@/components/config-notice';
import { AttendanceTable } from '@/components/presenze/attendance-table';

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

  const today = new Date().toISOString().slice(0, 10);
  const param = one(searchParams?.date);
  const date = param && ISO_DAY.test(param) ? param : today;

  const { members, demo } = await getZoomAttendance(date);

  return (
    <div className="space-y-4">
      {demo && <ConfigNotice variant="inline" />}
      <AttendanceTable date={date} members={members} today={today} />
    </div>
  );
}
