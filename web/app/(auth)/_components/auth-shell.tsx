import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Network, GitBranch, Route, BarChart3, FlaskConical } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * Branded split shell shared by every (auth) page (doc 08 §2: centered/no-sidebar
 * auth surfaces, here upgraded to a premium two-pane layout — brand rail + form).
 *
 * - Left rail: gradient brand panel with product proof points. Hidden < lg.
 * - Right pane: the form card, vertically centered, responsive.
 * - Theme toggle (light/dark/system) is always reachable, top-right.
 * - When Supabase env is missing the rail surfaces a discreet "modalità demo"
 *   strip so the reduced auth behaviour is explained, not surprising (RESILIENCE).
 *
 * Server component (only next-intl, which is RSC-safe via the provider). The
 * ThemeToggle it embeds is a client component and hydrates independently.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');

  const points = [
    { icon: GitBranch, label: t('brandPoint1') },
    { icon: Route, label: t('brandPoint2') },
    { icon: BarChart3, label: t('brandPoint3') },
  ];

  return (
    <main className="relative flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Brand rail — gradient, hidden on small screens. */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:w-[44%] lg:max-w-2xl lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(120% 120% at 0% 0%, hsl(var(--branch-left) / 0.55) 0%, transparent 45%), radial-gradient(120% 120% at 100% 100%, hsl(var(--branch-right) / 0.5) 0%, transparent 50%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/15 ring-1 ring-inset ring-primary-foreground/25">
              <Network className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              {tc('appName')}
            </span>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="text-2xl font-semibold leading-snug tracking-tight xl:text-3xl">
            {t('brandTagline')}
          </p>
          <ul className="mt-8 space-y-3.5">
            {points.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-foreground/15">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          {!isSupabaseConfigured ? (
            <div
              className="flex items-start gap-2.5 rounded-lg bg-primary-foreground/10 p-3 text-xs ring-1 ring-inset ring-primary-foreground/20"
              role="status"
            >
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{t('demoTitle')}</span> — {t('demoBody')}
              </span>
            </div>
          ) : (
            <p className="text-xs text-primary-foreground/70">
              © {new Date().getFullYear()} {tc('appName')}
            </p>
          )}
        </div>
      </aside>

      {/* Form pane. */}
      <div className="relative flex flex-1 flex-col">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>

        {/* Mobile brand lockup (rail is hidden < lg). */}
        <div className="flex items-center gap-2 px-6 pt-6 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Network className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight">
            {tc('appName')}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <p className="px-6 pb-6 text-center text-xs text-muted-foreground lg:hidden">
          <Link href="/accedi" className="hover:text-foreground">
            {tc('appName')}
          </Link>{' '}
          · © {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
