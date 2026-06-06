'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, Loader2, Mail, Plus, X } from 'lucide-react';
import {
  INVITATION_STATUS_LABELS,
  INVITATION_STATUS_TONE,
  ROLE_LABELS,
  type AccountInvitation,
  type MembershipRole,
} from '@/lib/types/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  createInvitationAction,
  revokeInvitationAction,
} from '@/app/(app)/admin/attivazioni/actions';

/**
 * Invitations manager (doc 01 §3 / ADR-003). Client surface to issue and revoke
 * activation invitations against existing profiles. Issuing is optimistic +
 * demo-safe (the real token/email runs in the Edge Function); revoke uses the
 * RPC. Local state updates immediately; toasts reflect real-vs-simulated.
 */

interface Option {
  id: string;
  display_name: string;
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const ASSIGNABLE_ROLES: MembershipRole[] = ['member', 'manager', 'admin'];

export function InvitationsManager({
  initial,
  options,
  initialDemo,
}: {
  initial: AccountInvitation[];
  options: Option[];
  initialDemo: boolean;
}) {
  const t = useTranslations('admin_attivazioni');
  const { toast } = useToast();
  const [items, setItems] = React.useState<AccountInvitation[]>(initial);
  const [open, setOpen] = React.useState(false);

  const [marketerId, setMarketerId] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<MembershipRole>('member');
  const [crmAccess, setCrmAccess] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function reset() {
    setMarketerId('');
    setEmail('');
    setRole('member');
    setCrmAccess(true);
    setError(null);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!marketerId) {
      setError(t('marketer_required'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('email_invalid'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      const marketerName =
        options.find((o) => o.id === marketerId)?.display_name ?? '—';
      const res = await createInvitationAction({
        marketerId,
        marketerName,
        email: email.trim(),
        role,
        crmAccess,
      });
      // A configured write that fails now returns ok:false — show a real error and
      // do NOT add a fake row.
      if (!res.ok) {
        setError(t('create_error'));
        return;
      }
      setItems((prev) => [res.invitation, ...prev]);
      toast({
        title: t('created'),
        description: res.demo || initialDemo ? t('created_demo') : undefined,
        variant: 'success',
      });
      reset();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  async function onRevoke(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'revoked' as const } : i)),
    );
    const res = await revokeInvitationAction(id);
    toast({
      title: t('revoked'),
      description: res.demo || initialDemo ? t('revoked_demo') : undefined,
      variant: 'success',
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant={open ? 'outline' : 'default'} onClick={() => setOpen((v) => !v)}>
          {open ? <X aria-hidden /> : <Plus aria-hidden />}
          {t('new')}
        </Button>
      </div>

      {open && (
        <form
          onSubmit={onCreate}
          className="space-y-4 rounded-xl border bg-card p-5"
        >
          <h2 className="text-sm font-semibold text-foreground">{t('new_title')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-marketer">{t('marketer')}</Label>
              <select
                id="inv-marketer"
                className={selectClass}
                value={marketerId}
                onChange={(e) => setMarketerId(e.target.value)}
              >
                <option value="">{t('select_marketer')}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">{t('email')}</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('email_placeholder')}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-role">{t('role')}</Label>
              <select
                id="inv-role"
                className={selectClass}
                value={role}
                onChange={(e) => setRole(e.target.value as MembershipRole)}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-1.5">
              <input
                type="checkbox"
                checked={crmAccess}
                onChange={(e) => setCrmAccess(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm">
                <span className="font-medium text-foreground">{t('crm_access')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('crm_access_help')}
                </span>
              </span>
            </label>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
              {pending ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<KeyRound />} title={t('empty_title')} description={t('empty_body')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full caption-bottom text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b text-xs font-medium text-muted-foreground">
                <th className="h-11 px-3 text-left">{t('col_marketer')}</th>
                <th className="h-11 px-3 text-left">{t('col_email')}</th>
                <th className="h-11 px-3 text-left">{t('col_role')}</th>
                <th className="h-11 px-3 text-left">{t('col_status')}</th>
                <th className="h-11 px-3 text-left">{t('col_expires')}</th>
                <th className="h-11 px-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr key={inv.id} className="border-b transition-colors last:border-0">
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    {inv.marketer_name}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{inv.email}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {ROLE_LABELS[inv.role]}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={INVITATION_STATUS_TONE[inv.status]}>
                      {INVITATION_STATUS_LABELS[inv.status]}
                    </Badge>
                  </td>
                  <td className={cn('px-3 py-2.5 text-xs text-muted-foreground')}>
                    {formatRelativeTime(inv.expires_at)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {inv.status === 'pending' && (
                      <Button variant="ghost" size="sm" onClick={() => onRevoke(inv.id)}>
                        {t('revoke')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
