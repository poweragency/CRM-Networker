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
    },
  },
  plugins: [],
};

export default config;
