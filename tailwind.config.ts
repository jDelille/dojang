import type { Config } from 'tailwindcss';

/**
 * "Front Desk" design system — matches the Vercel design outline.
 *
 * Colors resolve through CSS custom properties so a white-label workspace can
 * override --color-accent at runtime without a rebuild.
 *
 * They are wrapped in color-mix() with the <alpha-value> placeholder because a
 * bare `var(--x)` cannot carry an opacity modifier: Tailwind silently emits
 * NOTHING for `bg-accent/15`, `bg-ink/40` and friends, which is how the modal
 * shipped with no scrim at all. color-mix keeps the single hex token (so the
 * runtime accent override still works) and makes every `/opacity` utility real.
 */
const alpha = (variable: string) =>
  `color-mix(in srgb, var(${variable}) calc(<alpha-value> * 100%), transparent)`;

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
        ink: alpha('--color-ink'),
        paper: alpha('--color-paper'),
        accent: {
          DEFAULT: alpha('--color-accent'),
          dark: alpha('--color-accent-dark'),
        },
        slate: {
          DEFAULT: alpha('--color-slate'),
          100: alpha('--color-slate-100'),
        },
        canvas: alpha('--color-canvas'),
        panel: alpha('--color-panel'),
        inset: alpha('--color-inset'),
        nav: alpha('--color-nav'),
        agent: alpha('--color-agent'),
        live: alpha('--color-live'),
        success: alpha('--color-success'),
        alert: alpha('--color-alert'),
        warning: alpha('--color-warning'),
        surface: {
          DEFAULT: alpha('--color-surface'),
          dark: alpha('--color-surface-dark'),
        },
        // Theme-independent overlay. `ink` flips to near-white in dark mode,
        // so it must never be used for a scrim.
        scrim: 'rgb(15 17 21 / <alpha-value>)',
      },
      // Every step the codebase actually uses — Tailwind's default scale omits
      // 12 and 15, and a missing step emits no CSS at all.
      opacity: {
        4: '0.04',
        5: '0.05',
        6: '0.06',
        8: '0.08',
        10: '0.1',
        12: '0.12',
        15: '0.15',
        20: '0.2',
        25: '0.25',
        30: '0.3',
        40: '0.4',
        50: '0.5',
        55: '0.55',
        60: '0.6',
        70: '0.7',
        75: '0.75',
        80: '0.8',
        90: '0.9',
        95: '0.95',
        100: '1',
      },
      fontFamily: {
        // Marketing accent only — see app/layout.tsx.
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        display: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1.1' }],
      },
      borderRadius: {
        card: '10px',
        control: '6px',
        pill: '999px',
      },
      spacing: {
        // 8px base grid
        '18': '4.5rem',
        '22': '5.5rem',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)',
      },
      boxShadow: {
        // Shadows are reserved for modals/popovers only.
        popover: '0 4px 24px -4px rgb(15 17 21 / 0.12), 0 1px 3px rgb(15 17 21 / 0.06)',
        modal: '0 24px 64px -12px rgb(15 17 21 / 0.28)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scrim-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms cubic-bezier(0, 0, 0.2, 1)',
        'scrim-in': 'scrim-in 150ms ease-out',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
