'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Reports view — a thin client tabs wrapper (Report | Esportazioni) around two
 * fully server-rendered panels passed in as props. Keeps all data access on the
 * server while giving the page a tabbed shell.
 */
export function ReportsView({
  reports,
  exports,
}: {
  reports: ReactNode;
  exports: ReactNode;
}) {
  const t = useTranslations('report');
  return (
    <Tabs defaultValue="reports" className="gap-4">
      <TabsList>
        <TabsTrigger value="reports">{t('tab_reports')}</TabsTrigger>
        <TabsTrigger value="exports">{t('tab_exports')}</TabsTrigger>
      </TabsList>
      <TabsContent value="reports">{reports}</TabsContent>
      <TabsContent value="exports">{exports}</TabsContent>
    </Tabs>
  );
}
