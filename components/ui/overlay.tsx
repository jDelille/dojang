'use client';

/** Nested modals must not each unlock the page scroll on close. */
let scrollLockCount = 0;

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

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  /**
   * When provided the body and footer are wrapped in a <form>, so Enter in a
   * text field submits and a footer button with type="submit" works.
   */
  onSubmit?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  // A pointer drag that starts inside and ends on the backdrop must not close.
  const backdropArmed = useRef(false);
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      // Focus trap: cycle within the dialog rather than escaping to the page.
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!nodes.length) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;

    scrollLockCount += 1;
    if (scrollLockCount === 1) {
      // Compensate for the scrollbar we are about to hide, or the whole page
      // jumps sideways as the dialog opens.
      const gap = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    }
    document.addEventListener('keydown', handleKeyDown, true);

    // Focus the first real control, not the close button, so typing just works.
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
        ) ?? panel;
      target.focus({ preventScroll: true });
    }, 20);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown, true);
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
      restoreFocusTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Centerd on tall viewports, top-aligned when content is taller. */}
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div
          className="fixed inset-0 bg-scrim/55 backdrop-blur-[2px]"
          aria-hidden
          onMouseDown={() => {
            backdropArmed.current = true;
          }}
          onMouseUp={() => {
            if (backdropArmed.current) onClose();
            backdropArmed.current = false;
          }}
        />

        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labeledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          onMouseDown={(e) => {
            e.stopPropagation();
            backdropArmed.current = false;
          }}
          className={cn(
            'relative z-10 w-full animate-fade-in rounded-card border border-[color:var(--color-border)] shadow-modal focus:outline-none',
            // Opaque surface: the panel must never let the page bleed through.
            'bg-[color:var(--color-surface)] dark:bg-[color:var(--color-surface-dark)]',
            widths[width],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-base font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-xs leading-relaxed muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-me-1.5 -mt-1.5 shrink-0 rounded-control p-1.5 text-[color:var(--color-fg-muted)] transition-colors hover:bg-black/5 hover:text-[color:var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          {(() => {
            const body = (
              <>
                <div className="scrollbar-thin max-h-[65vh] overflow-y-auto px-5 py-5">
                  {children}
                </div>
                {footer && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--color-border)] bg-[color:var(--color-paper)] px-5 py-3.5 dark:bg-white/[0.02]">
                    {footer}
                  </div>
                )}
              </>
            );

            return onSubmit ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
              >
                {body}
              </form>
            ) : (
              body
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/** Confirmation dialog — replaces window.confirm for destructive actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm muted">This cannot be undone.</p>
    </Modal>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────
