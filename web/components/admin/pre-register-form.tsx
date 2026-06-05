'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, UserPlus } from 'lucide-react';
import {
  RANK_LABELS,
  RANK_ORDER,
  STATUS_LABELS,
  type MarketerRank,
  type MarketerStatus,
  type PlacementLeg,
} from '@/lib/types/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import { createMarketerAction } from '@/app/(app)/admin/marketer/actions';

/**
 * Pre-registration form (ADR-001 operator-driven placement). Creates a marketer
 * PROFILE at an exact (parent, leg) slot — no login is created here (that's the
 * separate activation flow). Demo-safe: submits through `createMarketerAction`
 * and toasts real-vs-simulated, then redirects to the registry on success.
 */

interface Option {
  id: string;
  display_name: string;
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

export function PreRegisterForm({ options }: { options: Option[] }) {
  const t = useTranslations('admin_marketer');
  const { toast } = useToast();
  const router = useRouter();

  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [parentId, setParentId] = React.useState('');
  const [leg, setLeg] = React.useState<PlacementLeg>('LEFT');
  const [sponsorId, setSponsorId] = React.useState('');
  const [rank, setRank] = React.useState<MarketerRank>('executive');
  const [status, setStatus] = React.useState<MarketerStatus>('active');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const isRoot = parentId === '';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError(t('name_required'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await createMarketerAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        parentId: isRoot ? null : parentId,
        leg: isRoot ? null : leg,
        sponsorId: sponsorId === '' ? (isRoot ? null : parentId) : sponsorId,
        rank,
        status,
      });
      if (!res.ok) {
        setError(t('create_error'));
        return;
      }
      // A new recruit is a real milestone → achievement (rains confetti).
      toast({
        title: t('created'),
        description: res.demo ? t('created_demo') : undefined,
        variant: 'achievement',
      });
      router.push('/admin/marketer');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">{t('first_name')}</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">{t('last_name')}</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="parent">{t('parent')}</Label>
        <select
          id="parent"
          className={selectClass}
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">{t('parent_root')}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.display_name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t('parent_help')}</p>
      </div>

      {!isRoot && (
        <div className="space-y-1.5">
          <Label htmlFor="leg">{t('leg')}</Label>
          <select
            id="leg"
            className={cn(selectClass, 'max-w-xs')}
            value={leg}
            onChange={(e) => setLeg(e.target.value as PlacementLeg)}
          >
            <option value="LEFT">{t('leg_left')}</option>
            <option value="RIGHT">{t('leg_right')}</option>
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="sponsor">{t('sponsor')}</Label>
        <select
          id="sponsor"
          className={selectClass}
          value={sponsorId}
          onChange={(e) => setSponsorId(e.target.value)}
        >
          <option value="">{t('sponsor_none')}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.display_name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t('sponsor_help')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rank">{t('rank')}</Label>
          <select
            id="rank"
            className={selectClass}
            value={rank}
            onChange={(e) => setRank(e.target.value as MarketerRank)}
          >
            {RANK_ORDER.map((r) => (
              <option key={r} value={r}>
                {RANK_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">{t('status')}</Label>
          <select
            id="status"
            className={selectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as MarketerStatus)}
          >
            {(Object.keys(STATUS_LABELS) as MarketerStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
