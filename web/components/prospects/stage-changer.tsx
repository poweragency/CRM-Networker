'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { FormSheet } from '@/components/crm/form-sheet';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import {
  STAGE_LABELS,
  STAGE_ORDER,
  stageIndex,
  type ProspectStage,
} from '@/lib/types/db';
import { cn } from '@/lib/utils';
import { changeStageAction } from '@/app/(app)/percorso-prospect/actions';

/**
 * StageChanger — the explicit "Cambia fase" control on the prospect detail page.
 * Pick a target stage from a menu; moving forward to a later stage opens a small
 * sheet for an optional transition note before committing via
 * `changeStageAction` (transactional RPC; simulated in demo). Complements the
 * drag-and-drop board with a keyboard-friendly, note-capable path.
 */

export interface StageChangerProps {
  prospectId: string;
  currentStage: ProspectStage;
}

const noteTextarea =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function StageChanger({ prospectId, currentStage }: StageChangerProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [target, setTarget] = React.useState<ProspectStage | null>(null);
  const [note, setNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  function pick(stage: ProspectStage) {
    if (stage === currentStage) return;
    setNote('');
    setTarget(stage);
  }

  async function commit() {
    if (!target) return;
    setSubmitting(true);
    const res = await changeStageAction(prospectId, target, note.trim() || undefined);
    setSubmitting(false);

    if (!res.ok) {
      toast({ title: 'Operazione non riuscita. Riprova.', variant: 'error' });
      return;
    }

    const enrolled = target === 'iscrizione';
    const win = enrolled || target === 'closing';
    toast({
      title: enrolled
        ? 'Prospect iscritto! 🎉'
        : target === 'closing'
          ? 'Sei in Closing! 🔥'
          : 'Fase aggiornata',
      description: res.demo
        ? `Spostato in “${STAGE_LABELS[target]}” (simulato in modalità demo).`
        : `Spostato in “${STAGE_LABELS[target]}”.`,
      variant: win ? 'achievement' : 'success',
    });
    setTarget(null);
    router.refresh();
  }

  const currentIdx = stageIndex(currentStage);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Cambia fase
            <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <DropdownMenuLabel>Sposta in</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STAGE_ORDER.map((stage) => {
            const idx = stageIndex(stage);
            const isCurrent = stage === currentStage;
            return (
              <DropdownMenuItem
                key={stage}
                onClick={() => pick(stage)}
                disabled={isCurrent}
                className={cn(isCurrent && 'opacity-60')}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold tabular-nums',
                    idx < currentIdx
                      ? 'bg-success/15 text-success'
                      : idx === currentIdx
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground',
                  )}
                  aria-hidden
                >
                  {idx}
                </span>
                <span className="flex-1">{STAGE_LABELS[stage]}</span>
                {isCurrent && (
                  <span className="text-xs text-muted-foreground">attuale</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <FormSheet
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Cambia fase"
        description={
          target
            ? `Sposta il prospect in “${STAGE_LABELS[target]}”.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setTarget(null)}
              disabled={submitting}
            >
              Annulla
            </Button>
            <Button onClick={commit} disabled={submitting}>
              {submitting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {submitting ? 'Salvataggio…' : 'Conferma'}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="stage-note" className="block">
            Nota sul passaggio (facoltativa)
          </Label>
          <textarea
            id="stage-note"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Aggiungi una nota…"
            className={cn(noteTextarea, 'resize-y')}
          />
        </div>
      </FormSheet>
    </>
  );
}
