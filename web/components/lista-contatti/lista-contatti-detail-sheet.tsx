'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Users2, Thermometer, CircleDot, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { FormSheet } from '@/components/crm/form-sheet';
import { StatusPill } from '@/components/crm/status-pill';
import type { ListaContattiEntry } from '@/lib/types/db';

/**
 * ListaContattiDetailSheet — a read view of a single Lista contatti entry in a slide-over:
 * identity, stato + rapporto, chi è, notes and created date. The footer exposes
 * Edit + Delete; rapporto and stato are changed inline in the list or via the
 * edit form. Pure presentation; all mutations stay in the page container.
 */

export interface ListaContattiDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ListaContattiEntry | null;
  onEdit: (entry: ListaContattiEntry) => void;
  onDelete: (entry: ListaContattiEntry) => void;
  /** disables the action buttons while a mutation is in flight. */
  busy?: boolean;
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

function DetailRow({ icon, label, children }: RowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:h-4 [&_svg]:w-4"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function ListaContattiDetailSheet({
  open,
  onOpenChange,
  entry,
  onEdit,
  onDelete,
  busy,
}: ListaContattiDetailSheetProps) {
  const t = useTranslations('listaContatti');
  const tc = useTranslations('crm');

  if (!entry) {
    // Keep the sheet controlled even with no selection (avoids null footer flash).
    return (
      <FormSheet open={open} onOpenChange={onOpenChange} title={tc('details')}>
        {null}
      </FormSheet>
    );
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={tc('details')}
      size="md"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onEdit(entry)}
            className="gap-2"
            disabled={busy}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {tc('edit')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onDelete(entry)}
            className="gap-2"
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {tc('delete')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <Avatar name={entry.full_name} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                #{entry.position}
              </span>
              <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {entry.full_name}
              </h3>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusPill kind="lista_contatti" value={entry.stato} />
              {entry.rapporto && (
                <StatusPill kind="lista_contatti_rapporto" value={entry.rapporto} />
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Details */}
        <div className="divide-y divide-border">
          <DetailRow icon={<Users2 />} label={t('relationship')}>
            {entry.relationship ? (
              <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {entry.relationship}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          <DetailRow icon={<Thermometer />} label={t('form_rapporto')}>
            {entry.rapporto ? (
              <StatusPill kind="lista_contatti_rapporto" value={entry.rapporto} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          <DetailRow icon={<CircleDot />} label={t('form_stato')}>
            <StatusPill kind="lista_contatti" value={entry.stato} />
          </DetailRow>
        </div>

        {/* Notes */}
        {entry.notes && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('notes')}</p>
              <p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 text-sm text-foreground [overflow-wrap:anywhere]">
                {entry.notes}
              </p>
            </div>
          </>
        )}

        <p className="pt-1 text-xs text-muted-foreground">
          {tc('created_at')} {formatDate(entry.created_at)}
        </p>
      </div>
    </FormSheet>
  );
}
