import { CheckCircle2, Clock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { PayShell } from '@/components/pay/pay-shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment received' };

/**
 * Where the payment provider drops the customer after a successful charge.
 *
 * The `invoice` id is the capability token here — a cuid that only reached
 * this customer through their own emailed pay link — and everything shown
 * back is already on the invoice they just paid. Nothing is surfaced that
 * they did not already hold.
 */
export default async function PaySuccessPage({
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
          workspace: {
            select: { name: true, businessName: true, logoUrl: true, accentColor: true },
          },
        },
      })
    : null;

  const business = invoice?.workspace.businessName || invoice?.workspace.name || null;
  // The webhook that flips the row to `paid` can land a beat after this
  // redirect, so an unsettled row is reported as pending, never as failed.
  const settled = invoice?.status === 'paid';

  return (
    <PayShell
      accentColor={invoice?.workspace.accentColor}
      logoUrl={invoice?.workspace.logoUrl}
      businessName={business}
      icon={
        settled || !invoice ? (
          <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={1.75} />
        ) : (
          <Clock className="h-8 w-8 text-warning" strokeWidth={1.75} />
        )
      }
      title={settled || !invoice ? 'Payment received' : 'Payment processing'}
    >
      {invoice ? (
        <>
          <dl className="mt-5 space-y-2 rounded-control border border-[color:var(--color-border)] px-4 py-3 text-start text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="muted">{t('invoice')}</dt>
              <dd className="font-medium tabular-nums">{invoice.number}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="muted">{t('amount')}</dt>
              <dd className="font-medium tabular-nums">
                {formatCurrency(Number(invoice.amount), invoice.currency)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm muted">
            {settled
              ? 'Your receipt is on its way by email. You can close this window.'
              : 'Your payment has been approved and we are waiting on final confirmation. Your receipt will follow by email — nothing further is needed from you.'}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm muted">{t('thankYouYourReceiptIs')}</p>
      )}
    </PayShell>
  );
}
