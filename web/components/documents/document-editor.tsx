'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Save, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/crm/rich-text-editor';
import type { InternalDocument, TiptapDoc } from '@/lib/types/db';

/**
 * DocumentEditor — the in-place editing surface for a document's body. Wraps the
 * shared {@link RichTextEditor} (Tiptap StarterKit, immediatelyRender:false to
 * avoid SSR hydration mismatch) with a change-note field and a save bar. Saving
 * commits a NEW version through the workspace's demo-safe action. Tracks a dirty
 * flag so "Salva" is disabled when nothing changed, and warns the user before
 * discarding unsaved edits.
 *
 * Note: only the BODY is edited here (the document's prose). Title/category/
 * status/tags are edited via the metadata FormSheet ("Modifica informazioni"),
 * keeping the writing surface focused.
 */

export interface DocumentEditorProps {
  document: InternalDocument;
  /** Persist the edited body as a new version; resolves true on success. */
  onSave: (
    doc: InternalDocument,
    body: TiptapDoc,
    changeNote: string,
  ) => Promise<boolean>;
  /** Leave edit mode (back to the reader). */
  onClose: () => void;
}

/** Stable stringify for dirty comparison (Tiptap JSON key order is stable). */
function bodyKey(body: TiptapDoc): string {
  return JSON.stringify(body);
}

export function DocumentEditor({
  document: doc,
  onSave,
  onClose,
}: DocumentEditorProps) {
  const t = useTranslations('documenti');
  const tc = useTranslations('crm');

  const [body, setBody] = React.useState<TiptapDoc>(doc.body);
  const [changeNote, setChangeNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Re-seed when switching to a different document while in edit mode.
  const baselineRef = React.useRef(bodyKey(doc.body));
  React.useEffect(() => {
    setBody(doc.body);
    setChangeNote('');
    baselineRef.current = bodyKey(doc.body);
  }, [doc.id, doc.body]);

  const dirty = bodyKey(body) !== baselineRef.current;

  const handleSave = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const okSaved = await onSave(doc, body, changeNote.trim());
      if (okSaved) {
        baselineRef.current = bodyKey(body);
        setChangeNote('');
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setBody(doc.body);
    setChangeNote('');
    baselineRef.current = bodyKey(doc.body);
  };

  const handleClose = () => {
    if (dirty && !saving) {
      const ok = window.confirm(t('unsaved') + ' — ' + tc('cancel') + '?');
      if (!ok) return;
    }
    onClose();
  };

  return (
    <div className="space-y-4">
      <RichTextEditor
        value={doc.body}
        onChange={setBody}
        placeholder={t('body_placeholder')}
        aria-label={t('body')}
        className="min-h-[20rem]"
      />

      <div className="space-y-1.5">
        <Label htmlFor="doc-change-note">{t('change_note')}</Label>
        <Input
          id="doc-change-note"
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder={t('change_note_placeholder')}
          maxLength={160}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <span
          className={cn(
            'text-xs',
            dirty ? 'font-medium text-warning' : 'text-muted-foreground',
          )}
          aria-live="polite"
        >
          {dirty ? t('unsaved') : tc('saved')}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRevert}
            disabled={!dirty || saving}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {tc('restore')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={saving}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {tc('cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" aria-hidden />
            {saving ? tc('saving') : t('save_version')}
          </Button>
        </div>
      </div>
    </div>
  );
}
