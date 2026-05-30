'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { KeyRound, MailCheck, ArrowLeft, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { AuthCard } from '../_components/auth-card';
import { FormField } from '../_components/form-field';
import { FormError } from '../_components/form-error';

const recoverSchema = z.object({
  email: z.string().email(),
});

type RecoverValues = z.infer<typeof recoverSchema>;

/**
 * /recupera-password — request a password-reset email (ADR-008).
 * Calls supabase.auth.resetPasswordForEmail with a redirect back to
 * /reimposta-password where the recovery session lets the user set a new
 * password. Always shows a neutral success state (no account enumeration).
 * Without env, the flow is simulated and a demo notice is shown (RESILIENCE).
 */
export default function RecoverPasswordPage() {
  const t = useTranslations('auth');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecoverValues>({
    defaultValues: { email: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: RecoverValues) {
    setServerError(null);

    const parsed = recoverSchema.safeParse(values);
    if (!parsed.success) {
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      // Demo: simulate a successful send so the UI flow is fully walkable.
      setSentTo(parsed.data.email);
      return;
    }

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/reimposta-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      redirectTo ? { redirectTo } : undefined,
    );

    if (error) {
      setServerError(t('recoverError'));
      return;
    }

    setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <AuthCard
        title={t('recoverSuccessTitle')}
        icon={MailCheck}
        tone="success"
        footer={
          <Link href="/accedi" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('backToLogin')}
          </Link>
        }
      >
        <p className="text-center text-sm text-muted-foreground">
          {t('recoverSuccessBody', { email: sentTo })}
        </p>

        {!isSupabaseConfigured ? (
          <p className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-center text-xs text-foreground">
            {t('recoverDemo')}
          </p>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="mt-6 w-full"
          onClick={() => setSentTo(null)}
        >
          {t('recoverResend')}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('recoverTitle')}
      subtitle={t('recoverSubtitle')}
      icon={KeyRound}
      footer={
        <Link href="/accedi" className="inline-flex items-center gap-1.5 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('backToLogin')}
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          id="email"
          type="email"
          autoComplete="email"
          label={t('email')}
          placeholder={t('emailPlaceholder')}
          error={errors.email ? t('emailInvalid') : undefined}
          {...register('email', { required: true, pattern: /.+@.+\..+/ })}
        />

        <FormError message={serverError} icon={AlertCircle} />

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t('recoverSubmitting') : t('recoverSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}
