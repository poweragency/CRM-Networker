'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSheet } from '@/components/crm/form-sheet';
import {
  CALL_OUTCOME_LABELS,
  CALL_OUTCOME_ORDER,
  CALL_TYPE_LABELS,
  CALL_TYPE_ORDER,
} from '@/lib/types/db';
import { ProspectPicker, type ProspectOption } from './prospect-picker';
import {
  type CallFormValues,
  toCallInput,
  toFormValues,
  zodCallResolver,
} from './call-form-schema';

/**
 * CallFormSheet — the "Registra chiamata" slide-over. Built on the shared
 * FormSheet + react-hook-form with a local zod resolver (full validation, no
 * extra deps). Captures type, outcome, duration (minutes), date/time, an optional
 * linked prospect (searchable picker) and notes. On submit it hands a normalized
 * CallInput to the parent, which performs the demo-safe Server Action and
 * prepends the row to the log.
 */

export interface CallFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prospect universe for the searchable link picker. */
  prospectOptions: ProspectOption[];
  /** Receives the normalized input; should perform the action + return a promise. */
  onSubmit: (input: ReturnType<typeof toCallInput>) => Promise<void>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-danger" role="alert">
      {message}
    </p>
  );
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

export function CallFormSheet({
  open,
  onOpenChange,
  prospectOptions,
  onSubmit,
}: CallFormSheetProps) {
  const t = useTranslations('chiamate');
  const tc = useTranslations('crm');

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CallFormValues>({
    resolver: zodCallResolver,
    defaultValues: toFormValues(),
  });

  // Reset (and re-stamp "now") each time the sheet opens.
  React.useEffect(() => {
    if (open) reset(toFormValues());
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(toCallInput(values));
  });

  const formId = React.useId();

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('create_title')}
      description={t('subtitle')}
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
            {isSubmitting ? tc('saving') : tc('save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        {/* Type + outcome */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-type`}>
              {t('type')} <span className="text-danger">*</span>
            </Label>
            <select
              id={`${formId}-type`}
              className={selectClass}
              aria-invalid={Boolean(errors.call_type)}
              {...register('call_type')}
            >
              {CALL_TYPE_ORDER.map((v) => (
                <option key={v} value={v}>
                  {CALL_TYPE_LABELS[v]}
                </option>
              ))}
            </select>
            <FieldError message={errors.call_type?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-outcome`}>
              {t('outcome')} <span className="text-danger">*</span>
            </Label>
            <select
              id={`${formId}-outcome`}
              className={selectClass}
              aria-invalid={Boolean(errors.outcome)}
              {...register('outcome')}
            >
              {CALL_OUTCOME_ORDER.map((v) => (
                <option key={v} value={v}>
                  {CALL_OUTCOME_LABELS[v]}
                </option>
              ))}
            </select>
            <FieldError message={errors.outcome?.message} />
          </div>
        </div>

        {/* Duration + date */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-duration`}>{t('duration_minutes')}</Label>
            <Input
              id={`${formId}-duration`}
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              step={1}
              placeholder="0"
              aria-invalid={Boolean(errors.duration_minutes)}
              {...register('duration_minutes')}
            />
            <FieldError message={errors.duration_minutes?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-occurred`}>
              {t('occurred_at')} <span className="text-danger">*</span>
            </Label>
            <Input
              id={`${formId}-occurred`}
              type="datetime-local"
              aria-invalid={Boolean(errors.occurred_at)}
              {...register('occurred_at')}
            />
            <FieldError message={errors.occurred_at?.message} />
          </div>
        </div>

        {/* Link to a prospect (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-prospect`}>{t('link_section')}</Label>
          <Controller
            control={control}
            name="prospect_id"
            render={({ field }) => (
              <ProspectPicker
                id={`${formId}-prospect`}
                options={prospectOptions}
                value={field.value ?? null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
          <p className="text-xs text-muted-foreground">{t('link_help')}</p>
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
