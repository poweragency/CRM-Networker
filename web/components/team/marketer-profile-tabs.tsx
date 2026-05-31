'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Marketer profile tabs — a thin client tabs shell (Percorso Prospect / Lista
 * 100 / Sette Perché) around three fully server-rendered, owner-scoped panels
 * passed in as props. These three are PER-PERSON files (owned by the marketer),
 * so they live here on /team/[id], not in the global menu. `defaultTab` lets the
 * Dashboard/links deep-link a specific tab via `?tab=`.
 */
export function MarketerProfileTabs({
  defaultTab,
  prospects,
  centos,
  sevenWhys,
}: {
  defaultTab: 'prospects' | 'centos' | 'seven-whys';
  prospects: ReactNode;
  centos: ReactNode;
  sevenWhys: ReactNode;
}) {
  const t = useTranslations('team');
  return (
    <Tabs defaultValue={defaultTab} className="gap-4">
      <TabsList>
        <TabsTrigger value="prospects">{t('tab_prospects')}</TabsTrigger>
        <TabsTrigger value="centos">{t('tab_centos')}</TabsTrigger>
        <TabsTrigger value="seven-whys">{t('tab_seven_whys')}</TabsTrigger>
      </TabsList>
      <TabsContent value="prospects">{prospects}</TabsContent>
      <TabsContent value="centos">{centos}</TabsContent>
      <TabsContent value="seven-whys">{sevenWhys}</TabsContent>
    </Tabs>
  );
}
