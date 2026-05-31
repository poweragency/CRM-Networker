import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FileBarChart } from 'lucide-react';
import { listExportJobs, listReports } from '@/lib/data/reports';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { EmptyState } from '@/components/crm/empty-state';
import {
  ExportJobsTable,
  ReportCard,
  ReportsView,
} from '@/components/reports';

/**
 * /report — automatic performance reports + export queue (doc 15, build seq §11).
 * RSC. Reads the immutable `monthly_reports` snapshots and the
 * `report_export_jobs` queue through the demo-safe data layer (mock fallback when
 * env is missing OR a query fails), then renders them in a tabbed shell. The
 * per-report export buttons enqueue jobs through a demo-safe Server Action.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('report');
  return { title: t('title') };
}

export default async function ReportPage() {
  const t = await getTranslations('report');
  const [reportsRes, jobsRes] = await Promise.all([
    listReports(),
    listExportJobs(),
  ]);
  const demo = reportsRes.demo || jobsRes.demo;

  const reportsPanel =
    reportsRes.data.length === 0 ? (
      <EmptyState
        icon={<FileBarChart />}
        title={t('empty_reports_title')}
        description={t('empty_reports_body')}
      />
    ) : (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {reportsRes.data.map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>
    );

  const exportsPanel = (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('jobs_subtitle')}</p>
      <ExportJobsTable data={jobsRes.data} />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {demo && <ConfigNotice variant="inline" />}
      <ReportsView reports={reportsPanel} exports={exportsPanel} />
    </div>
  );
}
