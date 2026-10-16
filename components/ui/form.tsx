'use client';
import { Label } from '@/components/ui/card';

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

const CONTROL_BASE =
  'w-full rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-3 text-sm text-[color:var(--color-fg)] placeholder:text-[color:var(--color-fg-muted)] transition-colors duration-150 hover:border-[color:var(--color-fg-muted)] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-alert aria-[invalid=true]:focus:ring-alert';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL_BASE, 'h-9', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(CONTROL_BASE, 'min-h-[88px] resize-y py-2 leading-relaxed', className)}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(CONTROL_BASE, 'h-9 cursor-pointer appearance-none pe-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-fg-muted)]"
        strokeWidth={1.75}
      />
    </div>
  );
});

/**
 * Labeled form field.
 *
 * The generated id is injected into the *control*, not a wrapper div — putting
 * it on a wrapper meant `htmlFor` pointed at a non-labelable element, so no
 * input in the app had an associated label. The error is wired with
 * aria-describedby and aria-invalid so it is announced, not just colored red.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  /** Override when the control sets its own id. */
  htmlFor?: string;
}) {
  const uid = useId();
  const controlId = htmlFor ?? `${uid}-control`;
  const errorId = `${uid}-error`;
  const hintId = `${uid}-hint`;

  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as Record<string, unknown>).id ?? controlId,
        'aria-describedby':
          ((children.props as Record<string, unknown>)['aria-describedby'] as string) ||
          described ||
          undefined,
        'aria-invalid': error ? true : (children.props as Record<string, unknown>)['aria-invalid'],
        'aria-required': required || undefined,
      })
    : children;

  return (
    <div>
      <Label htmlFor={controlId} required={required}>
        {label}
        {hint && (
          <span id={hintId} className="ms-2 font-normal muted">
            {hint}
          </span>
        )}
      </Label>
      {control}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Toggle switch.
 *
 * The button is deliberately NOT wrapped in a <label>: <button> is a labelable
 * element, so a wrapping label re-dispatches the click and the toggle fires
 * twice, flipping straight back. The text is associated via aria-labeledby
 * instead, and kept mouse-clickable with its own handler.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}) {
  const uid = useId();
  const switchId = id ?? `${uid}-switch`;
  const labelId = `${uid}-label`;
  const descId = `${uid}-desc`;

  const toggle = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <div className={cn('flex items-center gap-2.5', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        aria-labeledby={label ? labelId : undefined}
        aria-describedby={description ? descId : undefined}
        aria-label={label ? undefined : 'Toggle'}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          // p-0 because a button's default padding shifts the knob's origin.
          'relative h-5 w-9 shrink-0 rounded-pill border p-0 transition-colors duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-elevated)]',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          checked
            ? 'border-accent bg-accent'
            : 'border-[color:var(--color-border)] bg-[color:var(--color-border)]',
        )}
      >
        <span
          aria-hidden
          className={cn(
            // left-0 anchors the knob to the track. Without it the element
            // falls back to its *static* position, which sits inside the
            // button's default padding — so the travel distance overshot and
            // the knob escaped the track's right edge.
            'pointer-events-none absolute start-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-pill bg-white shadow-sm transition-transform duration-150 ease-out',
            // Track inner width is 34px (36 − 2 border). 2 + 16 + 14 = 32, so
            // the knob lands just inside the far edge.
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>

      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <span
              id={labelId}
              onClick={toggle}
              className={cn('block select-none text-sm', !disabled && 'cursor-pointer')}
            >
              {label}
            </span>
          )}
          {description && (
            <span id={descId} className="block text-xs muted">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Badge / status ───────────────────────────────────────────────────────────
