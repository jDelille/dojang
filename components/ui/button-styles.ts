import { cn } from '@/lib/utils';

/**
 * Button styling as a pure class string.
 *
 * Deliberately NOT in button.tsx: that file is 'use client', and a server
 * component calling a function exported from a client module throws at
 * runtime. Server pages need this to style a next/link as a button —
 * wrapping a <Button> in a <Link> nests interactive content inside an anchor,
 * which is invalid HTML and breaks Space/Enter handling.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

// Amber is the primary CTA only — never a large fill (spec §3.1).
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-[color:var(--color-accent-fg)] hover:bg-accent-dark active:bg-accent-dark border border-transparent font-medium',
  secondary:
    'bg-[color:var(--color-elevated)] text-[color:var(--color-fg)] border border-[color:var(--color-border)] hover:bg-[color:var(--color-paper)] dark:hover:bg-white/5',
  ghost:
    'bg-transparent text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border border-transparent',
  danger: 'bg-alert text-white hover:opacity-90 border border-transparent font-medium',
  link: 'bg-transparent text-[color:var(--color-fg)] underline underline-offset-4 hover:text-accent-dark border-none p-0 h-auto',
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-sm gap-2',
  icon: 'h-9 w-9 p-0',
};

const BASE =
  'inline-flex items-center justify-center rounded-control whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-bg)] disabled:opacity-50 disabled:pointer-events-none';

export function buttonStyles({
  variant = 'secondary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(BASE, BUTTON_VARIANTS[variant], variant !== 'link' && BUTTON_SIZES[size], className);
}
