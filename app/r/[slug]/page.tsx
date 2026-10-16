import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { brandStyle } from '@/lib/brand';
import { ReviewCapture } from '@/components/reviews/review-capture';

export const dynamic = 'force-dynamic';

/**
 * Public review landing page.
 *
 * The retention engine's `request_review` step texts and emails this URL to real
 * customers, so it must exist and must be reachable without a session. It is
 * deliberately its own layout — no dashboard chrome, no auth.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { businessName: true, name: true },
  });

  return {
    title: `Leave a review for ${workspace?.businessName ?? workspace?.name ?? 'us'}`,
    robots: { index: false, follow: false },
  };
}

export default async function ReviewLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      businessName: true,
      logoUrl: true,
      accentColor: true,
      businessEmail: true,
      businessPhone: true,
    },
  });

  if (!workspace) notFound();

  const accentCss = brandStyle(workspace.accentColor);

  return (
    <>
      {accentCss && <style dangerouslySetInnerHTML={{ __html: accentCss }} />}
      <ReviewCapture
        slug={workspace.slug}
        businessName={workspace.businessName || workspace.name}
        logoUrl={workspace.logoUrl}
        contactEmail={workspace.businessEmail}
        contactPhone={workspace.businessPhone}
      />
    </>
  );
}
