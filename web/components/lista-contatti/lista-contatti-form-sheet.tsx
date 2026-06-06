'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSheet } from '@/components/crm/form-sheet';
import {
  LISTA_CONTATTI_RAPPORTO_LABELS,
  LISTA_CONTATTI_RAPPORTO_ORDER,
  LISTA_CONTATTI_STATUS_LABELS,
  LISTA_CONTATTI_STATUS_ORDER,
  type ListaContattiEntry,
} from '@/lib/types/db';
import {
  type ListaContattiFormValues,
  toListaContattiInput,
  toFormValues,
  zodListaContattiResolver,
} from './lista-contatti-form-schema';

/**
 * ListaContattiFormSheet — the create/edit slide-over for a Lista contatti entry. Built on the
 * shared FormSheet + react-hook-form with a local zod resolver (full validation,
 * no extra deps). On submit it hands a normalized ListaContattiInput to the parent,
 * which performs the demo-safe Server Action and patches list state. Used for
 * both "Aggiungi nome" (no `entry`) and "Modifica nome" (with `entry`). Fields:
 * nome, chi è, rapporto + stato (a tendina) e note.
 */

const selectCx =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export interface ListaContattiFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing entry to edit; omit/undefined for create. */
  entry?: ListaContattiEntry | null;
  /** Receives the normalized input; should perform the action + return a promise. */
  onSubmit: (input: ReturnType<typeof toListaContattiInput>) => Promise<void>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-danger" role="alert">
      {message}
    </p>
  );
}

export function ListaContattiFormSheet({
  open,
  onOpenChange,
  entry,
  onSubmit,
}: ListaContattiFormSheetProps) {
  const t = useTranslations('listaContatti');
  const tc = useTranslations('crm');
  const isEdit = Boolean(entry);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ListaContattiFormValues>({
    resolver: zodListaContattiResolver,
    defaultValues: toFormValues(entry),
  });

  // Auto-grow the free-text areas so a long "Chi è" expands instead of scrolling
  // inside a fixed box (hard to read).
  const relationshipRef = React.useRef<HTMLTextAreaElement | null>(null);
  const notesRef = React.useRef<HTMLTextAreaElement | null>(null);
  const autosize = React.useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  const relationshipReg = register('relationship');
  const notesReg = register('notes');

  // Reset whenever the target entry (or open state) changes so the sheet shows
  // the right values for create vs edit, then re-fit the textareas to content.
  React.useEffect(() => {
    if (!open) return;
    reset(toFormValues(entry));
    requestAnimationFrame(() => {
      autosize(relationshipRef.current);
      autosize(notesRef.current);
    });
  }, [open, entry, reset, autosize]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(toListaContattiInput(values));
  });

  const formId = React.useId();

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('edit_title') : t('create_title')}
      description={isEdit ? undefined : t('subtitle')}
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {tc('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isSubmitting}
            className={cn(isSubmitting && 'opacity-80')}
          >
            {isSubmitting ? tc('saving') : isEdit ? tc('save') : tc('create')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-name`}>
            {t('full_name')} <span className="text-danger">*</span>
          </Label>
          <Input
            id={`${formId}-name`}
            autoComplete="name"
            aria-invalid={Boolean(errors.full_name)}
            {...register('full_name')}
          />
          <FieldError message={errors.full_name?.message} />
        </div>

        {/* Chi è — a large free-text description */}
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-relationship`}>{t('relationship')}</Label>
          <textarea
            id={`${formId}-relationship`}
            rows={3}
            placeholder={t('relationship_placeholder')}
            aria-invalid={Boolean(errors.relationship)}
            {...relationshipReg}
            ref={(el) => {
              relationshipReg.ref(el);
              relationshipRef.current = el;
            }}
            onInput={(e) => autosize(e.currentTarget)}
            className="flex min-h-[5rem] w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <FieldError message={errors.relationship?.message} />
        </div>

        {/* Rapporto (sempre) + Stato (solo in modifica). In fase di creazione la
            lista resta snella: lo stato parte da "non invitato" e le note si
            aggiungono dopo, dalla modifica. */}
        <div className={cn('grid grid-cols-1 gap-4', isEdit && 'sm:grid-cols-2')}>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-rapporto`}>{t('form_rapporto')}</Label>
            <select
              id={`${formId}-rapporto`}
              className={selectCx}
              {...register('rapporto')}
            >
              <option value="">{t('rapporto_none')}</option>
              {LISTA_CONTATTI_RAPPORTO_ORDER.map((r) => (
                <option key={r} value={r}>
                  {LISTA_CONTATTI_RAPPORTO_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-stato`}>{t('form_stato')}</Label>
              <select
                id={`${formId}-stato`}
                className={selectCx}
                {...register('stato')}
              >
                {LISTA_CONTATTI_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {LISTA_CONTATTI_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Notes — solo in modifica */}
        {isEdit && (
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-notes`}>{t('notes')}</Label>
            <textarea
              id={`${formId}-notes`}
              rows={3}
              placeholder={tc('notes_placeholder')}
              {...notesReg}
              ref={(el) => {
                notesReg.ref(el);
                notesRef.current = el;
              }}
              onInput={(e) => autosize(e.currentTarget)}
              className="flex min-h-[4.5rem] w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <FieldError message={errors.notes?.message} />
          </div>
        )}
      </form>
    </FormSheet>
  );
}
