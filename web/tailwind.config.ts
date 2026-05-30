import type { Config } from 'tailwindcss';

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
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        info: 'hsl(var(--info))',
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
        },
        rank: {
          executive: 'hsl(var(--rank-executive))',
          consultant: 'hsl(var(--rank-consultant))',
          teamLeader: 'hsl(var(--rank-team-leader))',
          seniorTeamLeader: 'hsl(var(--rank-senior-team-leader))',
          executiveTeamLeader: 'hsl(var(--rank-executive-team-leader))',
          vicePresident: 'hsl(var(--rank-vice-president))',
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
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'scale-in': 'scale-in 120ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
