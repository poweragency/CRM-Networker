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
  STARTING_PACKAGE_LABELS,
  STARTING_PACKAGE_ORDER,
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
  const [click, setClick] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset the form each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setFirstName('');
      setLastName('');
      setPack('');
      setClick(false);
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
    setError(null);
    setSaving(true);
    const res = await addMarketerAction({
      parentId: target.parentId,
      leg: target.leg,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      pack: pack || null,
      click,
    });
    setSaving(false);
    if (!res.ok || !res.node) {
      toast({ title: t('add_error'), variant: 'error' });
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

        <label className="flex items-center gap-2 text-sm text-foreground">
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
