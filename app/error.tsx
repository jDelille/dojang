'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Route-level error boundary. Without this a thrown server component renders a
 * bare Next.js error screen, which is not something to ship to a buyer.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-card border border-alert/40">
          <AlertTriangle className="h-5 w-5 text-alert" strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-lg font-semibold">{t('somethingWentWrongHere')}</h1>
        <p className="mt-2 text-sm muted">
          This page failed to load. Trying again often fixes it — if it does not, check that the
          database and Redis are reachable.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] muted">Reference: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-control bg-accent px-5 py-2.5 text-sm font-medium text-[color:var(--color-accent-fg)] transition-colors hover:bg-accent-dark"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} />{t('tryAgain')}</button>
      </div>
    </div>
  );
}
