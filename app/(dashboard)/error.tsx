'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, Card, CardBody } from '@/components/ui';

/** Keeps the sidebar and chrome intact when one dashboard page fails. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  useEffect(() => {
    console.error('[dashboard error]', error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-md">
      <CardBody className="text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-card border border-alert/40">
          <AlertTriangle className="h-5 w-5 text-alert" strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-base font-semibold">{t('thisPageFailedToLoad')}</h1>
        <p className="mt-2 text-sm muted">{t('theRestOfRosterIs')}</p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] muted">Reference: {error.digest}</p>
        )}
        <Button variant="primary" className="mt-6" onClick={reset}>
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} />{t('tryAgain')}</Button>
      </CardBody>
    </Card>
  );
}
