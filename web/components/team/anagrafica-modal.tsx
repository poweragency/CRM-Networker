'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { MarketerAnagrafica } from '@/components/team/marketer-anagrafica';
import type { TeamMemberProfile } from '@/lib/types/db';

/**
 * AnagraficaModal — a top-of-page button that opens the member's anagrafica in a
 * modal window, instead of taking up vertical space inline. Hosts the
 * {@link MarketerAnagrafica} editor in "bare" mode (no card chrome — the modal
 * provides the title/frame). Same edit gating as the inline card.
 */
export function AnagraficaModal({
  profile,
  canEdit,
  canEditIdentity = false,
}: {
  profile: TeamMemberProfile;
  canEdit: boolean;
  canEditIdentity?: boolean;
}) {
  const t = useTranslations('team');
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <IdCard aria-hidden />
        {t('anagrafica_title')}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t('anagrafica_title')}
        description={t('anagrafica_subtitle')}
        size="xl"
      >
        <MarketerAnagrafica
          profile={profile}
          canEdit={canEdit}
          canEditIdentity={canEditIdentity}
          bare
        />
      </Modal>
    </>
  );
}
