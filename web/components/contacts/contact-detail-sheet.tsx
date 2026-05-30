'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Mail,
  Phone,
  MapPin,
  CalendarClock,
  Clock,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { cn, formatDate, formatDateTime, formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { FormSheet } from '@/components/crm/form-sheet';
import { StatusPill } from '@/components/crm/status-pill';
import { TagList } from '@/components/crm/tag-list';
import {
  CONTACT_SOURCE_LABELS,
  type Contact,
} from '@/lib/types/db';

/**
 * ContactDetailSheet — a read view of a single contact in a slide-over: identity,
 * status/source, the contact channels (email/phone/city), tags, follow-up and
 * last-interaction timing, and notes. Footer exposes Edit + Delete which the
 * parent wires to the form sheet / confirm dialog. Pure presentation; all
 * mutations stay in the page container.
 */

export interface ContactDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}

function fullName(c: Contact): string {
  return `${c.first_name} ${c.last_name ?? ''}`.trim();
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
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

export function ContactDetailSheet({
  open,
  onOpenChange,
  contact,
  onEdit,
  onDelete,
}: ContactDetailSheetProps) {
  const t = useTranslations('contatti');
  const tc = useTranslations('crm');

  if (!contact) {
    // Keep the sheet controlled even with no selection (avoids null footer flash).
    return (
      <FormSheet open={open} onOpenChange={onOpenChange} title={tc('details')}>
        {null}
      </FormSheet>
    );
  }

  const name = fullName(contact);
  const overdue = isOverdue(contact.next_follow_up_at);

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
            onClick={() => onEdit(contact)}
            className="gap-2"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {tc('edit')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onDelete(contact)}
            className="gap-2"
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
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusPill kind="contact" value={contact.status} />
              <span className="text-xs text-muted-foreground">
                {CONTACT_SOURCE_LABELS[contact.source]}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Channels */}
        <div className="divide-y divide-border">
          <DetailRow icon={<Mail />} label={t('email')}>
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="text-primary hover:underline"
              >
                {contact.email}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          <DetailRow icon={<Phone />} label={t('phone')}>
            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/\s+/g, '')}`}
                className="text-primary hover:underline"
              >
                {contact.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          <DetailRow icon={<MapPin />} label={t('city')}>
            {contact.city ?? <span className="text-muted-foreground">—</span>}
          </DetailRow>
        </div>

        <Separator />

        {/* Timing */}
        <div className="divide-y divide-border">
          <DetailRow icon={<CalendarClock />} label={t('next_follow_up')}>
            {contact.next_follow_up_at ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5',
                  overdue && 'font-medium text-danger',
                )}
              >
                {overdue && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                {formatDateTime(contact.next_follow_up_at)}
                <span className="text-xs text-muted-foreground">
                  ({formatRelativeTime(contact.next_follow_up_at)})
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
          <DetailRow icon={<Clock />} label={tc('last_interaction')}>
            {contact.last_interaction_at ? (
              <span>
                {formatDate(contact.last_interaction_at)}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({formatRelativeTime(contact.last_interaction_at)})
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailRow>
        </div>

        <Separator />

        {/* Tags */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('tags')}</p>
          <TagList tags={contact.tags} max={12} />
        </div>

        {/* Notes */}
        {contact.notes && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('notes')}</p>
            <p className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm text-foreground">
              {contact.notes}
            </p>
          </div>
        )}

        <p className="pt-1 text-xs text-muted-foreground">
          {tc('created_at')} {formatDate(contact.created_at)}
        </p>
      </div>
    </FormSheet>
  );
}
