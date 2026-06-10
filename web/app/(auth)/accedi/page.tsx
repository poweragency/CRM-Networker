'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { LogIn, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthCard } from '../_components/auth-card';
import { FormField } from '../_components/form-field';
import { FormError } from '../_components/form-error';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * /accedi — real email/password login (ADR-008 route).
 * Calls supabase.auth.signInWithPassword; on success redirects to the
 * `redirect` param or /dashboard.
 *
 * useSearchParams() (inside LoginForm) requires a Suspense boundary for static
 * prerendering.
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
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <Skeleton className="mx-auto mb-6 h-11 w-11 rounded-xl" />
        <Skeleton className="mx-auto mb-2 h-6 w-32" />
        <Skeleton className="mx-auto mb-8 h-4 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  // Keeps the button in its loading state from a successful sign-in until the
  // navigation actually completes (the component unmounts), instead of letting
  // react-hook-form's isSubmitting flip back to false and flash "Accedi".
  const [redirecting, setRedirecting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
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
      // No env → cannot authenticate; surface a clear message (RESILIENCE).
      setServerError(t('demoBody'));
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      // Give actionable feedback for the non-credential cases (rate limit, email
      // not confirmed); keep the generic message for bad credentials so we don't
      // leak which emails exist (anti-enumeration).
      const status = (error as { status?: number }).status;
      const code = (error as { code?: string }).code;
      if (status === 429 || code === 'over_request_rate_limit') {
        setServerError(t('rateLimited'));
      } else if (code === 'email_not_confirmed') {
        setServerError(t('emailNotConfirmed'));
      } else {
        setServerError(t('genericError'));
      }
      return;
    }

    // Only allow site-relative redirects (block open-redirect via //evil.com or
    // absolute URLs in the `redirect` param).
    const rawRedirect = searchParams.get('redirect') ?? '/impostazioni';
    const redirectTo =
      rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
        ? rawRedirect
        : '/impostazioni';
    // HARD navigation (not router.replace + refresh): a full document load
    // guarantees the browser sends the auth cookies that signInWithPassword just
    // wrote, so the middleware/server see the session on the very first request.
    // A soft navigation could run the middleware before those cookies propagated →
    // it saw no user, bounced back to /accedi, and the page appeared "stuck" until a
    // manual refresh (more likely after inactivity, when the old session was stale).
    // `replace` keeps /accedi out of the history (back button won't return to login).
    setRedirecting(true);
    window.location.replace(redirectTo);
  }

  return (
    <AuthCard title={t('loginTitle')} subtitle={t('loginSubtitle')} icon={LogIn}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          id="email"
          type="email"
          autoComplete="email"
          label={t('email')}
          placeholder={t('emailPlaceholder')}
          error={errors.email ? t('emailInvalid') : undefined}
          {...register('email', {
            required: true,
            pattern: /.+@.+\..+/,
          })}
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-sm font-medium leading-none text-foreground"
            >
              {t('password')}
            </label>
            <Link
              href="/recupera-password"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          </div>
          <FormField
            id="password"
            type="password"
            revealable
            autoComplete="current-password"
            placeholder={t('passwordPlaceholder')}
            error={errors.password ? t('passwordRequired') : undefined}
            {...register('password', { required: true })}
          />
        </div>

        <FormError message={serverError} icon={AlertCircle} />

        <Button
          type="submit"
          disabled={isSubmitting || redirecting}
          className="w-full"
        >
          <LogIn aria-hidden />
          {isSubmitting || redirecting ? t('submitting') : t('submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
