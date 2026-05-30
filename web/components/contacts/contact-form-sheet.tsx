'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSheet } from '@/components/crm/form-sheet';
import { TagInput } from '@/components/crm/tag-input';
import {
  CONTACT_SOURCE_LABELS,
  CONTACT_SOURCE_ORDER,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUS_ORDER,
  type Contact,
} from '@/lib/types/db';
import {
  type ContactFormValues,
  toContactInput,
  toFormValues,
  zodContactResolver,
} from './contact-form-schema';

/**
 * ContactFormSheet — the create/edit slide-over for a contact. Built on the
 * shared FormSheet + react-hook-form with a local zod resolver (full validation,
 * no extra deps). On submit it hands a normalized ContactInput to the parent,
 * which performs the demo-safe Server Action and updates list state. Used for
 * both "Nuovo contatto" (no `contact`) and "Modifica contatto" (with `contact`).
 */

export interface ContactFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing contact to edit; omit/undefined for create. */
  contact?: Contact | null;
  /** Tag suggestions from the existing tag universe. */
  tagSuggestions?: string[];
  /** Receives the normalized input; should perform the action + return a promise. */
  onSubmit: (input: ReturnType<typeof toContactInput>) => Promise<void>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-danger" role="alert">
      {message}
    </p>
  );
}

export function ContactFormSheet({
  open,
  onOpenChange,
  contact,
  tagSuggestions,
  onSubmit,
}: ContactFormSheetProps) {
  const t = useTranslations('contatti');
  const tc = useTranslations('crm');
  const isEdit = Boolean(contact);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodContactResolver,
    defaultValues: toFormValues(contact),
  });

  // Reset the form whenever the target contact (or open state) changes so the
  // sheet shows the right values for create vs edit.
  React.useEffect(() => {
    if (open) reset(toFormValues(contact));
  }, [open, contact, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(toContactInput(values));
  });

  const formId = React.useId();

  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

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
        {/* Name row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-first`}>
              {t('first_name')} <span className="text-danger">*</span>
            </Label>
            <Input
              id={`${formId}-first`}
              autoComplete="given-name"
              aria-invalid={Boolean(errors.first_name)}
              {...register('first_name')}
            />
            <FieldError message={errors.first_name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-last`}>{t('last_name')}</Label>
            <Input
              id={`${formId}-last`}
              autoComplete="family-name"
              aria-invalid={Boolean(errors.last_name)}
              {...register('last_name')}
            />
            <FieldError message={errors.last_name?.message} />
          </div>
        </div>

        {/* Contact channels */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-email`}>{t('email')}</Label>
            <Input
              id={`${formId}-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nome@esempio.it"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-phone`}>{t('phone')}</Label>
            <Input
              id={`${formId}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+39 …"
              aria-invalid={Boolean(errors.phone)}
              {...register('phone')}
            />
            <FieldError message={errors.phone?.message} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-city`}>{t('city')}</Label>
          <Input id={`${formId}-city`} autoComplete="address-level2" {...register('city')} />
          <FieldError message={errors.city?.message} />
        </div>

        {/* Status + source */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-status`}>{t('status')}</Label>
            <select
              id={`${formId}-status`}
              className={selectClass}
              {...register('status')}
            >
              {CONTACT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {CONTACT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-source`}>{t('source')}</Label>
            <select
              id={`${formId}-source`}
              className={selectClass}
              {...register('source')}
            >
              {CONTACT_SOURCE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {CONTACT_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Follow-up */}
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-followup`}>{t('next_follow_up')}</Label>
          <Input
            id={`${formId}-followup`}
            type="datetime-local"
            {...register('next_follow_up_at')}
          />
        </div>

        {/* Tags */}
        <div className="space-y-1.5">
          <Label>{t('tags')}</Label>
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                placeholder={t('tags_placeholder')}
                suggestions={tagSuggestions}
              />
            )}
          />
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
