'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import { activateCrmAccessAction } from '@/app/(app)/genealogia/actions';

/**
 * ActivateCrmDialog — the "Attiva accesso CRM" window. Collects the login email +
 * password for the target marketer and commits via `activateCrmAccessAction`.
 * The password is sent once to create the login (Supabase Auth in prod) and is
 * never stored in our own tables. Demo-safe: in demo mode the action records only
 * the email and reports a simulated success.
 */

export interface ActivateCrmTarget {
  marketerId: string;
  name: string;
}

export interface ActivateCrmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ActivateCrmTarget | null;
  /** Called after a successful activation (parent can flag the node done). */
  onActivated: (marketerId: string) => void;
}

export function ActivateCrmDialog({
  open,
  onOpenChange,
  target,
  onActivated,
}: ActivateCrmDialogProps) {
  const t = useTranslations('genealogia');
  const { toast } = useToast();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPwd, setShowPwd] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset the form each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setEmail('');
      setPassword('');
      setShowPwd(false);
      setError(null);
      setSaving(false);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    setSaving(true);
    const res = await activateCrmAccessAction({
      marketerId: target.marketerId,
      email,
      password,
    });
    setSaving(false);
    if (!res.ok) {
      setError(
        res.errorKey === 'password_short'
          ? t('activate_password_short')
          : t('activate_email_invalid'),
      );
      return;
    }
    onActivated(target.marketerId);
    toast({
      title: t('activate_crm_done'),
      description: res.demo ? t('activate_crm_demo') : undefined,
      variant: 'success',
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('activate_crm')}
      description={target ? t('activate_subtitle', { name: target.name }) : undefined}
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
          <Button type="submit" form="activate-crm-form" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <KeyRound aria-hidden />
            )}
            {saving ? t('activate_crm_loading') : t('activate_submit')}
          </Button>
        </>
      }
    >
      <form id="activate-crm-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="ac-email" className="mb-1.5 block">
            {t('activate_email')}
          </Label>
          <Input
            id="ac-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="nome@azienda.it"
            autoComplete="off"
            aria-invalid={Boolean(error)}
          />
        </div>

        <div>
          <Label htmlFor="ac-password" className="mb-1.5 block">
            {t('activate_password')}
          </Label>
          <div className="relative">
            <Input
              id="ac-password"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t('activate_password_ph')}
              autoComplete="new-password"
              aria-invalid={Boolean(error)}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? t('activate_password_hide') : t('activate_password_show')}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {showPwd ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('activate_security_note')}
        </p>
      </form>
    </Modal>
  );
}
