'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { useToast } from '@/components/crm/toaster';
import type { SevenWhys } from '@/lib/types/db';
import { deleteSevenWhysAction } from '@/app/(app)/sette-perche/actions';
import { SevenWhysEditor } from './seven-whys-editor';

/**
 * SevenWhysDetail — the client host for the /sette-perche/[id] page. Owns the
 * local record state so an in-place save/reset reflects immediately, renders the
 * focused {@link SevenWhysEditor} (its own action row, since this is not inside a
 * FormSheet) and — for the caller's OWN record only (write-own) — a "reset"
 * control + ConfirmDialog. For a downline's record `readOnly` is set and no
 * mutation affordance is shown (the editor renders static text).
 */
export interface SevenWhysDetailProps {
  record: SevenWhys | null;
  personName: string;
  readOnly: boolean;
  marketerId: string;
}

export function SevenWhysDetail({
  record: initialRecord,
  personName,
  readOnly,
}: SevenWhysDetailProps) {
  const t = useTranslations('sette_perche');
  const tc = useTranslations('crm');
  const { toast } = useToast();

  const [record, setRecord] = React.useState<SevenWhys | null>(initialRecord);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const hasStarted =
    record != null &&
    (Boolean(record.subject?.trim()) ||
      [
        record.why_1,
        record.why_2,
        record.why_3,
        record.why_4,
        record.why_5,
        record.why_6,
        record.why_7,
      ].some((w) => (w ?? '').trim().length > 0));

  const handleConfirmDelete = async () => {
    const res = await deleteSevenWhysAction();
    if (!res.ok) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    setRecord(null);
    toast({
      title: t('deleted'),
      description: res.demo ? t('deleted_demo') : undefined,
      variant: 'success',
    });
    setDeleteOpen(false);
  };

  return (
    <>
      <SevenWhysEditor
        record={record}
        personName={personName}
        readOnly={readOnly}
        onSaved={(saved) => setRecord(saved)}
      />

      {!readOnly && hasStarted && (
        <div className="flex justify-start">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDeleteOpen(true)}
            className="gap-2 text-danger hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {tc('delete')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('delete_title')}
        description={t('delete_body')}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        destructive
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
