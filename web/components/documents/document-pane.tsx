'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Pencil,
  History,
  Copy,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  FileText,
  Clock,
} from 'lucide-react';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusPill } from '@/components/crm/status-pill';
import { TagList } from '@/components/crm/tag-list';
import { EmptyState } from '@/components/crm/empty-state';
import { RichTextViewer } from '@/components/crm/rich-text-viewer';
import {
  DOCUMENT_CATEGORY_LABELS,
  type InternalDocument,
  type TiptapDoc,
} from '@/lib/types/db';

/**
 * DocumentPane — the right pane of /documenti. In READ mode it renders the
 * selected document's metadata header (category · status · version · tags),
 * an author/last-edited byline, the rich-text body via the server-safe
 * {@link RichTextViewer}, and an actions toolbar (Modifica, Cronologia versioni,
 * Duplica, Archivia/Ripristina). "Modifica" swaps to the {@link DocumentEditor}
 * (Tiptap) in place. When nothing is selected, an empty prompt invites picking a
 * doc from the library.
 */

// The editor pulls in the Tiptap bundle; load it only when editing begins.
const DocumentEditor = React.lazy(() =>
  import('./document-editor').then((m) => ({ default: m.DocumentEditor })),
);

export interface DocumentPaneProps {
  document: InternalDocument | null;
  authors: Record<string, string>;
  onSaveBody: (
    doc: InternalDocument,
    body: TiptapDoc,
    changeNote: string,
  ) => Promise<boolean>;
  onEditMeta: (doc: InternalDocument) => void;
  onOpenHistory: () => void;
  onDuplicate: (doc: InternalDocument) => void;
  onArchive: (doc: InternalDocument) => void;
  onUnarchive: (doc: InternalDocument) => void;
}

export function DocumentPane({
  document: doc,
  authors,
  onSaveBody,
  onEditMeta,
  onOpenHistory,
  onDuplicate,
  onArchive,
  onUnarchive,
}: DocumentPaneProps) {
  const t = useTranslations('documenti');
  const tc = useTranslations('crm');
  const [editing, setEditing] = React.useState(false);

  // Leaving edit mode when the selected document changes.
  React.useEffect(() => {
    setEditing(false);
  }, [doc?.id]);

  if (!doc) {
    return (
      <section className="rounded-xl border bg-card">
        <EmptyState
          variant="bare"
          className="py-24"
          title={t('select_prompt_title')}
          description={t('select_prompt')}
          icon={<FileText />}
        />
      </section>
    );
  }

  const authorName = doc.created_by
    ? authors[doc.created_by] ?? t('unknown_author')
    : t('unknown_author');
  const editorName = doc.updated_by
    ? authors[doc.updated_by] ?? t('unknown_author')
    : authorName;
  const archived = doc.status === 'archived';

  return (
    <section className="flex h-full min-h-[28rem] flex-col rounded-xl border bg-card">
      {/* Header: title, meta chips, actions */}
      <header className="space-y-3 border-b p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {DOCUMENT_CATEGORY_LABELS[doc.category]}
              </span>
              <StatusPill kind="document" value={doc.status} />
              <span className="text-xs text-muted-foreground">
                {t('version', { n: doc.current_version })}
              </span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {doc.title}
            </h2>
          </div>

          {/* Actions toolbar */}
          <div className="flex shrink-0 items-center gap-2">
            {!editing &&
              (archived ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => onUnarchive(doc)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
                  {t('unarchive')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {tc('edit')}
                </Button>
              ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={tc('bulk_actions')}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEditMeta(doc)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  {t('edit_title')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenHistory}>
                  <History className="h-4 w-4" aria-hidden />
                  {t('version_history')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(doc)}>
                  <Copy className="h-4 w-4" aria-hidden />
                  {t('duplicate')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {archived ? (
                  <DropdownMenuItem onClick={() => onUnarchive(doc)}>
                    <ArchiveRestore className="h-4 w-4" aria-hidden />
                    {t('unarchive')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem destructive onClick={() => onArchive(doc)}>
                    <Archive className="h-4 w-4" aria-hidden />
                    {t('archive')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Byline: author + last edited */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Avatar name={authorName} size="sm" className="h-5 w-5 text-[9px]" />
            {t('created_by', { name: authorName })}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <span title={formatDateTime(doc.updated_at)}>
              {t('edited_by', { name: editorName })} ·{' '}
              {formatRelativeTime(doc.updated_at)}
            </span>
          </span>
        </div>

        {doc.tags.length > 0 && <TagList tags={doc.tags} size="sm" />}
      </header>

      {/* Body: viewer or editor */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        {editing ? (
          <React.Suspense
            fallback={
              <p className="text-sm text-muted-foreground">{tc('loading')}</p>
            }
          >
            <DocumentEditor
              document={doc}
              onSave={onSaveBody}
              onClose={() => setEditing(false)}
            />
          </React.Suspense>
        ) : (
          <RichTextViewer doc={doc.body} />
        )}
      </div>
    </section>
  );
}
