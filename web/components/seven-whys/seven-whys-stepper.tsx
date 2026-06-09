'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, Check, Lock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { WHY_STEPS, whyOrdinal } from './why-prompts';

/**
 * SevenWhysStepper — the guided vertical ladder of Why 1..7. Each why is a step
 * connected to the next by a "builds-on" arrow, with its ordinal label, a helper
 * prompt and a textarea. The methodology is progressive: a step is LOCKED (read-
 * only, dimmed) until the previous why has text, so the user is nudged to dig one
 * level at a time. Any step can be flagged the "perché principale" (single
 * select). Fully controlled; in read-only mode (an upline viewing a downline's
 * record) inputs render as static text and the lock/primary affordances hide.
 */

export interface SevenWhysStepperProps {
  /** Current text per slot, indexed 0..6 (parallel to WHY_STEPS). */
  values: string[];
  onChange: (index: number, value: string) => void;
  /** 1..7 primary why, or null. */
  primaryIndex: number | null;
  onPrimaryChange: (index: number | null) => void;
  /** Read-only (upline viewing a downline) — no inputs, no editing affordances. */
  readOnly?: boolean;
  className?: string;
}

export function SevenWhysStepper({
  values,
  onChange,
  primaryIndex,
  onPrimaryChange,
  readOnly = false,
  className,
}: SevenWhysStepperProps) {
  const t = useTranslations('sette_perche');

  const isFilled = (i: number) => (values[i] ?? '').trim().length > 0;

  return (
    <ol className={cn('relative space-y-0', className)}>
      {WHY_STEPS.map((step, i) => {
        const prevFilled = i === 0 || isFilled(i - 1);
        const filled = isFilled(i);
        // In edit mode a step unlocks once the previous one has content; the very
        // first is always open. Read-only shows everything (no gating).
        const locked = !readOnly && !prevFilled;
        const isPrimary = primaryIndex === step.index;
        const isLast = i === WHY_STEPS.length - 1;
        const fieldId = `why-${step.index}`;

        return (
          <li key={step.key} className="relative pb-1">
            <div className="flex gap-3 sm:gap-4">
              {/* Rail: numbered node + connector line */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums transition-colors',
                    filled
                      ? 'border-transparent bg-gradient-to-br from-primary to-primary text-primary-foreground'
                      : locked
                        ? 'border-dashed border-border bg-muted text-muted-foreground'
                        : 'border-border bg-background text-foreground',
                  )}
                  aria-hidden
                >
                  {filled ? <Check className="h-4 w-4" /> : step.index}
                </span>
                {!isLast && (
                  <span
                    className={cn(
                      'mt-1 w-px flex-1 transition-colors',
                      filled ? 'bg-primary/40' : 'bg-border',
                    )}
                    aria-hidden
                  />
                )}
              </div>

              {/* Step body */}
              <div
                className={cn(
                  'min-w-0 flex-1 rounded-lg border p-3.5 transition-colors sm:p-4',
                  isPrimary
                    ? 'border-primary/50 bg-primary/[0.04] ring-1 ring-primary/30'
                    : 'border-border bg-card',
                  locked && 'opacity-60',
                  !isLast && 'mb-3',
                )}
              >
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label
                        htmlFor={readOnly ? undefined : fieldId}
                        className="text-sm font-semibold text-foreground"
                      >
                        {whyOrdinal(step.index)}
                      </Label>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t('why_step', { n: step.index })}
                      </span>
                      {isPrimary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Star className="h-3 w-3 fill-current" aria-hidden />
                          {t('is_primary')}
                        </span>
                      )}
                    </div>
                    {i > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
                        {t('builds_on')}
                      </p>
                    )}
                  </div>

                  {/* Primary toggle (own/editable records only) */}
                  {!readOnly && filled && (
                    <button
                      type="button"
                      onClick={() =>
                        onPrimaryChange(isPrimary ? null : step.index)
                      }
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isPrimary
                          ? 'text-primary hover:bg-primary/10'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      aria-pressed={isPrimary}
                      title={isPrimary ? t('primary_marked') : t('set_primary')}
                    >
                      <Star
                        className={cn('h-3.5 w-3.5', isPrimary && 'fill-current')}
                        aria-hidden
                      />
                      <span className="hidden sm:inline">
                        {isPrimary ? t('is_primary') : t('set_primary')}
                      </span>
                    </button>
                  )}
                </div>

                {/* Helper prompt */}
                <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                  {t(step.helpKey)}
                </p>

                {/* Value: textarea (edit) or static text (read-only) */}
                {readOnly ? (
                  filled ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {values[i]}
                    </p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      {t('not_started')}
                    </p>
                  )
                ) : locked ? (
                  <p className="flex items-center gap-1.5 text-xs italic text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t('locked_hint')}
                  </p>
                ) : (
                  <textarea
                    id={fieldId}
                    rows={2}
                    value={values[i] ?? ''}
                    onChange={(e) => onChange(i, e.target.value)}
                    placeholder={t('why_placeholder')}
                    className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
