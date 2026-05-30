'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  HelpCircle,
  Pencil,
  Plus,
  Star,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/crm/page-header';
import { FormSheet } from '@/components/crm/form-sheet';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { ConfigNotice } from '@/components/config-notice';
import type { SevenWhys } from '@/lib/types/db';
import {
  filledCount,
  type SevenWhysRosterRow,
} from '@/lib/data/seven-whys-shared';
import { deleteSevenWhysAction } from '@/app/(app)/sette-perche/actions';
import {
  SevenWhysEditor,
  type SevenWhysEditorHandle,
} from './seven-whys-editor';
import { WhyProgress } from './why-progress';
import { PersonCard } from './person-card';

/**
 * SevenWhysManager — the full client container for /sette-perche. The RSC page
 * fetches the roster (the caller's own record + every visible downline record)
 * through the demo-safe data layer and hands it in; everything interactive lives
 * here:
 *
 *  - a hero "I miei Sette Perché" card with completion ring + a CTA that opens
 *    the focused editor slide-over (write-own);
 *  - the team roster grid — each downline card is read-only and navigates to the
 *    /sette-perche/[id] review route;
 *  - the editor slide-over (FormSheet) hosting the guided stepper, committing via
 *    the demo-safe Server Action; and a "reset" ConfirmDialog (write-own only).
 *
 * Demo-safe throughout: mutations return simulated results, we patch local state
 * optimistically and raise the right toast; nothing throws.
 */

export interface SevenWhysManagerProps {
  initialRows: SevenWhysRosterRow[];
  initialDemo: boolean;
}

export function SevenWhysManager({
  initialRows,
  initialDemo,
}: SevenWhysManagerProps) {
  const t = useTranslations('sette_perche');
  const tc = useTranslations('crm');
  const router = useRouter();
  const { toast } = useToast();

  const [rows, setRows] = React.useState<SevenWhysRosterRow[]>(initialRows);
  const [demo, setDemo] = React.useState(initialDemo);

  const self = React.useMemo(() => rows.find((r) => r.is_self) ?? null, [rows]);
  const team = React.useMemo(() => rows.filter((r) => !r.is_self), [rows]);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const editorRef = React.useRef<SevenWhysEditorHandle>(null);

  const cardLabels = {
    you: t('you'),
    notStarted: t('not_started'),
    noSubject: t('no_subject'),
    readOnly: t('read_only_badge'),
  };

  // Patch the self row in local state after a save.
  const handleSaved = (record: SevenWhys, savedDemo: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.is_self
          ? { ...r, record, filled: filledCount(record) }
          : r,
      ),
    );
    setDemo((d) => d || savedDemo);
    setEditorOpen(false);
  };

  const handleConfirmDelete = async () => {
    setBusy(true);
    try {
      const res = await deleteSevenWhysAction();
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.is_self ? { ...r, record: null, filled: 0 } : r,
        ),
      );
      setDemo((d) => d || res.demo);
      toast({
        title: t('deleted'),
        description: res.demo ? t('deleted_demo') : undefined,
        variant: 'success',
      });
      setEditorOpen(false);
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  };

  const selfFilled = self ? self.filled : 0;
  const selfSubject = self?.record?.subject?.trim();
  const selfPrimary = self?.record?.primary_why_index ?? null;
  const hasStarted = selfFilled > 0 || Boolean(selfSubject);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={<HelpCircle />}
        breadcrumbs={[{ label: tc('section') }, { label: t('title') }]}
        actions={
          <Button
            onClick={() => setEditorOpen(true)}
            className="gap-2"
            disabled={!self}
          >
            {hasStarted ? (
              <>
                <Pencil className="h-4 w-4" aria-hidden />
                {t('edit')}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden />
                {t('start')}
              </>
            )}
          </Button>
        }
      />

      {demo && <ConfigNotice variant="inline" />}

      {/* Hero: my Sette Perché */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <WhyProgress filled={selfFilled} size={64} />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('my_card_title')}
                </p>
                <p className="mt-0.5 truncate text-lg font-semibold text-foreground">
                  {selfSubject || (
                    <span className="italic text-muted-foreground">
                      {hasStarted ? t('no_subject') : t('empty_title')}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t('completion', { filled: selfFilled })}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {selfPrimary && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                  {`${t('primary_why')}: ${selfPrimary}`}
                </span>
              )}
              <Button
                variant={hasStarted ? 'outline' : 'default'}
                onClick={() => setEditorOpen(true)}
                disabled={!self}
                className="gap-2"
              >
                <Target className="h-4 w-4" aria-hidden />
                {hasStarted ? t('open_editor') : t('start')}
              </Button>
            </div>
          </div>

          {!hasStarted && (
            <>
              <Separator className="my-4" />
              <p className="text-sm text-muted-foreground">{t('empty_body')}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Team roster */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">
              {t('team_title')}
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {team.length}
            </span>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {t('team_subtitle')}
          </p>
        </div>

        {team.length === 0 ? (
          <EmptyState
            title={tc('empty_title')}
            description={t('team_subtitle')}
            icon={<Users />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {team.map((row) => (
              <PersonCard
                key={row.marketer_id}
                row={row}
                labels={cardLabels}
                onOpen={() =>
                  router.push(`/sette-perche/${row.marketer_id}`)
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Editor slide-over (write-own) */}
      <FormSheet
        open={editorOpen}
        onOpenChange={(o) => !busy && setEditorOpen(o)}
        title={t('my_card_title')}
        description={t('stepper_intro')}
        size="lg"
        footer={
          <>
            {hasStarted && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                disabled={busy}
                className="mr-auto gap-2 text-danger hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {tc('delete')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={busy}
            >
              {tc('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => editorRef.current?.save()}
              disabled={busy}
              className="gap-2"
            >
              {busy ? tc('saving') : t('save')}
            </Button>
          </>
        }
      >
        {self && (
          <SevenWhysEditor
            ref={editorRef}
            record={self.record}
            personName={self.person_name}
            embedded
            onSaved={handleSaved}
            onBusyChange={setBusy}
          />
        )}
      </FormSheet>

      {/* Reset confirm (write-own) */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => !busy && setDeleteOpen(o)}
        title={t('delete_title')}
        description={t('delete_body')}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
