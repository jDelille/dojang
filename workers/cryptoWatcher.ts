import { Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '@/lib/queue';
import { pendingCryptoPayments, refreshCryptoPayment } from '@/lib/crypto/payments';

/**
 * Watches open crypto payments (spec §6, crypto).
 *
 * Read-only: it queries public explorers and Tatum for balances and
 * confirmations, then advances payment state and marks invoices paid. It holds
 * no keys and can move nothing.
 *
 * Runs every minute because a customer is sitting in front of a countdown
 * waiting for their payment to be acknowledged.
 */
export function createCryptoWatcher() {
  return new Worker(
    QUEUE_NAMES.crypto,
    async () => {
      const pending = await pendingCryptoPayments(100);
      if (!pending.length) return { checked: 0 };

      let confirmed = 0;
      let failed = 0;

      // Sequential, with a gap between calls: public explorers rate-limit
      // aggressively and a burst gets the whole sweep throttled. Detection is
      // allowed to be a few seconds slower; being blocked outright is not.
      for (const [i, { id }] of pending.entries()) {
        if (i > 0) await new Promise((r) => setTimeout(r, 250));
        try {
          const updated = await refreshCryptoPayment(id);
          if (updated?.status === 'confirmed') confirmed++;
        } catch (error) {
          failed++;
          console.error('[crypto] check failed', id, (error as Error).message);
        }
      }

      if (confirmed) console.log(`[crypto] ${confirmed} payment(s) confirmed`);
      return { checked: pending.length, confirmed, failed };
    },
    { connection: createRedisConnection(), concurrency: 1 },
  );
}
