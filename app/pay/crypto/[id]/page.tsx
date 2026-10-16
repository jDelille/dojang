import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { ASSETS, type CryptoAsset } from '@/lib/crypto/derive';
import { PayShell } from '@/components/pay/pay-shell';
import { CryptoPay } from '@/components/pay/crypto-pay';
import { Bitcoin, CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pay with crypto' };

/**
 * Customer-facing crypto checkout for one invoice.
 *
 * Public, like the Stripe and Paystack result pages: the invoice cuid is the
 * capability, and everything shown is already on the invoice they hold.
 */
export default async function CryptoPayPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('pay');
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      amount: true,
      currency: true,
      status: true,
      workspace: {
        select: {
          name: true, businessName: true, logoUrl: true, accentColor: true,
          cryptoWallets: { where: { isActive: true }, select: { asset: true } },
        },
      },
    },
  });
  if (!invoice) notFound();

  const business = invoice.workspace.businessName || invoice.workspace.name;
  const assets = invoice.workspace.cryptoWallets.map((w) => ({
    key: w.asset,
    label: ASSETS[w.asset as CryptoAsset].label,
  }));

  if (invoice.status === 'paid') {
    return (
      <PayShell
        accentColor={invoice.workspace.accentColor}
        logoUrl={invoice.workspace.logoUrl}
        businessName={business}
        icon={<CheckCircle2 className="h-8 w-8 text-success" strokeWidth={1.75} />}
        title={t('alreadyPaid')}
      >
        <p className="mt-3 text-sm muted">
          Invoice {invoice.number} is settled. Nothing further is needed.
        </p>
      </PayShell>
    );
  }

  return (
    <PayShell
      accentColor={invoice.workspace.accentColor}
      logoUrl={invoice.workspace.logoUrl}
      businessName={business}
      icon={<Bitcoin className="h-8 w-8 text-[color:var(--color-accent-dark)]" strokeWidth={1.75} />}
      title={`Invoice ${invoice.number}`}
    >
      <p className="mt-1 text-sm muted">
        {formatCurrency(Number(invoice.amount), invoice.currency)} due
      </p>

      <div className="mt-5 text-start">
        {assets.length ? (
          <CryptoPay invoiceId={invoice.id} assets={assets} />
        ) : (
          <p className="rounded-control border border-[color:var(--color-border)] px-3 py-3 text-center text-xs muted">
            {business} has not enabled crypto payments yet. Please use the payment link in your
            invoice email instead.
          </p>
        )}
      </div>
    </PayShell>
  );
}
