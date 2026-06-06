'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { FormSheet } from '@/components/crm/form-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import {
  STAGE_LABELS,
  STAGE_ORDER,
  type ProspectStage,
} from '@/lib/types/db';
import { cn } from '@/lib/utils';
import { createProspectAction } from '@/app/(app)/percorso-prospect/actions';
import type { ProspectView } from './types';

/**
 * NewProspectSheet — the "Nuovo prospect" create form in a right slide-over.
 * Validates the required name client-side, calls the createProspect server
 * action and reports the result (demo → "simulato" notice, real failure →
 * error). On success it pushes the freshly created row into the board via
 * `onCreated` (which already carries the canonical DB row, so no route refresh
 * is needed — refreshing here raced the board re-fetch and made the new card
 * vanish).
 */

export interface ContactOption {
  id: string;
  label: string;
}

export interface NewProspectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contacts the new prospect can be linked to (id + display label). */
  contacts: ContactOption[];
  /** The current user's display name (owner of the optimistic card). */
  ownerName: string;
  /**
   * Owner of the new prospect (a marketer's id). On someone else's profile this
   * is that marketer; omit on your own board → defaults to the caller server-side.
   */
  ownerMarketerId?: string;
  /** Pre-select a column (used by the per-column "+" affordance). */
  defaultStage?: ProspectStage;
  /** Push the freshly created prospect into the board state. */
  onCreated: (prospect: ProspectView) => void;
}

const inputBase =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function NewProspectSheet({
  open,
  onOpenChange,
  contacts,
  ownerName,
  ownerMarketerId,
  defaultStage = 'conoscitiva',
  onCreated,
}: NewProspectSheetProps) {
  const { toast } = useToast();

  const [fullName, setFullName] = React.useState('');
  const [contactId, setContactId] = React.useState('');
  const [stage, setStage] = React.useState<ProspectStage>(defaultStage);
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset the form each time the sheet opens (and honor a new default stage).
  React.useEffect(() => {
    if (open) {
      setFullName('');
      setContactId('');
      setStage(defaultStage);
      setNotes('');
      setError(null);
      setSubmitting(false);
    }
  }, [open, defaultStage]);

  // Auto-fill the name when a contact is chosen and the name is still empty.
  function onPickContact(id: string) {
    setContactId(id);
    if (id && !fullName.trim()) {
      const c = contacts.find((x) => x.id === id);
      if (c) setFullName(c.label);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = fullName.trim();
    if (!name) {
      setError('Il nome è obbligatorio.');
      return;
    }
    setError(null);
    setSubmitting(true);

    const res = await createProspectAction({
      full_name: name,
      contact_id: contactId || null,
      current_stage: stage,
      notes: notes.trim() || null,
      owner_marketer_id: ownerMarketerId,
    });

    setSubmitting(false);

    if (!res.ok) {
      toast({
        title: 'Operazione non riuscita. Riprova.',
        variant: 'error',
      });
      return;
    }

    onCreated({ ...res.data, owner_name: ownerName });
    toast({
      title: 'Prospect creato',
      description: res.demo
        ? 'Elemento creato (simulato in modalità demo).'
        : undefined,
      variant: 'success',
    });
    onOpenChange(false);
  }

  const fieldLabel = 'mb-1.5 block';

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Nuovo prospect"
      description="Avvia un nuovo percorso nel funnel in 6 fasi."
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annulla
          </Button>
          <Button type="submit" form="new-prospect-form" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? 'Salvataggio…' : 'Crea'}
          </Button>
        </>
      }
    >
      <form id="new-prospect-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* Full name */}
        <div>
          <Label htmlFor="np-name" className={fieldLabel}>
            Nome completo
          </Label>
          <Input
            id="np-name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Es. Mario Rossi"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'np-name-err' : undefined}
            autoComplete="off"
          />
          {error && (
            <p id="np-name-err" className="mt-1.5 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        {/* From contact */}
        {contacts.length > 0 && (
          <div>
            <Label htmlFor="np-contact" className={fieldLabel}>
              Da un contatto
            </Label>
            <select
              id="np-contact"
              value={contactId}
              onChange={(e) => onPickContact(e.target.value)}
              className={cn(inputBase, 'cursor-pointer')}
            >
              <option value="">Nessuno</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Stage */}
        <div>
          <Label htmlFor="np-stage" className={fieldLabel}>
            Fase
          </Label>
          <select
            id="np-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as ProspectStage)}
            className={cn(inputBase, 'cursor-pointer')}
          >
            {STAGE_ORDER.map((s, i) => (
              <option key={s} value={s}>
                {i + 1}. {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="np-notes" className={fieldLabel}>
            Note
          </Label>
          <textarea
            id="np-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Aggiungi una nota…"
            rows={3}
            className={cn(inputBase, 'h-auto resize-y py-2')}
          />
        </div>
      </form>
    </FormSheet>
  );
}
