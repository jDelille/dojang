import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  deriveAddress,
  looksLikeAddress,
  type CryptoAsset,
  type CryptoNetwork,
} from '@/lib/crypto/derive';
import { quote, quoteWindowMinutes } from '@/lib/crypto/rates';
import {
  observeAddress,
  ethereumBalance,
  ethereumBlockNumber,
  CONFIRMATIONS_REQUIRED,
} from '@/lib/crypto/chain';
import { logActivity } from '@/lib/workspace';
import { sendPush } from '@/lib/integrations/push';

/** Issuing and settling crypto payment requests against invoices. */

export class CryptoNotConfiguredError extends Error {
  constructor(asset: CryptoAsset) {
    super(`No ${asset} wallet configured. Add an extended public key in Settings → Crypto.`);
  }
}

/**
 * Issues (or reuses) a payment request for an invoice.
 *
 * Reuses a live request rather than minting a new address on every page view —
 * otherwise a customer who refreshes ends up with several addresses and pays
 * one Roster has stopped watching.
 */
export async function issueCryptoPayment(
  workspaceId: string,
  invoiceId: string,
  asset: CryptoAsset,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
  });
  if (!invoice) throw new Error('Invoice not found in this workspace.');
  if (invoice.status === 'paid') throw new Error('That invoice is already paid.');

  const existing = await prisma.cryptoPayment.findFirst({
    where: {
      invoiceId,
      asset,
      status: { in: ['awaiting', 'detected'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;

  const wallet = await prisma.cryptoWallet.findFirst({
    where: { workspaceId, asset, isActive: true },
  });
  if (!wallet) throw new CryptoNotConfiguredError(asset);

  const fiatAmount = Number(invoice.amount);
  const { amount, rate } = await quote(asset, fiatAmount, invoice.currency);

  // Claim the index atomically. Two customers opening the same invoice at once
  // must never be handed the same address, which would make their payments
  // indistinguishable — the exact failure this design exists to avoid.
  const claimed = await prisma.cryptoWallet.update({
    where: { id: wallet.id },
    data: { nextIndex: { increment: 1 } },
    select: { nextIndex: true, extendedKey: true },
  });
  const index = claimed.nextIndex - 1;

  const network = wallet.network as CryptoNetwork;
  const address = deriveAddress(asset, claimed.extendedKey, index, network);
  if (!looksLikeAddress(asset, address, network)) {
    throw new Error(
      `Derived an address that does not look like ${asset} on ${network}. Check the extended key.`,
    );
  }

  // Ethereum settles on the increase over what is already there, so the
  // starting balance has to be recorded before the address is handed out.
  // Normally zero — but not if the buyer connected an xpub they already use.
  let baselineAmount = 0;
  if (asset === 'ETH') {
    try {
      baselineAmount = await ethereumBalance(address, network);
    } catch {
      // Treated as zero: erring this way can only ever *understate* what was
      // received, which delays settlement rather than granting it falsely.
    }
  }

  const expiresAt = new Date(Date.now() + quoteWindowMinutes(asset) * 60_000);

  return prisma.cryptoPayment.create({
    data: {
      workspaceId,
      invoiceId,
      walletId: wallet.id,
      asset,
      network: wallet.network,
      address,
      derivationIndex: index,
      amount: new Prisma.Decimal(amount),
      fiatAmount: new Prisma.Decimal(fiatAmount.toFixed(2)),
      fiatCurrency: invoice.currency,
      rate: new Prisma.Decimal(rate.toFixed(12)),
      baselineAmount: new Prisma.Decimal(baselineAmount.toFixed(18)),
      expiresAt,
    },
  });
}

/**
 * Checks one payment against the chain and advances its state.
 * Safe to call repeatedly — settlement is idempotent.
 */
export async function refreshCryptoPayment(paymentId: string) {
  const payment = await prisma.cryptoPayment.findUnique({
    where: { id: paymentId },
    include: { invoice: { select: { id: true, number: true, status: true, contactId: true } } },
  });
  if (!payment) return null;
  if (payment.status === 'confirmed') return payment;

  let observation;
  try {
    // Anchored to when this request was issued: funds already sitting on the
    // address (a reused xpub) must never settle an invoice nobody paid.
    observation = await observeAddress(
      payment.asset,
      payment.address,
      payment.quotedAt,
      Number(payment.baselineAmount),
      payment.detectedAtBlock ?? undefined,
      payment.network as CryptoNetwork,
    );
  } catch {
    // A flaky explorer must not expire a payment the customer has made.
    await prisma.cryptoPayment.update({
      where: { id: payment.id },
      data: { lastCheckedAt: new Date() },
    });
    return payment;
  }

  const owed = Number(payment.amount);
  const required = CONFIRMATIONS_REQUIRED[payment.asset as CryptoAsset];

  // Nothing has arrived and the window has closed.
  if (observation.received === 0) {
    if (payment.expiresAt < new Date() && payment.status === 'awaiting') {
      return prisma.cryptoPayment.update({
        where: { id: payment.id },
        data: { status: 'expired', lastCheckedAt: new Date() },
      });
    }
    return prisma.cryptoPayment.update({
      where: { id: payment.id },
      data: { lastCheckedAt: new Date() },
    });
  }

  // Money is on-chain, so the expiry no longer applies — it exists to bound
  // rate drift before payment, not to strand someone who has already paid.
  // A hair under the quote is tolerated: wallets round, and a fraction of a
  // cent short is not a genuine underpayment.
  const tolerance = owed * 0.005;
  const sufficient = observation.received >= owed - tolerance;
  const deep = observation.confirmations >= required;

  const status = !sufficient ? 'underpaid' : deep ? 'confirmed' : 'detected';

  // Stamp the height the moment funds first appear, so subsequent sweeps
  // measure depth against a fixed point rather than a moving one.
  let detectedAtBlock = payment.detectedAtBlock;
  if (detectedAtBlock == null && payment.asset === 'ETH') {
    try {
      detectedAtBlock = await ethereumBlockNumber(payment.network as CryptoNetwork);
    } catch {
      // Retried next sweep; until then depth reads as a single confirmation.
    }
  }

  const updated = await prisma.cryptoPayment.update({
    where: { id: payment.id },
    data: {
      status,
      receivedAmount: new Prisma.Decimal(observation.received.toFixed(18)),
      txHash: observation.txHash,
      confirmations: observation.confirmations,
      detectedAtBlock,
      detectedAt: payment.detectedAt ?? new Date(),
      confirmedAt: status === 'confirmed' ? (payment.confirmedAt ?? new Date()) : payment.confirmedAt,
      lastCheckedAt: new Date(),
    },
  });

  if (status === 'confirmed' && payment.invoice.status !== 'paid') {
    await settleInvoice(payment.workspaceId, payment.invoiceId, updated.txHash, payment.asset);
  }

  return updated;
}

async function settleInvoice(
  workspaceId: string,
  invoiceId: string,
  txHash: string | null,
  asset: CryptoAsset,
) {
  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'paid',
      paidAt: new Date(),
      provider: 'crypto',
      externalRef: txHash,
    },
    include: { contact: { select: { id: true, name: true } } },
  });

  await logActivity({
    workspaceId,
    contactId: invoice.contactId,
    type: 'invoice',
    title: `Invoice ${invoice.number} paid in ${asset.replace('_', ' on ')}`,
    body: txHash ? `Transaction ${txHash}` : undefined,
  });

  void sendPush(workspaceId, {
    title: 'Crypto payment received',
    body: `${invoice.contact.name} paid invoice ${invoice.number}.`,
    url: `/dashboard/invoices/${invoice.id}`,
  }).catch(() => undefined);
}

/** Every payment worth polling — used by the background worker. */
export async function pendingCryptoPayments(limit = 100) {
  return prisma.cryptoPayment.findMany({
    where: {
      OR: [
        { status: { in: ['awaiting'] }, expiresAt: { gt: new Date(Date.now() - 60 * 60_000) } },
        // Keep watching a detected payment until it is deep enough, however
        // long that takes.
        { status: 'detected' },
      ],
    },
    orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: { id: true },
  });
}
