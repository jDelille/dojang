'use client';
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'alert' | 'warning' | 'info';

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AlertCircle, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Badge text sits on a wash of its own hue at 12px, so the light-mode
 * foreground is a deliberately darker step than the token — the token colors
 * land around 2.4:1 on their own tint, well under the 4.5:1 small-text floor.
 * Dark mode goes the other way, lightening against the dark surface.
 */
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[color:var(--color-border)] text-[color:var(--color-fg-muted)]',
  accent: 'bg-accent/15 text-[#7a4e14] dark:text-[#f0b45c]',
  success: 'bg-success/12 text-[#2c6b45] dark:text-[#7cc79a]',
  alert: 'bg-alert/12 text-[#963535] dark:text-[#e39494]',
  warning: 'bg-warning/15 text-[#7a5410] dark:text-[#e0b45c]',
  info: 'bg-slate/12 text-[#414a57] dark:text-[#b6bec9]',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Filled dot — the one place filled icon variants are allowed (spec §3.3). */
export function StatusDot({
  tone = 'neutral',
  pulse,
  className,
  label,
}: {
  tone?: BadgeTone;
  pulse?: boolean;
  className?: string;
  label?: string;
}) {
  const color = {
    neutral: 'bg-slate',
    accent: 'bg-accent',
    success: 'bg-success',
    alert: 'bg-alert',
    warning: 'bg-warning',
    info: 'bg-slate',
  }[tone];

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block h-2 w-2 rounded-pill', color, pulse && 'animate-pulse-dot', className)}
    />
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

export function Table({
  children,
  className,
  caption,
  minWidth = 640,
}: {
  children: ReactNode;
  className?: string;
  caption?: string;
  /**
   * Width below which the table scrolls instead of squashing. Lower it for
   * tables in a half-width card — the 640px default clips their last column
   * with no room to scroll back.
   */
  minWidth?: number;
}) {
  // `relative` makes this the containing block for absolutely-positioned
  // descendants — notably .sr-only captions and labels. Without it they
  // resolve against the document and, sitting at the table's full width,
  // drag the whole page sideways on mobile.
  return (
    <div className="scrollbar-thin relative overflow-x-auto">
      {/* min-w lets overflow-x-auto engage; w-full alone just shrinks to fit. */}
      <table
        style={{ minWidth: `${minWidth}px` }}
        className={cn(
          'w-full text-sm [&>tbody>tr:last-child>td]:border-0',
          className,
        )}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
  scope = 'col',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  scope?: 'col' | 'row';
}) {
  return (
    <th
      scope={scope}
      className={cn(
        'border-b border-[color:var(--color-border)] px-4 py-2.5 text-xs font-medium muted',
        align === 'right' && 'text-end',
        align === 'center' && 'text-center',
        align === 'left' && 'text-start',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'border-b border-[color:var(--color-border)] px-4 py-3',
        align === 'right' && 'text-end',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      className={cn(
        'transition-colors duration-150',
        // Only shade rows that actually do something when clicked.
        onClick &&
          'cursor-pointer hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent dark:hover:bg-white/[0.03]',
        className,
      )}
    >
      {children}
    </tr>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

/**
 * `icon` takes a rendered element, not a component type — a server component
 * cannot pass a function across the client boundary, and several pages that
 * use this are server components.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div
          aria-hidden
          className="mb-4 flex h-11 w-11 items-center justify-center rounded-card border border-[color:var(--color-border)] text-[color:var(--color-fg-muted)] [&>svg]:h-5 [&>svg]:w-5"
        >
          {icon}
        </div>
      )}
      <h3 className="font-display text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

/** Nested modals must not each restore body scroll on close, so lock by count. */
