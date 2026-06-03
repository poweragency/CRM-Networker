'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Marketer profile tabs — a thin client tabs shell around the two primary
 * per-person files: Percorsi informativi (the prospect board) and Lista contatti
 * (the contacts list). The 7 Perché and the 100's list live in a separate, more
 * secondary "file personali" area (see PersonalFiles), not here. `defaultTab`
 * lets links deep-link a specific tab via `?tab=`.
 */
export function MarketerProfileTabs({
  defaultTab,
  prospects,
  listaContatti,
}: {
  defaultTab: 'prospects' | 'lista-contatti';
  prospects: ReactNode;
  listaContatti: ReactNode;
}) {
  const t = useTranslations('team');
  return (
    <Tabs defaultValue={defaultTab} className="gap-4">
      <TabsList>
        <TabsTrigger value="prospects">{t('tab_prospects')}</TabsTrigger>
        <TabsTrigger value="lista-contatti">{t('tab_lista_contatti')}</TabsTrigger>
      </TabsList>
      <TabsContent value="prospects">{prospects}</TabsContent>
      <TabsContent value="lista-contatti">{listaContatti}</TabsContent>
    </Tabs>
  );
}
