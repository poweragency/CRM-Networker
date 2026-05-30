'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { History, RotateCcw, Eye, Check } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FormSheet } from '@/components/crm/form-sheet';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { EmptyState } from '@/components/crm/empty-state';
import { RichTextViewer } from '@/components/crm/rich-text-viewer';
import { useToast } from '@/components/crm/toaster';
import type {
  DocumentVersion,
  InternalDocument,
  TiptapDoc,
} from '@/lib/types/db';
import {
  listVersionsAction,
  restoreVersionAction,
} from '@/app/(app)/documenti/actions';

/**
 * VersionHistorySheet — the version timeline slide-over for a document. On open
 * it lazily fetches the history via {@link listVersionsAction} (demo-safe), then
 * lists the CURRENT version plus each prior snapshot (newest first). Each row can
 * be PREVIEWED inline (server-safe RichTextViewer) and RESTORED — restore re-saves
 * the chosen snapshot as a new version through the demo-safe action and bubbles
 * the updated doc up to the workspace. Read-only history rows never mutate.
 */

export interface VersionHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: InternalDocument | null;
  authors: Record<string, string>;
  onRestored: (updated: InternalDocument, demo: boolean) => void;
}

/** Synthesize a "current" pseudo-version row from the live document. */
function currentRow(doc: InternalDocument): DocumentVersion {
  return {
    id: `${doc.id}-current`,
    org_id: doc.org_id,
    document_id: doc.id,
    version_no: doc.current_version,
    title: doc.title,
    body: doc.body,
    change_note: null,
    created_by: doc.updated_by,
    created_at: doc.updated_at,
  };
}

export function VersionHistorySheet({
  open,
  onOpenChange,
  document: doc,
  authors,
  onRestored,
}: VersionHistorySheetProps) {
  const t = useTranslations('documenti');
  const tc = useTranslations('crm');
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(false);
  const [versions, setVersions] = React.useState<DocumentVersion[]>([]);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] =
    React.useState<DocumentVersion | null>(null);

  // Lazily load history each time the sheet opens for the current doc.
  React.useEffect(() => {
    if (!open || !doc) return;
    let cancelled = false;
    setLoading(true);
    setPreviewId(null);
    listVersionsAction(doc.id)
      .then((res) => {
        if (cancelled) return;
        setVersions(res.versions);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, doc]);

  // Current (live) row + prior snapshots, newest first.
  const rows = React.useMemo<DocumentVersion[]>(() => {
    if (!doc) return [];
    const prior = versions
      .filter((v) => v.version_no < doc.current_version)
      .sort((a, b) => b.version_no - a.version_no);
    return [currentRow(doc), ...prior];
  }, [doc, versions]);

  const authorName = (id: string | null): string =>
    id ? authors[id] ?? t('unknown_author') : t('unknown_author');

  const confirmRestore = async () => {
    if (!doc || !restoreTarget) return;
    const res = await restoreVersionAction(doc.id, {
      title: restoreTarget.title,
      body: restoreTarget.body,
      version_no: restoreTarget.version_no,
    });
    if (!res.ok || !res.document) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      setRestoreTarget(null);
      return;
    }
    onRestored(res.document, res.demo);
    setRestoreTarget(null);
  };

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        title={t('version_history')}
        description={doc?.title}
        size="lg"
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            variant="bare"
            title={t('no_versions')}
            icon={<History />}
          />
        ) : (
          <ol className="space-y-3">
            {rows.map((v, index) => {
              const isCurrent = index === 0;
              const isOpen = previewId === v.id;
              return (
                <li
                  key={v.id}
                  className={cn(
                    'rounded-lg border bg-card p-4',
                    isCurrent && 'border-primary/40 bg-primary/[0.03]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isCurrent ? 'default' : 'secondary'}>
                          {t('version_no', { n: v.version_no })}
                        </Badge>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Check className="h-3 w-3" aria-hidden />
                            {t('version_current_badge')}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm font-medium text-foreground">
                        {v.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {authorName(v.created_by)} · {formatDateTime(v.created_at)}
                      </p>
                      {v.change_note && (
                        <p className="text-xs italic text-muted-foreground">
                          “{v.change_note}”
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setPreviewId(isOpen ? null : v.id)}
                        aria-expanded={isOpen}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        {t('view_version')}
                      </Button>
                      {!isCurrent && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setRestoreTarget(v)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          {t('restore')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 rounded-md border bg-background p-4">
                      <RichTextViewer doc={v.body as TiptapDoc} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </FormSheet>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={t('restore_confirm_title', { n: restoreTarget?.version_no ?? 0 })}
        description={t('restore_confirm_body', {
          n: restoreTarget?.version_no ?? 0,
        })}
        confirmLabel={t('restore')}
        cancelLabel={tc('cancel')}
        destructive={false}
        onConfirm={confirmRestore}
      />
    </>
  );
}
