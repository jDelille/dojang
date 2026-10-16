import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Compass } from 'lucide-react';
import { Card, CardBody } from '@/components/ui';
import { buttonStyles } from '@/components/ui/button-styles';

/**
 * Segment-level not-found so a deleted or mistyped record keeps the sidebar
 * and the operator can carry on, rather than being dropped onto a bare page.
 */
export default function DashboardNotFound() {
  const t = useTranslations('errors');
  return (
    <Card className="mx-auto max-w-md">
      <CardBody className="text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-card border border-[color:var(--color-border)]">
          <Compass className="h-5 w-5 muted" strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-base font-semibold">{t('weCouldNotFindThat')}</h1>
        <p className="mt-2 text-sm muted">{t('itMayHaveBeenDeleted')}</p>
        <Link
          href="/dashboard"
          className={buttonStyles({ variant: 'primary', className: 'mt-6' })}
        >{t('backToTheOverview')}</Link>
      </CardBody>
    </Card>
  );
}
