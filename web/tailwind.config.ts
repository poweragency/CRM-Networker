import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

// Token-driven theme: all colors/radius are HSL CSS variables (see app/globals.css),
// consumed via hsl(var(--token)). Mirrors doc 08 §6.2.
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          50: 'hsl(var(--primary-50))',
          100: 'hsl(var(--primary-100))',
          600: 'hsl(var(--primary-600))',
          700: 'hsl(var(--primary-700))',
        },
        nav: {
          DEFAULT: 'hsl(var(--nav))',
          foreground: 'hsl(var(--nav-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--on-success))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--on-warning))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          foreground: 'hsl(var(--on-danger))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--on-info))',
        },
        stage: {
          conoscitiva: 'hsl(var(--stage-conoscitiva))',
          businessInfo: 'hsl(var(--stage-business-info))',
          followUp: 'hsl(var(--stage-follow-up))',
          closing: 'hsl(var(--stage-closing))',
          checkSoldi: 'hsl(var(--stage-check-soldi))',
          iscrizione: 'hsl(var(--stage-iscrizione))',
        },
        branch: {
          global: 'hsl(var(--branch-global))',
          left: 'hsl(var(--branch-left))',
          right: 'hsl(var(--branch-right))',
          'left-foreground': 'hsl(var(--branch-left-foreground))',
          'right-foreground': 'hsl(var(--branch-right-foreground))',
        },
        rank: {
          executive: 'hsl(var(--rank-executive))',
          consultant: 'hsl(var(--rank-consultant))',
          teamLeader: 'hsl(var(--rank-team-leader))',
          seniorTeamLeader: 'hsl(var(--rank-senior-team-leader))',
          executiveTeamLeader: 'hsl(var(--rank-executive-team-leader))',
          vicePresident: 'hsl(var(--rank-vice-president))',
          seniorVicePresident: 'hsl(var(--rank-senior-vice-president))',
          executiveVicePresident: 'hsl(var(--rank-executive-vice-president))',
          globalDirector: 'hsl(var(--rank-global-director))',
        },
        package: {
          signature: 'hsl(var(--package-signature))',
          premium: 'hsl(var(--package-premium))',
          standard: 'hsl(var(--package-standard))',
          starter: 'hsl(var(--package-starter))',
        },
        activity: {
          hot: 'hsl(var(--activity-hot))',
          warm: 'hsl(var(--activity-warm))',
          cold: 'hsl(var(--activity-cold))',
          dormant: 'hsl(var(--activity-dormant))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 0.25rem)',
      },
      boxShadow: {
        // Low-chrome elevation ramp (premium SaaS). Dark relies on borders.
        xs: '0 1px 2px rgba(16, 24, 40, 0.04)',
        sm: '0 1px 3px rgba(16, 24, 40, 0.06)',
        md: '0 4px 12px rgba(16, 24, 40, 0.08)',
        lg: '0 12px 32px rgba(16, 24, 40, 0.12)',
        // Gamified accent glows (achievement / leaderboard / primary actions).
        glow: '0 0 0 1px hsl(var(--primary) / 0.25), 0 10px 30px -8px hsl(var(--primary) / 0.5)',
        'glow-warning': '0 0 0 1px hsl(var(--warning) / 0.3), 0 12px 32px -8px hsl(var(--warning) / 0.55)',
        'glow-success': '0 0 0 1px hsl(var(--success) / 0.3), 0 12px 32px -8px hsl(var(--success) / 0.5)',
      },
      transitionDuration: {
        fast: '80ms',
        base: '150ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      spacing: {
        rail: 'var(--rail-w)',
        side: 'var(--side-w)',
        drawer: 'var(--drawer-w)',
        topbar: 'var(--topbar-h)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(2rem)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // ─── Gamification motion ───────────────────────────────────────────
        pop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        sheen: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.08)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        'rank-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'scale-in': 'scale-in 120ms ease-out',
        'slide-in-right': 'slide-in-right 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        pop: 'pop 360ms cubic-bezier(0.16, 1, 0.3, 1)',
        sheen: 'sheen 2.4s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        'rank-in': 'rank-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [typography],
};

export default config;
