'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/env';
import { ConfigNotice } from '@/components/config-notice';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * /accedi — real email/password login (ADR-008 route).
 * Calls supabase.auth.signInWithPassword; on success redirects to the
 * `redirect` param or /dashboard. OAuth buttons are visible-but-disabled
 * (ADR-004: MFA/OAuth present but not enforced in v1).
 */
/**
 * Page wrapper: useSearchParams() (inside LoginForm) requires a Suspense
 * boundary for static prerendering.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginCardSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="h-40 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginValues) {
    setServerError(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setServerError(t('genericError'));
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setServerError(t('genericError'));
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      setServerError(t('genericError'));
      return;
    }

    const redirectTo = searchParams.get('redirect') ?? '/dashboard';
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-card-foreground">
          {t('loginTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('loginSubtitle')}
        </p>
      </div>

      {!isSupabaseConfigured && (
        <div className="mb-5">
          <ConfigNotice />
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            {t('email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            {...register('email', { required: true })}
          />
          {errors.email && (
            <p className="text-xs text-danger">{t('genericError')}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            {t('password')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder={t('passwordPlaceholder')}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            {...register('password', { required: true })}
          />
        </div>

        {serverError && (
          <p className="text-sm text-danger" role="alert">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isSupabaseConfigured}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('orDivider')}
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* ADR-004: OAuth present but not enforced — visible-but-disabled in v1. */}
      <div className="space-y-2">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full cursor-not-allowed rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground opacity-60"
        >
          {t('oauthGoogle')}
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full cursor-not-allowed rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground opacity-60"
        >
          {t('oauthMicrosoft')}
        </button>
      </div>
    </div>
  );
}
