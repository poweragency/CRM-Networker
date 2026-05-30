'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSheet } from '@/components/crm/form-sheet';
import { TagInput } from '@/components/crm/tag-input';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_ORDER,
  DOCUMENT_STATUS_LABELS,
  type DocumentCategory,
  type DocumentStatus,
  type InternalDocument,
} from '@/lib/types/db';

/**
 * DocumentFormSheet — the right slide-over for creating a document or editing an
 * existing one's METADATA (title, category, status, tags). The rich-text body is
 * edited in the main pane's {@link DocumentEditor}, not here, keeping creation
 * lightweight (a new doc starts empty and opens in the reader). Controlled via
 * `open`/`onOpenChange`; submits a validated {@link DocumentFormValues} the
 * workspace turns into a create or a save-version through the demo-safe actions.
 */

export interface DocumentFormValues {
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  tags: string[];
}

export interface DocumentFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create; otherwise edit this document's metadata. */
  document: InternalDocument | null;
  tagSuggestions: string[];
  onSubmit: (values: DocumentFormValues) => Promise<void>;
}

const STATUS_OPTIONS: DocumentStatus[] = ['draft', 'published', 'archived'];

function selectClass(): string {
  return 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';
}

export function DocumentFormSheet({
  open,
  onOpenChange,
  document: doc,
  tagSuggestions,
  onSubmit,
}: DocumentFormSheetProps) {
  const t = useTranslations('documenti');
  const tc = useTranslations('crm');

  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<DocumentCategory>('formazione');
  const [status, setStatus] = React.useState<DocumentStatus>('draft');
  const [tags, setTags] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Seed the form whenever it opens (create vs edit).
  React.useEffect(() => {
    if (!open) return;
    setTitle(doc?.title ?? '');
    setCategory(doc?.category ?? 'formazione');
    setStatus(doc?.status ?? 'draft');
    setTags(doc?.tags ?? []);
    setError(null);
  }, [open, doc]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t('title_required'));
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ title: trimmed, category, status, tags });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={doc ? t('edit_title') : t('create_title')}
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {tc('cancel')}
          </Button>
          <Button type="submit" form="document-form" disabled={busy}>
            {busy ? tc('saving') : doc ? tc('save') : tc('create')}
          </Button>
        </>
      }
    >
      <form id="document-form" onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="doc-title">{t('doc_title')}</Label>
          <Input
            id="doc-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t('title_placeholder')}
            maxLength={160}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'doc-title-error' : undefined}
            autoFocus
          />
          {error && (
            <p id="doc-title-error" className="text-xs font-medium text-danger">
              {error}
            </p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label htmlFor="doc-category">{t('category')}</Label>
          <select
            id="doc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            className={selectClass()}
          >
            {DOCUMENT_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label htmlFor="doc-status">{t('status')}</Label>
          <select
            id="doc-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as DocumentStatus)}
            className={selectClass()}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {DOCUMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div className="space-y-1.5">
          <Label htmlFor="doc-tags">{t('tags')}</Label>
          <TagInput
            id="doc-tags"
            value={tags}
            onChange={setTags}
            suggestions={tagSuggestions}
          />
        </div>
      </form>
    </FormSheet>
  );
}
