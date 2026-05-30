'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/crm/page-header';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { ConfigNotice } from '@/components/config-notice';
import type {
  DocumentCategory,
  DocumentStatus,
  InternalDocument,
  TiptapDoc,
} from '@/lib/types/db';
import {
  archiveDocumentAction,
  createDocumentAction,
  duplicateDocumentAction,
  saveVersionAction,
} from '@/app/(app)/documenti/actions';
import { DocumentLibrary } from './document-library';
import { DocumentPane } from './document-pane';
import { DocumentFormSheet, type DocumentFormValues } from './document-form-sheet';
import { VersionHistorySheet } from './version-history-sheet';

/**
 * DocumentsWorkspace — the full client container for /documenti. The page (RSC)
 * reads the document set (incl. archived) + tag universe + resolved author names
 * via the demo-safe data layer and hands them in as props; everything
 * interactive lives here in a two-pane "knowledge base" layout:
 *
 *  - DocumentLibrary (left): search + an "Archiviati" filter, the list grouped
 *    by CATEGORY, selecting opens a doc in the reader/editor.
 *  - DocumentPane (right): reads the selected doc (server-safe RichTextViewer)
 *    and, on "Modifica", swaps to the Tiptap editor (immediatelyRender:false) to
 *    save a new version. Actions: nuovo, modifica, cronologia versioni, duplica,
 *    archivia/ripristina.
 *
 * Mutations call the demo-safe Server Actions: in "modalità demo" they return
 * simulated results and we patch local state optimistically + raise the right
 * toast. Nothing throws; the local list stays the source of truth.
 */

export interface DocumentsWorkspaceProps {
  initialDocuments: InternalDocument[];
  initialTags: string[];
  /** marketer_id → display name, for the "Autore"/"Modificato da" lines. */
  authors: Record<string, string>;
  initialDemo: boolean;
}

export function DocumentsWorkspace({
  initialDocuments,
  initialTags,
  authors,
  initialDemo,
}: DocumentsWorkspaceProps) {
  const t = useTranslations('documenti');
  const tc = useTranslations('crm');
  const { toast } = useToast();

  // ── Local source-of-truth list (mutations patch this) ──────────────────────
  const [documents, setDocuments] =
    React.useState<InternalDocument[]>(initialDocuments);
  const [demo, setDemo] = React.useState(initialDemo);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialDocuments.find((d) => d.status !== 'archived')?.id ??
      initialDocuments[0]?.id ??
      null,
  );

  const selected = React.useMemo(
    () => documents.find((d) => d.id === selectedId) ?? null,
    [documents, selectedId],
  );

  // Tag universe (suggestions) recomputed from the current list.
  const allTags = React.useMemo(() => {
    const set = new Set<string>(initialTags);
    for (const d of documents) for (const tag of d.tags) set.add(tag);
    return Array.from(set).sort();
  }, [documents, initialTags]);

  // ── Sheets / dialogs ────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingMeta, setEditingMeta] =
    React.useState<InternalDocument | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [duplicateTarget, setDuplicateTarget] =
    React.useState<InternalDocument | null>(null);
  const [archiveTarget, setArchiveTarget] =
    React.useState<InternalDocument | null>(null);

  const patchDoc = React.useCallback((updated: InternalDocument) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === updated.id ? updated : d)),
    );
  }, []);

  // ── Create (metadata sheet) ─────────────────────────────────────────────────
  const openCreate = () => {
    setEditingMeta(null);
    setFormOpen(true);
  };
  const openEditMeta = (doc: InternalDocument) => {
    setEditingMeta(doc);
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: DocumentFormValues) => {
    if (editingMeta) {
      // Editing the metadata of an existing doc → persist as a new version.
      const res = await saveVersionAction(editingMeta.id, {
        title: values.title,
        category: values.category,
        status: values.status,
        tags: values.tags,
        change_note: 'Aggiornamento informazioni',
      });
      if (!res.ok || !res.document) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      patchDoc(res.document);
      setDemo((d) => d || res.demo);
      toast({
        title: t('saved'),
        description: res.demo ? t('saved_demo') : undefined,
        variant: 'success',
      });
    } else {
      const res = await createDocumentAction({
        title: values.title,
        category: values.category,
        status: values.status,
        tags: values.tags,
      });
      if (!res.ok || !res.document) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      setDocuments((prev) => [res.document as InternalDocument, ...prev]);
      setSelectedId(res.document.id);
      setDemo((d) => d || res.demo);
      toast({
        title: t('created'),
        description: res.demo ? t('created_demo') : undefined,
        variant: 'success',
      });
    }
    setFormOpen(false);
    setEditingMeta(null);
  };

  // ── Save body (from the editor) → new version ───────────────────────────────
  const handleSaveBody = async (
    doc: InternalDocument,
    body: TiptapDoc,
    changeNote: string,
  ): Promise<boolean> => {
    const res = await saveVersionAction(doc.id, {
      body,
      change_note: changeNote || undefined,
    });
    if (!res.ok || !res.document) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return false;
    }
    patchDoc(res.document);
    setDemo((d) => d || res.demo);
    toast({
      title: t('saved'),
      description: res.demo ? t('saved_demo') : undefined,
      variant: 'success',
    });
    return true;
  };

  // ── Restore a version (from the history sheet) ──────────────────────────────
  const handleRestored = (updated: InternalDocument, isDemo: boolean) => {
    patchDoc(updated);
    setSelectedId(updated.id);
    setDemo((d) => d || isDemo);
    setHistoryOpen(false);
    toast({
      title: t('restored'),
      description: isDemo ? t('restored_demo') : undefined,
      variant: 'success',
    });
  };

  // ── Duplicate ───────────────────────────────────────────────────────────────
  const confirmDuplicate = async () => {
    if (!duplicateTarget) return;
    const res = await duplicateDocumentAction(duplicateTarget.id);
    if (!res.ok || !res.document) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    setDocuments((prev) => [res.document as InternalDocument, ...prev]);
    setSelectedId(res.document.id);
    setDemo((d) => d || res.demo);
    toast({
      title: t('duplicated'),
      description: res.demo ? t('duplicated_demo') : undefined,
      variant: 'success',
    });
    setDuplicateTarget(null);
  };

  // ── Archive / restore ───────────────────────────────────────────────────────
  const confirmArchive = async () => {
    if (!archiveTarget) return;
    const res = await archiveDocumentAction(archiveTarget.id, true);
    if (!res.ok || !res.document) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    patchDoc(res.document);
    setDemo((d) => d || res.demo);
    toast({
      title: t('archived'),
      description: res.demo ? t('archived_demo') : undefined,
      variant: 'success',
    });
    setArchiveTarget(null);
  };

  const handleUnarchive = async (doc: InternalDocument) => {
    const res = await archiveDocumentAction(doc.id, false);
    if (!res.ok || !res.document) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    patchDoc(res.document);
    setDemo((d) => d || res.demo);
    toast({
      title: t('unarchived'),
      description: res.demo ? t('archived_demo') : undefined,
      variant: 'success',
    });
  };

  const hasAny = documents.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={<FileText />}
        breadcrumbs={[{ label: tc('section') }, { label: t('title') }]}
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            {t('new_document')}
          </Button>
        }
      />

      {demo && <ConfigNotice variant="inline" />}

      {hasAny ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr] xl:grid-cols-[22rem_1fr]">
          <DocumentLibrary
            documents={documents}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <DocumentPane
            document={selected}
            authors={authors}
            onSaveBody={handleSaveBody}
            onEditMeta={openEditMeta}
            onOpenHistory={() => setHistoryOpen(true)}
            onDuplicate={(d) => setDuplicateTarget(d)}
            onArchive={(d) => setArchiveTarget(d)}
            onUnarchive={handleUnarchive}
          />
        </div>
      ) : (
        <EmptyState
          title={t('empty_title')}
          description={t('empty_body')}
          icon={<FileText />}
          action={
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              {t('new_document')}
            </Button>
          }
        />
      )}

      {/* Create / edit-metadata slide-over */}
      <DocumentFormSheet
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditingMeta(null);
        }}
        document={editingMeta}
        tagSuggestions={allTags}
        onSubmit={handleFormSubmit}
      />

      {/* Version history slide-over */}
      <VersionHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        document={selected}
        authors={authors}
        onRestored={handleRestored}
      />

      {/* Duplicate confirm */}
      <ConfirmDialog
        open={Boolean(duplicateTarget)}
        onOpenChange={(o) => !o && setDuplicateTarget(null)}
        title={t('duplicate_confirm_title')}
        description={t('duplicate_confirm_body')}
        confirmLabel={t('duplicate')}
        cancelLabel={tc('cancel')}
        onConfirm={confirmDuplicate}
      />

      {/* Archive confirm */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={t('archive_confirm_title')}
        description={t('archive_confirm_body')}
        confirmLabel={t('archive')}
        cancelLabel={tc('cancel')}
        onConfirm={confirmArchive}
        destructive
      />
    </div>
  );
}
