'use client';
export type ToastTone = 'neutral' | 'success' | 'alert';

type ToastItem = { id: number; message: string; tone: ToastTone };

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

export function Toast({
  message,
  tone = 'neutral',
  onDismiss,
}: {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
}) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    // Errors are not auto-dismissed: they usually need reading and acting on,
    // and the operator may be looking elsewhere when one appears.
    if (tone === 'alert') return;
    const timer = window.setTimeout(() => dismiss.current?.(), 4500);
    return () => window.clearTimeout(timer);
    // Deliberately not keyed on onDismiss — a new closure identity on every
    // parent render would otherwise restart the timer forever under polling.
  }, [tone]);

  const Icon = tone === 'alert' ? AlertCircle : Check;

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-2.5 rounded-card border px-4 py-3 text-sm shadow-popover',
        'bg-[color:var(--color-surface)] dark:bg-[color:var(--color-surface-dark)]',
        tone === 'alert'
          ? 'border-alert/40'
          : tone === 'success'
            ? 'border-success/40'
            : 'border-[color:var(--color-border)]',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          tone === 'alert' ? 'text-alert' : tone === 'success' ? 'text-success' : 'muted',
        )}
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1 leading-relaxed">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-me-1 shrink-0 rounded-control p-0.5 muted transition-colors hover:text-[color:var(--color-fg)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

const MAX_TOASTS = 3;

/**
 * Toast queue.
 *
 * The live regions are mounted permanently and empty — a region inserted into
 * the DOM together with its text is generally not announced, so the message has
 * to arrive into a region that was already there.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'neutral') => {
    nextId.current += 1;
    const item = { id: nextId.current, message, tone };
    setToasts((current) => [...current, item].slice(-MAX_TOASTS));
  }, []);

  const clear = useCallback(() => setToasts([]), []);

  const polite = toasts.filter((t) => t.tone !== 'alert').map((t) => t.message).join('. ');
  const assertive = toasts.filter((t) => t.tone === 'alert').map((t) => t.message).join('. ');

  return {
    toasts,
    show,
    clear,
    node: (
      <>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {polite}
        </div>
        <div className="sr-only" aria-live="assertive" aria-atomic="true">
          {assertive}
        </div>
        {toasts.length > 0 && (
          <div className="pointer-events-none fixed bottom-5 end-5 z-[60] flex flex-col-reverse items-end gap-2">
            {toasts.map((t) => (
              <Toast
                key={t.id}
                message={t.message}
                tone={t.tone}
                onDismiss={() => dismiss(t.id)}
              />
            ))}
          </div>
        )}
      </>
    ),
  };
}

// ── Page furniture ───────────────────────────────────────────────────────────
