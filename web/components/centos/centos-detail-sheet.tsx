'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Phone,
  Users2,
  Star,
  Clock,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  ArrowUpRight,
} from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { FormSheet } from '@/components/crm/form-sheet';
import { StatusPill } from '@/components/crm/status-pill';
import { centosStatus, type CentosEntry } from '@/lib/types/db';
import { RatingStars } from './rating-stars';

/**
 * CentosDetailSheet — a read view of a single Centos entry in a slide-over:
 * identity, derived status, phone, relationship, rating, notes and timing.
 * The footer exposes Edit + Delete, plus the contacted toggle and the
 * promote-to-contact action (when not already promoted) which the parent wires to
 * the demo-safe Server Actions. Pure presentation; all mutations stay in the
 * page container.
 */

export interface CentosDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: CentosEntry | null;
  onEdit: (entry: CentosEntry) => void;
  onDelete: (entry: CentosEntry) => void;
  onToggleContacted: (entry: CentosEntry) => void;
  onPromote: (entry: CentosEntry) => void;
  /** disables the action buttons while a mutation is in flight. */
  busy?: boolean;
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

function DetailRow({ icon, label, children }: RowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:h-4 [&_svg]:w-4"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function CentosDetailSheet({
  open,
  onOpenChange,
  entry,
  onEdit,
  onDelete,
  onToggleContacted,
  onPromote,
  busy,
}: CentosDetailSheetProps) {
  const t = useTranslations('centos');
  const tc = useTranslations('crm');

  if (!entry) {
    // Keep the sheet controlled even with no selection (avoids null footer flash).
    return (
      <FormSheet open={open} onOpenChange={onOpenChange} title={tc('details')}>
        {null}
      </FormSheet>
    );
  }

  const status = centosStatus(entry);
  const promoted = Boolean(entry.promoted_contact_id);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={tc('details')}
      size="md"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onEdit(entry)}
            className="gap-2"
            disabled={busy}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {tc('edit')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onDelete(entry)}
            className="gap-2"
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {tc('delete')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <Avatar name={entry.full_name} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                #{entry.position}
              </span>
              <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {entry.full_name}
              </h3>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusPill kind="centos" value={status} />
              {entry.rating ? (
                <RatingStars
                  value={entry.rating}
                  label={t('rating_stars', { count: entry.rating })}
                />
              ) : null}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={entry.contacted ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onToggleContacted(entry)}
            disabled={busy}
            className="gap-1.5"
          >
            {entry.contacted ? (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            ) : (
              <Circle className="h-4 w-4" aria-hidden />
            )}
            {entry.contacted ? t('unmark_contacted') : t('mark_contacted')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPromote(entry)}
            disabled={busy || promoted}
            className="gap-1.5"
            title={promoted ? t('already_promoted') : undefined}
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden />
            {promoted ? t('already_promoted') : t('promote')}
          </Button>
        </div>

        <Separator />

        {/* Details */}
        <div className="divide-y divide-border">
          <DetailRow icon={<Phone />} label={t('phone')}>
            {entry.phone ? (
              <a
                href={`tel:${entry.phone.replace(/\s+/g, '')}`}
                className="text-primary hover:underline"
              >
                {entry.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          <DetailRow icon={<Users2 />} label={t('relationship')}>
            {entry.relationship ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          <DetailRow icon={<Star />} label={t('rating')}>
            {entry.rating ? (
              <RatingStars
                value={entry.rating}
                size="md"
                label={t('rating_stars', { count: entry.rating })}
              />
            ) : (
              <span className="text-muted-foreground">{t('no_rating')}</span>
            )}
          </DetailRow>
          <DetailRow icon={<Clock />} label={tc('updated_at')}>
            <span>
              {formatDate(entry.updated_at)}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({formatRelativeTime(entry.updated_at)})
              </span>
            </span>
          </DetailRow>
        </div>

        {/* Notes */}
        {entry.notes && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('notes')}</p>
              <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm text-foreground">
                {entry.notes}
              </p>
            </div>
          </>
        )}

        <p className="pt-1 text-xs text-muted-foreground">
          {tc('created_at')} {formatDate(entry.created_at)}
        </p>
      </div>
    </FormSheet>
  );
}
