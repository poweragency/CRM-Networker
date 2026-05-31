'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Mail, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { InvitationContext } from '@/lib/data/invitation';
import { RANK_LABELS, ROLE_LABELS } from '@/lib/types/db';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { Separator } from '@/components/ui/separator';
import { AuthCard } from '../../_components/auth-card';
import { FormField } from '../../_components/form-field';
import { FormError } from '../../_components/form-error';

const MIN_LENGTH = 8;

const inviteSchema = z
  .object({
    password: z.string().min(MIN_LENGTH),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'] });

type InviteValues = z.infer<typeof inviteSchema>;

/**
 * Client activation surface for /invito/[token]. Owns the whole card so it can
 * swap cleanly between the activation form and the success state.
 *
 * Activation flow:
 *  - With env: invokes the `activate-account` Edge Function (doc 07 §4.1) with the
 *    raw token + chosen password. The function creates the auth.users login and
 *    calls accept_invitation(token_hash, user_id), binding the login to the
 *    EXISTING marketers profile (profile != account).
 *  - Without env: the activation is simulated so the landing is fully walkable
 *    (RESILIENCE).
 * Validation mirrors /reimposta-password (min length + match).
 */
export function InviteForm({
  token,
  demo,
  context,
}: {
  token: string;
  demo: boolean;
  context: InvitationContext;
}) {
  const t = useTranslations('auth');
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({
    defaultValues: { password: '', confirm: '' },
    mode: 'onSubmit',
  });

  async function onSubmit(values: InviteValues) {
    setServerError(null);

    const parsed = inviteSchema.safeParse(values);
    if (!parsed.success) {
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      // No env: simulate a successful activation so the landing stays walkable.
      setDone(true);
      return;
    }

    // doc 07 §4.1: the activate-account Edge Function creates the login and runs
    // accept_invitation(token_hash, user_id), binding it to the invited profile.
    const { error } = await supabase.functions.invoke('activate-account', {
      body: { token, password: parsed.data.password },
    });

    if (error) {
      setServerError(t('inviteError'));
      return;
    }

    setDone(true);
  }

  const backToLogin = (
    <Link
      href="/accedi"
      className="inline-flex items-center gap-1.5 hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {t('backToLogin')}
    </Link>
  );

  if (done) {
    return (
      <AuthCard
        title={t('inviteSuccessTitle')}
        icon={CheckCircle2}
        tone="success"
        footer={backToLogin}
      >
        <p className="text-center text-sm text-muted-foreground">
          {t('inviteSuccessBody')}
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
      title={t('inviteTitle')}
      subtitle={t('inviteSubtitle')}
      icon={Mail}
      footer={backToLogin}
    >
      {/* Invited-profile context. */}
      <div className="rounded-lg border bg-muted/40 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={context.displayName} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {context.displayName}
            </p>
            {context.email ? (
              <p className="truncate text-xs text-muted-foreground">
                {context.email}
              </p>
            ) : null}
          </div>
        </div>

        <Separator className="my-3" />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">{t('inviteOrgLabel')}</dt>
            <dd className="truncate font-medium text-foreground">
              {context.orgName}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">{t('inviteRoleLabel')}</dt>
            <dd>
              <Badge variant="secondary">{ROLE_LABELS[context.role]}</Badge>
            </dd>
          </div>
          <div className="col-span-2 space-y-1">
            <dt className="text-xs text-muted-foreground">{t('inviteRankLabel')}</dt>
            <dd>
              <RankBadge rank={context.rank} label={RANK_LABELS[context.rank]} />
            </dd>
          </div>
        </dl>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
        <FormField
          id="invite-password"
          type="password"
          revealable
          autoComplete="new-password"
          label={t('newPassword')}
          placeholder={t('newPasswordPlaceholder')}
          error={errors.password ? t('passwordTooShort') : undefined}
          {...register('password', { required: true, minLength: MIN_LENGTH })}
        />

        <FormField
          id="invite-confirm"
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

        {demo ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-center text-xs text-foreground">
            {t('inviteDemo')}
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t('inviteSubmitting') : t('inviteSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}
