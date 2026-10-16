'use client';

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

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-xs leading-relaxed muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Tab bar with proper tablist semantics and arrow-key navigation. The buttons
 * are explicitly type="button" so a tab inside a form never submits it.
 */
export function Tabs({
  tabs,
  active,
  onChange,
  label = 'Sections',
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
  label?: string;
}) {
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
    onChange(tabs[next].key);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="scrollbar-thin relative flex gap-1 overflow-x-auto border-b border-[color:var(--color-border)]"
    >
      {tabs.map((tab, index) => {
        const selected = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, index)}
            onClick={() => onChange(tab.key)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
              // Weight is constant so selecting a tab does not reflow the row.
              'font-medium',
              selected
                ? 'border-accent text-[color:var(--color-fg)]'
                : 'border-transparent muted hover:text-[color:var(--color-fg)]',
            )}
          >
            {tab.label}
            {tab.count != null && <span className="ms-1.5 text-xs muted">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label ?? 'Loading'}>
      <span
        aria-hidden
        className={cn(
          'inline-block h-4 w-4 animate-spin rounded-pill border-2 border-[color:var(--color-border)] border-t-accent',
          className,
        )}
      />
    </span>
  );
}

/** Centerd loading block for client components fetching their own data. */
export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Spinner className="h-5 w-5" />
      <p className="text-xs muted">{label}</p>
    </div>
  );
}

/** Inline error with a retry, so a failed fetch is never a blank screen. */
export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-card border border-alert/40">
        <AlertCircle className="h-5 w-5 text-alert" strokeWidth={1.75} />
      </div>
      <div>
        <h3 className="font-display text-sm font-semibold">Something went wrong</h3>
        <p className="mt-1 max-w-sm text-xs leading-relaxed muted">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
