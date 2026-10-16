'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ── Card ─────────────────────────────────────────────────────────────────────
// 1px borders over drop shadows; shadows are reserved for modals/popovers.

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // min-w-0 because a card is usually a grid/flex item, and the default
        // `min-width: auto` makes it refuse to shrink below its content —
        // a wide table inside then pushes the whole page sideways on mobile
        // instead of scrolling within its own container.
        'min-w-0 rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--color-border)] px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        {description && <p className="mt-1 text-xs muted">{description}</p>}
      </div>
      {/* shrink-0 keeps toolbar controls from being squashed on a wide card,
          but max-w-full stops a wide toolbar pushing the whole page sideways
          once flex-wrap has dropped it onto its own line on mobile. */}
      {action && <div className="min-w-0 max-w-full shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

// ── Form controls ────────────────────────────────────────────────────────────

export function Label({
  children,
  htmlFor,
  hint,
  required,
  id,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  id?: string;
}) {
  return (
    <label htmlFor={htmlFor} id={id} className="mb-1.5 block text-xs font-medium">
      {children}
      {required && (
        <span className="ms-0.5 text-alert" aria-hidden>
          *
        </span>
      )}
      {hint && <span className="ms-2 font-normal muted">{hint}</span>}
    </label>
  );
}
