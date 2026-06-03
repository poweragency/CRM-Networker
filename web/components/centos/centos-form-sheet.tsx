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
  CENTOS_RAPPORTO_LABELS,
  CENTOS_RAPPORTO_ORDER,
  CENTOS_STATUS_LABELS,
  CENTOS_STATUS_ORDER,
  type CentosEntry,
} from '@/lib/types/db';
import {
  type CentosFormValues,
  toCentosInput,
  toFormValues,
  zodCentosResolver,
} from './centos-form-schema';

/**
 * CentosFormSheet — the create/edit slide-over for a Centos entry. Built on the
 * shared FormSheet + react-hook-form with a local zod resolver (full validation,
 * no extra deps). On submit it hands a normalized CentosInput to the parent,
 * which performs the demo-safe Server Action and patches list state. Used for
 * both "Aggiungi nome" (no `entry`) and "Modifica nome" (with `entry`). Fields:
 * nome, chi è, rapporto + stato (a tendina) e note.
 */

const selectCx =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export interface CentosFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing entry to edit; omit/undefined for create. */
  entry?: CentosEntry | null;
  /** Receives the normalized input; should perform the action + return a promise. */
  onSubmit: (input: ReturnType<typeof toCentosInput>) => Promise<void>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-danger" role="alert">
      {message}
    </p>
  );
}

export function CentosFormSheet({
  open,
  onOpenChange,
  entry,
  onSubmit,
}: CentosFormSheetProps) {
  const t = useTranslations('centos');
  const tc = useTranslations('crm');
  const isEdit = Boolean(entry);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CentosFormValues>({
    resolver: zodCentosResolver,
    defaultValues: toFormValues(entry),
  });

  // Reset whenever the target entry (or open state) changes so the sheet shows
  // the right values for create vs edit.
  React.useEffect(() => {
    if (open) reset(toFormValues(entry));
  }, [open, entry, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(toCentosInput(values));
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
            rows={5}
            className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            placeholder={t('relationship_placeholder')}
            aria-invalid={Boolean(errors.relationship)}
            {...register('relationship')}
          />
          <FieldError message={errors.relationship?.message} />
        </div>

        {/* Rapporto + Stato (a tendina) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-rapporto`}>{t('form_rapporto')}</Label>
            <select
              id={`${formId}-rapporto`}
              className={selectCx}
              {...register('rapporto')}
            >
              <option value="">{t('rapporto_none')}</option>
              {CENTOS_RAPPORTO_ORDER.map((r) => (
                <option key={r} value={r}>
                  {CENTOS_RAPPORTO_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-stato`}>{t('form_stato')}</Label>
            <select
              id={`${formId}-stato`}
              className={selectCx}
              {...register('stato')}
            >
              {CENTOS_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {CENTOS_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-notes`}>{t('notes')}</Label>
          <textarea
            id={`${formId}-notes`}
            rows={4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            placeholder={tc('notes_placeholder')}
            {...register('notes')}
          />
          <FieldError message={errors.notes?.message} />
        </div>
      </form>
    </FormSheet>
  );
}
