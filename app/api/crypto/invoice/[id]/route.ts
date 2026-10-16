import { z } from 'zod';
import QRCode from 'qrcode';
import { prisma } from '@/lib/db';
import { fail, ok, parseBody, routeParam, withPublic } from '@/lib/api';
import { ASSETS, type CryptoAsset } from '@/lib/crypto/derive';
import { issueCryptoPayment, refreshCryptoPayment, CryptoNotConfiguredError } from '@/lib/crypto/payments';
import { CONFIRMATIONS_REQUIRED } from '@/lib/crypto/chain';

/**
 * Public crypto-payment endpoint for one invoice.
 *
 * Public because the person paying is a customer, not a logged-in user. The
 * invoice id is a cuid that only reached them via their own emailed pay link,
 * and nothing here exposes anything beyond that invoice's own total.
 */

const issueSchema = z.object({
  asset: z.enum(['BTC', 'ETH', 'USDT_TRON', 'USDC_TRON']),
});

/** Payment URI so a wallet app opens pre-filled from the QR. */
function paymentUri(asset: CryptoAsset, address: string, amount: string): string {
  switch (asset) {
    case 'BTC':
      return `bitcoin:${address}?amount=${amount}`;
    case 'ETH':
      return `ethereum:${address}?value=${amount}`;
    default:
      // TRC-20 has no widely honoured URI scheme; wallets scan the bare
      // address, and a made-up scheme would simply fail to open.
      return address;
  }
}

const shape = async (p: {
  id: string; asset: string; address: string; amount: unknown; fiatAmount: unknown;
  fiatCurrency: string; status: string; confirmations: number; expiresAt: Date;
  txHash: string | null; receivedAmount: unknown; network: string;
}) => ({
  id: p.id,
  asset: p.asset,
  network: p.network,
  assetLabel: ASSETS[p.asset as CryptoAsset].label,
  address: p.address,
  amount: String(p.amount),
  fiatAmount: String(p.fiatAmount),
  fiatCurrency: p.fiatCurrency,
  status: p.status,
  confirmations: p.confirmations,
  confirmationsRequired: CONFIRMATIONS_REQUIRED[p.asset as CryptoAsset],
  receivedAmount: String(p.receivedAmount),
  txHash: p.txHash,
  expiresAt: p.expiresAt.toISOString(),
  qr: await QRCode.toDataURL(paymentUri(p.asset as CryptoAsset, p.address, String(p.amount)), {
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'M',
  }),
});

/** Issue (or reuse) a payment request. */
export const POST = withPublic(async (req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, issueSchema);

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, status: true },
  });
  if (!invoice) return fail(404, 'Invoice not found.');
  if (invoice.status === 'paid') return fail(409, 'That invoice is already paid.');

  try {
    const payment = await issueCryptoPayment(invoice.workspaceId, invoice.id, body.asset as CryptoAsset);
    return ok({ payment: await shape(payment) });
  } catch (error) {
    if (error instanceof CryptoNotConfiguredError) return fail(409, error.message);
    return fail(502, (error as Error).message);
  }
});

/** Poll the live status of the newest request. */
export const GET = withPublic(async (_req, params) => {
  const id = await routeParam(params, 'id');

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, number: true, amount: true, currency: true, status: true },
  });
  if (!invoice) return fail(404, 'Invoice not found.');

  const latest = await prisma.cryptoPayment.findFirst({
    where: { invoiceId: id },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) return ok({ invoice, payment: null });

  const refreshed = (await refreshCryptoPayment(latest.id)) ?? latest;
  return ok({ invoice, payment: await shape(refreshed) });
});
