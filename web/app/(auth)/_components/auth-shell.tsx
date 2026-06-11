import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Zap, GitBranch, Route, BarChart3, FlaskConical, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * Branded auth shell — a cinematic, "tech-platform" login surface shared by every
 * (auth) page. A deep dark canvas with drifting indigo auroras, a faint technical
 * grid and floating particles (pure CSS, no JS → stays a server component) sits
 * behind a two-pane layout: a brand rail (left, ≥ lg) and the form card (right),
 * which floats in a soft accent glow. The card itself stays theme-aware (white in
 * light, glass in dark); the backdrop is intentionally dark for a premium feel.
 */

/** Deterministic particle field (fixed → SSR-stable, no hydration drift). */
const PARTICLES: ReadonlyArray<{ l: number; t: number; s: number; d: number; o: number }> = [
  { l: 8, t: 18, s: 3, d: 0, o: 0.5 },
  { l: 16, t: 72, s: 2, d: 1.6, o: 0.4 },
  { l: 23, t: 40, s: 4, d: 0.8, o: 0.6 },
  { l: 31, t: 86, s: 2, d: 2.4, o: 0.35 },
  { l: 38, t: 12, s: 3, d: 3.1, o: 0.5 },
  { l: 47, t: 60, s: 2, d: 1.1, o: 0.4 },
  { l: 54, t: 28, s: 5, d: 2.0, o: 0.55 },
  { l: 62, t: 80, s: 2, d: 0.4, o: 0.4 },
  { l: 69, t: 46, s: 3, d: 2.8, o: 0.5 },
  { l: 76, t: 16, s: 2, d: 1.3, o: 0.35 },
  { l: 83, t: 66, s: 4, d: 0.6, o: 0.55 },
  { l: 90, t: 34, s: 2, d: 3.4, o: 0.4 },
  { l: 95, t: 84, s: 3, d: 1.9, o: 0.5 },
  { l: 43, t: 92, s: 2, d: 2.6, o: 0.35 },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('auth');

  const points = [
    { icon: GitBranch, label: t('brandPoint1') },
    { icon: Route, label: t('brandPoint2') },
    { icon: BarChart3, label: t('brandPoint3') },
  ];

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#070710] text-white lg:flex-row">
      {/* ───────── Animated backdrop (whole screen) ───────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* drifting indigo / violet auroras */}
        <div className="absolute -left-40 -top-40 h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.32),transparent_60%)] blur-3xl animate-aurora" />
        <div
          className="absolute -right-48 top-1/4 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgba(79,70,229,0.28),transparent_60%)] blur-3xl animate-aurora"
          style={{ animationDelay: '-6s' }}
        />
        <div
          className="absolute -bottom-48 left-1/3 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.22),transparent_60%)] blur-3xl animate-aurora"
          style={{ animationDelay: '-11s' }}
        />
        {/* technical grid, faded toward the edges */}
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(#ffffff_1px,transparent_1px),linear-gradient(90deg,#ffffff_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
        {/* floating particles */}
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white animate-glow-pulse"
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              height: p.s,
              width: p.s,
              opacity: p.o,
              animationDelay: `${p.d}s`,
              boxShadow: '0 0 8px 1px rgba(165,180,252,0.6)',
            }}
          />
        ))}
        {/* hairline top sheen */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>

      {/* ───────── Brand rail (≥ lg) ───────── */}
      <aside className="relative hidden flex-col justify-between p-12 lg:flex lg:w-[46%] lg:max-w-2xl xl:p-16">
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_10px_40px_-8px_rgba(79,70,229,0.8)]">
            <Zap className="h-6 w-6 text-white" aria-hidden />
          </span>
          <span className="text-xl font-bold tracking-tight">Gen X</span>
        </div>

        <div className="max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white/70 backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-300" aria-hidden />
            CRM &amp; Business Intelligence
          </span>
          <p className="mt-5 bg-gradient-to-br from-white to-white/60 bg-clip-text text-3xl font-bold leading-[1.15] tracking-tight text-transparent xl:text-4xl">
            {t('brandTagline')}
          </p>
          <ul className="mt-9 space-y-3">
            {points.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white/85 backdrop-blur transition-colors hover:border-white/20 hover:bg-white/[0.07]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-200 ring-1 ring-inset ring-indigo-400/30">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div>
          {!isSupabaseConfigured ? (
            <div
              className="flex items-start gap-2.5 rounded-lg border border-white/15 bg-white/[0.06] p-3 text-xs text-white/80 backdrop-blur"
              role="status"
            >
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" aria-hidden />
              <span>
                <span className="font-semibold">{t('demoTitle')}</span> — {t('demoBody')}
              </span>
            </div>
          ) : (
            <p className="text-xs text-white/45">
              © {new Date().getFullYear()} Gen X
            </p>
          )}
        </div>
      </aside>

      {/* ───────── Form pane ───────── */}
      <div className="relative flex flex-1 flex-col">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />
        </div>

        {/* Mobile brand lockup (rail hidden < lg) */}
        <div className="flex items-center gap-2.5 px-6 pt-6 lg:hidden">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_8px_30px_-8px_rgba(79,70,229,0.8)]">
            <Zap className="h-5 w-5 text-white" aria-hidden />
          </span>
          <span className="text-base font-bold tracking-tight">Gen X</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          {/* Card + soft accent glow behind it */}
          <div className="relative w-full max-w-md">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.30),transparent_70%)] blur-2xl"
            />
            {children}
          </div>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-4 px-6 pb-4 text-xs text-white/45">
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/cookie" className="hover:text-white">Cookie</Link>
          <Link href="/termini" className="hover:text-white">Termini</Link>
        </nav>

        <p className="px-6 pb-6 text-center text-xs text-white/40 lg:hidden">
          © {new Date().getFullYear()} Gen X
        </p>
      </div>
    </main>
  );
}
