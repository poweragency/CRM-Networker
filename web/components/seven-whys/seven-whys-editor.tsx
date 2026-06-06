'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Info, Lock, Save, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import { WHY_KEYS, type SevenWhys, type WhyKey } from '@/lib/types/db';
import type { SevenWhysInput } from '@/lib/data/seven-whys';
import { saveSevenWhysAction } from '@/app/(app)/sette-perche/actions';
import { UnsavedBar } from '@/components/crm/unsaved-bar';
import { SevenWhysStepper } from './seven-whys-stepper';
import { WhyProgress } from './why-progress';

/**
 * SevenWhysEditor — the focused editor around one marketer's Sette Perché:
 * subject headline + the guided 7-why stepper. Owns the local draft state and
 * commits via the demo-safe `saveSevenWhysAction` (write-own). When `readOnly`
 * (an upline viewing a downline) it renders the stepper as static text, hides
 * the save bar and shows a read-only notice. The save bar is sticky-friendly:
 * pass `embedded` when hosting it inside a FormSheet (which supplies its own
 * footer); otherwise the component renders its own action row.
 */

export interface SevenWhysEditorProps {
  /** The existing record, or null when not started yet. */
  record: SevenWhys | null;
  /** Whose record this is (display only). */
  personName: string;
  /** Read-only when the caller is not the owner. */
  readOnly?: boolean;
  /** Hide the internal action row (the host, e.g. FormSheet, provides one). */
  embedded?: boolean;
  /** Receives the saved record (so the parent can patch its list/state). */
  onSaved?: (record: SevenWhys, demo: boolean) => void;
  /** Expose busy state to a host footer (FormSheet). */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

/** Imperative handle so a FormSheet footer button can trigger save. */
export interface SevenWhysEditorHandle {
  save: () => Promise<void>;
  isDirty: () => boolean;
}

function valuesFromRecord(record: SevenWhys | null): string[] {
  return WHY_KEYS.map((k) => record?.[k] ?? '');
}

export const SevenWhysEditor = React.forwardRef<
  SevenWhysEditorHandle,
  SevenWhysEditorProps
>(function SevenWhysEditor(
  {
    record,
    personName,
    readOnly = false,
    embedded = false,
    onSaved,
    onBusyChange,
    className,
  },
  ref,
) {
  const t = useTranslations('sette_perche');
  const tc = useTranslations('crm');
  const { toast } = useToast();

  const [subject, setSubject] = React.useState(record?.subject ?? '');
  const [values, setValues] = React.useState<string[]>(
    valuesFromRecord(record),
  );
  const [primaryIndex, setPrimaryIndex] = React.useState<number | null>(
    record?.primary_why_index ?? null,
  );
  const [busy, setBusy] = React.useState(false);

  // Re-seed when the target record changes (e.g. switching person in a sheet).
  React.useEffect(() => {
    setSubject(record?.subject ?? '');
    setValues(valuesFromRecord(record));
    setPrimaryIndex(record?.primary_why_index ?? null);
  }, [record]);

  const baseline = React.useMemo(
    () => ({
      subject: record?.subject ?? '',
      values: valuesFromRecord(record),
      primary: record?.primary_why_index ?? null,
    }),
    [record],
  );

  const dirty =
    subject !== baseline.subject ||
    primaryIndex !== baseline.primary ||
    values.some((v, i) => v !== baseline.values[i]);

  const filled = values.filter((v) => v.trim().length > 0).length;

  const setBusyBoth = React.useCallback(
    (b: boolean) => {
      setBusy(b);
      onBusyChange?.(b);
    },
    [onBusyChange],
  );

  const handleValueChange = (index: number, value: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    // If the slot flagged primary is cleared, drop the primary flag.
    if (primaryIndex === index + 1 && !value.trim()) setPrimaryIndex(null);
  };

  const save = React.useCallback(async () => {
    if (readOnly || busy) return;
    setBusyBoth(true);
    try {
      // Send empty strings (not null) for cleared slots: the data layer's
      // `?? existing` merge treats null as "keep", so '' is how we persist a
      // cleared value while non-empty whys overwrite.
      const whyPatch = WHY_KEYS.reduce<Partial<Record<WhyKey, string>>>(
        (acc, key, i) => {
          acc[key] = values[i]?.trim() ?? '';
          return acc;
        },
        {},
      );
      const input: SevenWhysInput = {
        subject: subject.trim(),
        primary_why_index: primaryIndex,
        ...whyPatch,
      };
      const res = await saveSevenWhysAction(input);
      if (!res.ok || !res.record) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      onSaved?.(res.record, res.demo);
      toast({
        title: t('saved'),
        description: res.demo ? t('saved_demo') : undefined,
        variant: 'success',
      });
    } finally {
      setBusyBoth(false);
    }
  }, [
    readOnly,
    busy,
    values,
    subject,
    primaryIndex,
    onSaved,
    setBusyBoth,
    toast,
    t,
    tc,
  ]);

  React.useImperativeHandle(ref, () => ({ save, isDirty: () => dirty }), [
    save,
    dirty,
  ]);

  return (
    <div className={cn('space-y-5', className)}>
      {readOnly ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm"
          role="status"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            {t('read_only_notice', { name: personName })}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] px-3.5 py-2.5 text-sm">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="text-muted-foreground">{t('stepper_intro')}</span>
        </div>
      )}

      {/* Subject headline */}
      <div className="space-y-1.5">
        <Label htmlFor="sw-subject">{t('subject')}</Label>
        {readOnly ? (
          <p className="text-sm font-medium text-foreground">
            {subject.trim() || (
              <span className="italic text-muted-foreground">
                {t('no_subject')}
              </span>
            )}
          </p>
        ) : (
          <>
            <Input
              id="sw-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('subject_placeholder')}
              maxLength={160}
            />
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" aria-hidden />
              {t('subject_help')}
            </p>
          </>
        )}
      </div>

      {/* Progress strip */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <WhyProgress filled={filled} size={48} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {t('completion', { filled })}
          </p>
          <p className="text-xs text-muted-foreground">{t('intro')}</p>
        </div>
      </div>

      {/* The guided ladder */}
      <SevenWhysStepper
        values={values}
        onChange={handleValueChange}
        primaryIndex={primaryIndex}
        onPrimaryChange={setPrimaryIndex}
        readOnly={readOnly}
      />

      {/* Internal action row (omitted when embedded in a FormSheet footer) */}
      {!readOnly && !embedded && (
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="gap-2"
          >
            <Save className="h-4 w-4" aria-hidden />
            {busy ? tc('saving') : t('save')}
          </Button>
        </div>
      )}

      {!readOnly && !embedded && (
        <UnsavedBar dirty={dirty} saving={busy} onSave={save} />
      )}
    </div>
  );
});
