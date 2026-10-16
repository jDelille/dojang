import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser, requireWorkspace } from '@/lib/session';
import { prisma } from '@/lib/db';
import { InvoiceDetail } from '@/components/invoices/invoice-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Scoped like the page — an unscoped lookup would put another tenant's
  // invoice number in this tab's title.
  const user = await getCurrentUser();
  if (!user?.workspaceId) return { title: 'Invoice' };

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: user.workspaceId },
    select: { number: true, isEstimate: true },
  });
  if (!invoice) return { title: 'Invoice' };
  return { title: `${invoice.isEstimate ? 'Estimate' : 'Invoice'} ${invoice.number}` };
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspaceId } = await requireWorkspace();
  const { id } = await params;

  // Resolved server-side so a missing or cross-tenant id is a real 404
  // rather than the client component flashing its own error state.
  const exists = await prisma.invoice.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!exists) notFound();

  return (
    <>
      <Link
        href="/dashboard/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-xs muted transition-colors duration-150 ease-out hover:text-[color:var(--color-fg)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All invoices
      </Link>
      <InvoiceDetail invoiceId={id} />
    </>
  );
}
