'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * UnsavedBar — a floating "you have unsaved changes" reminder shown whenever a
 * form is dirty. Two safety nets in one:
 *  1. a sticky bottom banner with a Save (and optional Discard) action, so the
 *     reminder is impossible to miss while editing;
 *  2. a `beforeunload` guard that warns on tab close / refresh while dirty.
 *
 * Drop it at the end of any edit surface and feed it the form's `dirty` flag.
 */
export function UnsavedBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  label = 'Hai modifiche non salvate',
  saveLabel = 'Salva',
  discardLabel = 'Annulla',
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void | Promise<void>;
  onDiscard?: () => void;
  label?: string;
  saveLabel?: string;
  discardLabel?: string;
}) {
  // Native guard for tab close / reload while there are unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!dirty) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-xl border border-warning/40 bg-card/95 px-4 py-3 shadow-lg backdrop-blur animate-fade-in">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning"
          aria-hidden
        >
          <AlertTriangle className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{label}</p>
        {onDiscard && (
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
            {discardLabel}
          </Button>
        )}
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className={cn(!saving && 'shadow-glow')}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save aria-hidden />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
