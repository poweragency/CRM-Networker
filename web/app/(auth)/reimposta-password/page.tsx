'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { ShieldCheck, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthCard } from '../_components/auth-card';
import { FormField } from '../_components/form-field';
import { FormError } from '../_components/form-error';

const MIN_LENGTH = 8;

const resetSchema = z
  .object({
    password: z.string().min(MIN_LENGTH),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'] });

type ResetValues = z.infer<typeof resetSchema>;

/** Auth state while we probe for a recovery session. */
type SessionState = 'checking' | 'ready' | 'missing';

/**
 * /reimposta-password — set a new password from the recovery session (ADR-008).
 *
 * Supabase opens the user in a PASSWORD_RECOVERY session when they follow the
 * email link (detectSessionInUrl). We confirm a session exists, then call
 * updateUser({ password }). Validation: min length + match. Without env (or no
 * recovery session) the form still renders in demo mode so the flow is walkable;
 * a missing/expired link routes the user back to request a new one.
 */
export default function ResetPasswordPage() {
  const t = useTranslations('auth');
  const [session, setSession] = useState<SessionState>('checking');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    defaultValues: { password: '', confirm: '' },
    mode: 'onSubmit',
  });

  // Probe for a recovery session (set by the email link). In demo mode we treat
  // the page as ready so the UI is fully demonstrable without env.
  useEffect(() => {
    let active = true;
    const supabase = createClient();

    if (!supabase) {
      setSession('ready');
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ? 'ready' : 'missing');
    });

    // A PASSWORD_RECOVERY event can arrive slightly after mount as the URL hash
    // is parsed; flip to ready when it does.
    const { data: sub } = supabase.auth.onAuthStateChange((event, current) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || current) {
        setSession('ready');
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(values: ResetValues) {
    setServerError(null);

    const parsed = resetSchema.safeParse(values);
    if (!parsed.success) {
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      // Demo: simulate a successful update.
      setDone(true);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (error) {
      // "Leaked password protection" rejects weak/breached passwords with a
      // weak_password code — show an actionable message instead of the generic one.
      const code = ((error as { code?: string }).code ?? '').toLowerCase();
      const msg = (error.message ?? '').toLowerCase();
      const weak =
        code === 'weak_password' ||
        msg.includes('weak') ||
        msg.includes('leaked') ||
        msg.includes('pwned') ||
        msg.includes('breach') ||
        msg.includes('compromis');
      setServerError(weak ? t('resetWeakPassword') : t('resetError'));
      return;
    }

    setDone(true);
  }

  if (session === 'checking') {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <Skeleton className="mx-auto mb-6 h-11 w-11 rounded-xl" />
        <Skeleton className="mx-auto mb-2 h-6 w-40" />
        <Skeleton className="mx-auto mb-8 h-4 w-56" />
        <div className="space-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    );
  }

  if (session === 'missing') {
    return (
      <AuthCard
        title={t('resetNoSessionTitle')}
        subtitle={t('resetNoSessionBody')}
        icon={AlertCircle}
        tone="danger"
        footer={
          <Link href="/accedi" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('backToLogin')}
          </Link>
        }
      >
        <Link href="/recupera-password" className="block">
          <Button type="button" className="w-full">
            {t('resetRequestNew')}
          </Button>
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        title={t('resetSuccessTitle')}
        icon={CheckCircle2}
        tone="success"
      >
        <p className="text-center text-sm text-muted-foreground">
          {t('resetSuccessBody')}
        </p>
        <Link href="/accedi" className="mt-6 block">
          <Button type="button" className="w-full">
            {t('resetGoToLogin')}
          </Button>
        </Link>
      </AuthCard>
    );
  }

  const passwordValue = watch('password');

  return (
    <AuthCard
      title={t('resetTitle')}
      subtitle={t('resetSubtitle')}
      icon={ShieldCheck}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          id="password"
          type="password"
          revealable
          autoComplete="new-password"
          label={t('newPassword')}
          placeholder={t('newPasswordPlaceholder')}
          error={errors.password ? t('passwordTooShort') : undefined}
          {...register('password', { required: true, minLength: MIN_LENGTH })}
        />

        <FormField
          id="confirm"
          type="password"
          revealable
          autoComplete="new-password"
          label={t('confirmPassword')}
          placeholder={t('confirmPasswordPlaceholder')}
          error={errors.confirm ? t('passwordMismatch') : undefined}
          {...register('confirm', {
            required: true,
            validate: (v) => v === passwordValue,
          })}
        />

        <FormError message={serverError} icon={AlertCircle} />

        {!isSupabaseConfigured ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-center text-xs text-foreground">
            {t('resetDemo')}
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t('resetSubmitting') : t('resetSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}
