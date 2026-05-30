import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';

/**
 * /dashboard — placeholder authenticated dashboard (RSC).
 * Reads the session server-side via the RLS-bound Supabase server client and
 * shows who is signed in. Real rank-adaptive widgets come in a later phase.
 */
export default async function DashboardPage() {
  const t = await getTranslations('dashboard');

  const supabase = createClient();
  // The (app) layout guards the session and the env, so supabase is non-null
  // and a user exists by the time this RSC renders.
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('welcome')}
          {user?.email ? ` — ${user.email}` : ''}
        </p>
      </div>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-medium text-card-foreground">
          {t('placeholderTitle')}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t('placeholderBody')}
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-background p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('signedInAs')}
            </dt>
            <dd className="mt-1 truncate font-mono text-sm tabular-nums text-foreground">
              {user?.email ?? t('noSession')}
            </dd>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('session')}
            </dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-foreground">
              {user?.id ? `${user.id.slice(0, 8)}…` : '—'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
