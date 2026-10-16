import { Worker } from 'bullmq';
import { createRedisConnection, QUEUE_NAMES } from '@/lib/queue';
import { recheckAllLicenses } from '@/lib/license-gate';

/**
 * Weekly license re-verification.
 *
 * Without this a purchase code is checked once at install and trusted
 * forever, so a refund or charge-back never takes effect. Failures are
 * swallowed inside recheckAllLicenses — an Envato outage must not
 * mass-invalidate paying customers.
 */
export function createLicenseWorker() {
  return new Worker(
    QUEUE_NAMES.license,
    async () => {
      const rechecked = await recheckAllLicenses();
      if (rechecked) console.log(`[license] re-verified ${rechecked} license(s)`);
      return { rechecked };
    },
    { connection: createRedisConnection(), concurrency: 1 },
  );
}
