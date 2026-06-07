'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { MarketerAnagrafica } from '@/components/team/marketer-anagrafica';
import type { TeamMemberProfile } from '@/lib/types/db';

/**
 * AnagraficaModal — a top-of-page button that opens the member's anagrafica in a
 * modal window, instead of taking up vertical space inline. Hosts the
 * {@link MarketerAnagrafica} editor in "bare" mode (no card chrome — the modal
 * provides the title/frame). Same edit gating as the inline card.
 *
 * Unsaved-changes guard: nothing nags while editing. A professional confirm dialog
 * appears ONLY when the user tries to close (backdrop / Esc / X) with pending
 * edits, so a stray click can't silently discard in-progress changes.
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
  const [dirty, setDirty] = React.useState(false);
  const [confirmClose, setConfirmClose] = React.useState(false);

  // Closing with unsaved edits → ask first (don't close yet). Otherwise close.
  function handleOpenChange(next: boolean) {
    if (next) {
      setOpen(true);
      return;
    }
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    setOpen(false);
  }

  function discardAndClose() {
    setDirty(false);
    setConfirmClose(false);
    setOpen(false);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <IdCard aria-hidden />
        {t('anagrafica_title')}
      </Button>

      <Modal
        open={open}
        onOpenChange={handleOpenChange}
        title={t('anagrafica_title')}
        description={t('anagrafica_subtitle')}
        size="xl"
      >
        <MarketerAnagrafica
          profile={profile}
          canEdit={canEdit}
          canEditIdentity={canEditIdentity}
          onDirtyChange={setDirty}
          bare
        />
      </Modal>

      {/* Unsaved-changes guard — shown only on a close attempt with pending edits. */}
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={t('discard_title')}
        description={t('discard_body')}
        confirmLabel={t('discard_confirm_btn')}
        cancelLabel={t('discard_keep_btn')}
        destructive
        onConfirm={discardAndClose}
      />
    </>
  );
}
