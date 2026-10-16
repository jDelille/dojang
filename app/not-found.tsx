import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Compass } from 'lucide-react';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  const t = useTranslations('errors');
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-paper)] px-4">
      <div className="w-full max-w-sm rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-card border border-[color:var(--color-border)]">
          <Compass className="h-5 w-5 muted" strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-lg font-semibold">{t('weCouldNotFindThat2')}</h1>
        <p className="mt-2 text-sm muted">{t('thePageMayHaveMoved')}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-control bg-accent px-5 py-2.5 text-sm font-medium text-[color:var(--color-accent-fg)] transition-colors hover:bg-accent-dark"
        >{t('backToTheDashboard')}</Link>
      </div>
    </div>
  );
}
