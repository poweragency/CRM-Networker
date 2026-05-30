'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Tag, ListChecks, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TagInput } from '@/components/crm/tag-input';
import { StatusPill } from '@/components/crm/status-pill';
import {
  CONTACT_STATUS_ORDER,
  type ContactStatus,
} from '@/lib/types/db';

/**
 * ContactBulkBar — the action strip that appears above the table once one or
 * more rows are selected. Exposes the three bulk operations required by the
 * brief: add a tag, set a status, and delete the selection. It owns only its
 * own ephemeral UI (the "add tag" popover draft); the actual mutations are
 * delegated up to the page container which runs the demo-safe Server Actions.
 */

export interface ContactBulkBarProps {
  count: number;
  onClearSelection: () => void;
  onAddTags: (tags: string[]) => void;
  onSetStatus: (status: ContactStatus) => void;
  onDelete: () => void;
  busy?: boolean;
}

export function ContactBulkBar({
  count,
  onClearSelection,
  onAddTags,
  onSetStatus,
  onDelete,
  busy,
}: ContactBulkBarProps) {
  const t = useTranslations('crm');
  const [tagDraft, setTagDraft] = React.useState<string[]>([]);
  const [tagOpen, setTagOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!tagOpen) return;
    function onDown(e: PointerEvent) {
      if (!popoverRef.current?.contains(e.target as Node)) setTagOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setTagOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [tagOpen]);

  const applyTags = () => {
    if (tagDraft.length === 0) return;
    onAddTags(tagDraft);
    setTagDraft([]);
    setTagOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 animate-fade-in">
      <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('cancel')}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        {t('selected', { count })}
      </span>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden />

      {/* Add tag (inline popover) */}
      <div ref={popoverRef} className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setTagOpen((v) => !v)}
          aria-expanded={tagOpen}
          aria-haspopup="dialog"
          className="gap-1.5 bg-background"
        >
          <Tag className="h-3.5 w-3.5" aria-hidden />
          {t('bulk_tag')}
        </Button>
        {tagOpen && (
          <div
            role="dialog"
            aria-label={t('bulk_tag')}
            className="absolute left-0 z-50 mt-2 w-72 origin-top rounded-md border bg-card p-3 text-card-foreground shadow-lg animate-scale-in"
          >
            <TagInput
              value={tagDraft}
              onChange={setTagDraft}
              placeholder={t('tags')}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTagOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={applyTags}
                disabled={tagDraft.length === 0}
              >
                {t('save')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Set status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="gap-1.5 bg-background"
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            {t('bulk_status')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t('bulk_actions')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {CONTACT_STATUS_ORDER.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() => onSetStatus(status)}
              className="justify-start"
            >
              <StatusPill kind="contact" value={status} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onDelete}
        className="gap-1.5 text-danger hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        {t('bulk_delete')}
      </Button>
    </div>
  );
}
