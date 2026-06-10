import type { Metadata } from 'next';
import { getCycleTeamReport } from '@/lib/data/reports';
import { CycleReportDocument } from '@/components/report/cycle-report-document';

/**
 * /report/ciclo/[n] — the printable end-of-cycle team report (top-level route, so it
 * renders WITHOUT the app shell for a clean print; auth is enforced by middleware).
 * The rank realised in the cycle is passed via ?rank= and shown award-style.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Report ciclo — CRM Networker',
  robots: { index: false, follow: false },
};

export default async function CycleReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { n } = await params;
  const sp = await searchParams;
  const cycleNumber = Number(n) || 0;
  const rankRaw = sp.rank;
  const rank = (Array.isArray(rankRaw) ? rankRaw[0] : rankRaw) ?? '';
  const report = await getCycleTeamReport(cycleNumber);

  return <CycleReportDocument cycleNumber={cycleNumber} rank={rank} report={report} />;
}
