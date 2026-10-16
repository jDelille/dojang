import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
import { getCurrentUser, requireWorkspace } from '@/lib/session';
import { prisma } from '@/lib/db';
import { Badge, Card, CardBody, PageHeader } from '@/components/ui';
import { LeadDetailForm } from '@/components/leads/lead-detail';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Scoped like the page itself — an unscoped lookup would put another
  // tenant's business name in this tab's title.
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { title: 'Lead' };

  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { businessName: true },
  });
  return { title: lead?.businessName ?? 'Lead' };
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('leadDetail');
  const { workspaceId } = await requireWorkspace();
  const { id } = await params;

  // Scoped by workspace, so another tenant's id is simply "not found".
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contact: { select: { id: true } },
      gatherJob: { select: { id: true, niche: true, createdAt: true } },
    },
  });

  if (!lead) notFound();

  const owners = await prisma.user.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  });

  const statusTone =
    lead.status === 'won'
      ? 'success'
      : lead.status === 'lost'
        ? 'alert'
        : lead.status === 'new'
          ? 'neutral'
          : 'accent';

  return (
    <>
      <Link
        href="/dashboard/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-xs muted transition-colors hover:text-[color:var(--color-fg)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />{t('allLeads')}</Link>

      <PageHeader
        title={lead.businessName}
        description={[lead.city, lead.country].filter(Boolean).join(', ') || undefined}
        actions={
          <>
            <Badge tone={statusTone}>{lead.status}</Badge>
            <span className="text-xs muted">Added {formatDate(lead.createdAt)}</span>
          </>
        }
      />

      {lead.gatherJob && (
        <Card className="mb-4">
          <CardBody className="flex items-center gap-3">
            <Building2 className="h-4 w-4 shrink-0 muted" strokeWidth={1.75} />
            <p className="text-xs muted">
              Found by a Google Maps search for <strong>{lead.gatherJob.niche}</strong> on{' '}
              {formatDate(lead.gatherJob.createdAt)}.
            </p>
          </CardBody>
        </Card>
      )}

      <LeadDetailForm
        owners={owners}
        lead={{
          id: lead.id,
          businessName: lead.businessName,
          contactName: lead.contactName,
          phone: lead.phone,
          email: lead.email,
          website: lead.website,
          address: lead.address,
          city: lead.city,
          country: lead.country,
          niche: lead.niche,
          category: lead.category,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
          status: lead.status,
          source: lead.source,
          notes: lead.notes,
          ownerId: lead.ownerId,
          contactId: lead.contact?.id ?? null,
        }}
      />
    </>
  );
}
