import { XCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { buttonStyles } from '@/components/ui/button-styles';
import { PayShell } from '@/components/pay/pay-shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment cancelled' };

/**
 * Where the provider drops the customer when they back out of checkout.
 *
 * Telling them to "find the link in your email" abandons a customer who was
 * one click from paying, so the stored pay link is offered directly. It is
 * only shown while the invoice is genuinely unpaid.
 */
export default async function PayCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const t = await getTranslations('pay');
  const { invoice: invoiceId } = await searchParams;

  const invoice = invoiceId
    ? await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          number: true,
          amount: true,
          currency: true,
          status: true,
          payLink: true,
          workspace: {
            select: { name: true, businessName: true, logoUrl: true, accentColor: true },
          },
        },
      })
    : null;

  const business = invoice?.workspace.businessName || invoice?.workspace.name || null;
  const alreadyPaid = invoice?.status === 'paid';
  // Only re-offer checkout for a link the provider issued, and only while
  // there is still something to pay.
  const retryLink =
    !alreadyPaid && invoice?.payLink && /^https:\/\//.test(invoice.payLink)
      ? invoice.payLink
      : null;

  return (
    <PayShell
      accentColor={invoice?.workspace.accentColor}
      logoUrl={invoice?.workspace.logoUrl}
      businessName={business}
      icon={<XCircle className="h-8 w-8 muted" strokeWidth={1.75} />}
      title={alreadyPaid ? 'This invoice is already paid' : 'Payment cancelled'}
    >
      {invoice && !alreadyPaid && (
        <dl className="mt-5 space-y-2 rounded-control border border-[color:var(--color-border)] px-4 py-3 text-start text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="muted">{t('invoice')}</dt>
            <dd className="font-medium tabular-nums">{invoice.number}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="muted">{t('stillDue')}</dt>
            <dd className="font-medium tabular-nums">
              {formatCurrency(Number(invoice.amount), invoice.currency)}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-4 text-sm muted">
        {alreadyPaid
          ? 'Nothing was charged just now — this invoice was already settled. Your receipt is in your email.'
          : 'Nothing was charged. Your invoice is still open, so you can pick up where you left off whenever you are ready.'}
      </p>

      {retryLink && (
        <a
          href={retryLink}
          className={buttonStyles({ variant: 'primary', className: 'mt-6 w-full' })}
        >{t('tryThePaymentAgain')}</a>
      )}
    </PayShell>
  );
}
