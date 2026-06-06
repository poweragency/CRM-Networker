'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import {
  RANK_LABELS,
  RANK_ORDER,
  STARTING_PACKAGE_LABELS,
  STARTING_PACKAGE_ORDER,
  type MarketerRank,
  type PlacementLeg,
  type StartingPackage,
  type TreeNode,
} from '@/lib/types/db';
import { addMarketerAction } from '@/app/(app)/genealogia/actions';

/**
 * AddMemberDialog — the "add a member directly from the tree" window. Opened by a
 * "+" add-slot; collects the essentials (nome, cognome, pacchetto, click) and
 * commits via the demo-safe `addMarketerAction`. On success it hands the created
 * node back so the canvas can insert it under (parentId, leg) immediately.
 */

export interface AddMemberTarget {
  parentId: string;
  leg: PlacementLeg;
  parentName: string;
}

export interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AddMemberTarget | null;
  onAdded: (node: TreeNode) => void;
}

const fieldCx =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function AddMemberDialog({
  open,
  onOpenChange,
  target,
  onAdded,
}: AddMemberDialogProps) {
  const t = useTranslations('genealogia');
  const { toast } = useToast();

  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [pack, setPack] = React.useState<StartingPackage | ''>('');
  const [rank, setRank] = React.useState<MarketerRank>('executive');
  const [click, setClick] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset the form each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setFirstName('');
      setLastName('');
      setPack('');
      setRank('executive');
      setClick(false);
      setEmail('');
      setPassword('');
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const legLabel =
    target?.leg === 'LEFT' ? t('add_leg_left') : t('add_leg_right');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (!firstName.trim() || !lastName.trim()) {
      setError(t('add_name_required'));
      return;
    }
    const mail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError(t('add_email_invalid'));
      return;
    }
    if (password.length < 8) {
      setError(t('add_password_short'));
      return;
    }
    setError(null);
    setSaving(true);
    const res = await addMarketerAction({
      parentId: target.parentId,
      leg: target.leg,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      rank,
      pack: pack || null,
      click,
      email: mail,
      password,
    });
    setSaving(false);
    if (!res.ok || !res.node) {
      setError(
        res.error === 'email_taken'
          ? t('add_email_taken')
          : res.error === 'service_missing'
            ? t('add_service_missing')
            : res.error === 'weak_password'
              ? t('add_password_weak')
              : t('add_error'),
      );
      return;
    }
    onAdded(res.node);
    toast({
      title: t('add_done'),
      description: res.demo ? t('add_demo') : undefined,
      variant: 'success',
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('add_title')}
      description={
        target ? t('add_subtitle', { parent: target.parentName, leg: legLabel }) : undefined
      }
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('add_cancel')}
          </Button>
          <Button type="submit" form="add-member-form" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {saving ? t('add_submitting') : t('add_submit')}
          </Button>
        </>
      }
    >
      <form id="add-member-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="am-first" className="mb-1.5 block">
              {t('add_first_name')}
            </Label>
            <Input
              id="am-first"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                if (error) setError(null);
              }}
              autoComplete="off"
              aria-invalid={Boolean(error)}
            />
          </div>
          <div>
            <Label htmlFor="am-last" className="mb-1.5 block">
              {t('add_last_name')}
            </Label>
            <Input
              id="am-last"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                if (error) setError(null);
              }}
              autoComplete="off"
              aria-invalid={Boolean(error)}
            />
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div>
          <Label htmlFor="am-rank" className="mb-1.5 block">
            {t('add_rank')}
          </Label>
          <select
            id="am-rank"
            value={rank}
            onChange={(e) => setRank(e.target.value as MarketerRank)}
            className={cn(fieldCx, 'cursor-pointer')}
          >
            {RANK_ORDER.map((r) => (
              <option key={r} value={r}>
                {RANK_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="am-pack" className="mb-1.5 block">
            {t('add_pack')}
          </Label>
          <select
            id="am-pack"
            value={pack}
            onChange={(e) => setPack(e.target.value as StartingPackage | '')}
            className={cn(fieldCx, 'cursor-pointer')}
          >
            <option value="">{t('add_pack_none')}</option>
            {STARTING_PACKAGE_ORDER.map((p) => (
              <option key={p} value={p}>
                {STARTING_PACKAGE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        {/* Account di accesso — creato subito per la persona. */}
        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('add_account')}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="am-email" className="mb-1.5 block">
                {t('add_email')}
              </Label>
              <Input
                id="am-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t('add_email_ph')}
              />
            </div>
            <div>
              <Label htmlFor="am-password" className="mb-1.5 block">
                {t('add_password')}
              </Label>
              <Input
                id="am-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t('add_password_ph')}
              />
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-foreground transition-colors duration-base hover:bg-muted/50">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={click}
            onChange={(e) => setClick(e.target.checked)}
          />
          {t('add_click')}
        </label>
      </form>
    </Modal>
  );
}
