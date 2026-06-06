'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { StatusPill } from '@/components/crm/status-pill';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import {
  STAGE_LABELS,
  STAGE_ORDER,
  STARTING_PACKAGE_LABELS,
  STARTING_PACKAGE_ORDER,
  stageIndex,
  type Prospect,
  type ProspectStage,
  type StartingPackage,
} from '@/lib/types/db';
import type { ProspectExtra } from '@/lib/data/prospect-extras';
import {
  changeStageAction,
  saveProspectExtraAction,
} from '@/app/(app)/percorso-prospect/actions';
import { UnsavedBar } from '@/components/crm/unsaved-bar';
import { stageTokens } from './stage-tokens';

/**
 * ProspectDetail — the client detail for /percorso-prospect/[id]. The funnel is
 * the control: clicking a phase stages it locally, "Salva fase" commits the
 * change via the server action (no separate "Cambia fase" button). Below, an
 * editable block captures profilazione (large free text), pacchetto scelto and
 * note. Replaces the old stage-history timeline + calls panels.
 */

const fieldCx =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export interface ProspectDetailProps {
  prospect: Prospect;
  extra: ProspectExtra;
}

export function ProspectDetail({ prospect, extra }: ProspectDetailProps) {
  const t = useTranslations('prospect');
  const tc = useTranslations('crm');
  const router = useRouter();
  const { toast } = useToast();

  // Stage: server value + the locally-selected (unsaved) target.
  const [savedStage, setSavedStage] = React.useState<ProspectStage>(
    prospect.current_stage,
  );
  const [stage, setStage] = React.useState<ProspectStage>(prospect.current_stage);
  const [savingStage, setSavingStage] = React.useState(false);

  // Extras.
  const [profiling, setProfiling] = React.useState(extra.profiling ?? '');
  const [pack, setPack] = React.useState<StartingPackage | ''>(extra.pack ?? '');
  const [notes, setNotes] = React.useState(extra.notes ?? '');
  const [savedExtra, setSavedExtra] = React.useState<ProspectExtra>(extra);
  const [savingExtra, setSavingExtra] = React.useState(false);

  const stageDirty = stage !== savedStage;
  const extraDirty =
    (profiling.trim() || null) !== (savedExtra.profiling ?? null) ||
    (pack || null) !== (savedExtra.pack ?? null) ||
    (notes.trim() || null) !== (savedExtra.notes ?? null);

  const currentIdx = stageIndex(stage);

  async function saveStage() {
    if (!stageDirty) return;
    setSavingStage(true);
    const res = await changeStageAction(prospect.id, stage);
    setSavingStage(false);
    if (!res.ok) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      setStage(savedStage);
      return;
    }
    setSavedStage(stage);
    toast({
      title: stage === 'iscrizione' ? t('enrolled_toast') : t('stage_changed'),
      description: res.demo ? tc('saved_demo') : undefined,
      variant: 'success',
    });
    if (!res.demo) router.refresh();
  }

  async function saveExtra() {
    setSavingExtra(true);
    const next: ProspectExtra = {
      profiling: profiling.trim() || null,
      pack: pack || null,
      notes: notes.trim() || null,
    };
    const res = await saveProspectExtraAction(prospect.id, next);
    setSavingExtra(false);
    if (!res.ok) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    setSavedExtra(next);
    toast({
      title: t('details_saved'),
      description: res.demo ? tc('saved_demo') : undefined,
      variant: 'success',
    });
  }

  // Save whatever is pending (stage and/or details) from the unsaved-changes bar.
  async function saveAll() {
    if (stageDirty) await saveStage();
    if (extraDirty) await saveExtra();
  }

  return (
    <div className="space-y-5">
      {/* Funnel control card */}
      <Card className="relative overflow-hidden shadow-card">
        <span
          aria-hidden
          className={cn('absolute inset-x-0 top-0 h-1', stageTokens(stage).bg)}
        />
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill kind="stage" value={stage} />
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('phase_of', { idx: currentIdx })}
              </span>
            </div>
            <Button
              onClick={saveStage}
              disabled={!stageDirty || savingStage}
              size="sm"
              className={cn(stageDirty && !savingStage && 'shadow-glow')}
            >
              {savingStage ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}
              {savingStage ? tc('saving') : t('save_stage')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t('funnel_hint')}</p>

          {/* Clickable funnel */}
          <ol className="flex items-center gap-1.5" aria-label={t('title')}>
            {STAGE_ORDER.map((s, i) => {
              const idx = i + 1;
              const done = idx < currentIdx;
              const active = idx === currentIdx;
              const tok = stageTokens(s);
              return (
                <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStage(s)}
                    aria-pressed={active}
                    className="group/step flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-lg p-1.5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ring-1 ring-inset transition-all duration-base group-hover/step:scale-105',
                        done && 'bg-success/15 text-success ring-success/30',
                        active &&
                          cn(
                            tok.bg,
                            'text-primary-foreground shadow-sm ring-transparent',
                          ),
                        !done &&
                          !active &&
                          'bg-muted text-muted-foreground ring-border/60',
                      )}
                      aria-hidden
                    >
                      {done ? <Check className="h-4 w-4" /> : idx}
                    </span>
                    <span
                      className={cn(
                        'hidden truncate text-[11px] font-medium sm:block',
                        active
                          ? tok.text
                          : done
                            ? 'text-foreground/70'
                            : 'text-muted-foreground',
                      )}
                    >
                      {STAGE_LABELS[s]}
                    </span>
                  </button>
                  {i < STAGE_ORDER.length - 1 && (
                    <span
                      className={cn(
                        'h-0.5 flex-1 rounded-full',
                        idx < currentIdx ? 'bg-success/50' : 'bg-border',
                      )}
                      aria-hidden
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Editable details: profilazione, pacchetto, note */}
      <Card className="shadow-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {t('details_title')}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={saveExtra}
              disabled={!extraDirty || savingExtra}
            >
              {savingExtra ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}
              {savingExtra ? tc('saving') : tc('save')}
            </Button>
          </div>

          <Separator />

          {/* Profilazione — large free text */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-profiling">{t('profiling')}</Label>
            <textarea
              id="pf-profiling"
              rows={6}
              value={profiling}
              onChange={(e) => setProfiling(e.target.value)}
              placeholder={t('profiling_ph')}
              className={cn(fieldCx, 'resize-y')}
            />
          </div>

          {/* Pacchetto scelto */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-pack">{t('pack')}</Label>
            <select
              id="pf-pack"
              value={pack}
              onChange={(e) => setPack(e.target.value as StartingPackage | '')}
              className={cn(fieldCx, 'h-9 cursor-pointer py-1')}
            >
              <option value="">{t('pack_none')}</option>
              {STARTING_PACKAGE_ORDER.map((p) => (
                <option key={p} value={p}>
                  {STARTING_PACKAGE_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-notes">{t('notes')}</Label>
            <textarea
              id="pf-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tc('notes_placeholder')}
              className={cn(fieldCx, 'resize-y')}
            />
          </div>
        </CardContent>
      </Card>

      <UnsavedBar
        dirty={stageDirty || extraDirty}
        saving={savingStage || savingExtra}
        onSave={saveAll}
      />
    </div>
  );
}
