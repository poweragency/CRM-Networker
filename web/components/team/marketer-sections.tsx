'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { GraduationCap, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * MarketerSections — the top-level switch of the marketer profile, splitting it
 * into "Produzione" (everything operational: percorsi, contatti, file personali)
 * and "Formazione" (playlist WOW/Click, libri letti). Both halves are composed by
 * the page and passed in as nodes; this is just the tab shell. Mirrors on
 * /team/[id] and /impostazioni.
 */
export function MarketerSections({
  production,
  formazione,
}: {
  production: ReactNode;
  formazione: ReactNode;
}) {
  const t = useTranslations('team');
  return (
    <Tabs defaultValue="produzione" className="gap-4">
      <TabsList className="h-10 p-1">
        <TabsTrigger value="produzione" className="px-4 py-1.5 font-semibold">
          <TrendingUp className="h-4 w-4" aria-hidden />
          {t('section_produzione')}
        </TabsTrigger>
        <TabsTrigger value="formazione" className="px-4 py-1.5 font-semibold">
          <GraduationCap className="h-4 w-4" aria-hidden />
          {t('section_formazione')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="produzione" className="space-y-5">
        {production}
      </TabsContent>
      <TabsContent value="formazione">{formazione}</TabsContent>
    </Tabs>
  );
}
