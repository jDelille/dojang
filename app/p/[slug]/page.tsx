import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPublishedPage, listPublishedPages, renderPageContent } from '@/lib/pages';
import { Container } from '@/components/marketing/sections';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  return {
    title: page?.title ?? 'Page',
    // Legal pages should be indexable even though the dashboard is not.
    robots: page ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function SitePageView({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations('marketing');
  const { slug } = await params;
  const [page, others] = await Promise.all([getPublishedPage(slug), listPublishedPages()]);
  if (!page) notFound();

  return (
    <div className="min-h-screen bg-[color:var(--color-paper)]">
      <header className="border-b border-[color:var(--color-border)]">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-control bg-accent text-xs font-bold text-[color:var(--color-accent-fg)]">
              R
            </span>
            <span className="font-display text-base font-semibold tracking-tight">{t('roster')}</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm muted transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />{t('back')}</Link>
        </Container>
      </header>

      <Container className="max-w-3xl py-12 sm:py-16">
        <article
          className="text-sm text-[color:var(--color-fg)]"
          /* Content is rendered through lib/pages.ts, which escapes everything
             first and re-introduces only an allowlisted subset — an admin can
             format a policy but cannot inject script into a visitor's page. */
          dangerouslySetInnerHTML={{ __html: renderPageContent(page.content) }}
        />
        <p className="mt-10 border-t border-[color:var(--color-border)] pt-4 text-2xs muted">
          Last updated{' '}
          {page.updatedAt.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </Container>

      <footer className="border-t border-[color:var(--color-border)] py-8">
        <Container className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-2xs">
          {others.map((other) => (
            <Link
              key={other.slug}
              href={`/p/${other.slug}`}
              className={
                other.slug === page.slug
                  ? 'font-medium'
                  : 'muted transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]'
              }
            >
              {other.title}
            </Link>
          ))}
        </Container>
      </footer>
    </div>
  );
}
