import { config as loadEnv } from 'dotenv';

// Match Next.js's own precedence so the worker sees exactly the same
// configuration as the web tier: .env first, then .env.local overrides it.
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

import type { Worker } from 'bullmq';
import { createLeadGatherWorker } from './leadGather';
import { createCryptoWatcher } from './cryptoWatcher';
import { createLicenseWorker } from './licenseRecheck';
import { createRetentionWorker } from './retentionSender';
import { createReminderWorker } from './reminderScheduler';
import { createOutboundWorker } from './outbound';
import { registerRepeatables } from '@/lib/queue';
import { prisma } from '@/lib/db';
import { logDemoFlags } from '@/lib/demo-mode';

/**
 * Worker entrypoint — run alongside the web app:
 *
 *   npm run workers          (production)
 *   npm run workers:dev      (watch mode)
 *
 * The web tier only enqueues; every provider call that can be slow or flaky
 * happens here, where BullMQ's retry/backoff applies.
 */

async function main() {
  console.log('[workers] starting…');

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[workers] database ok');
  logDemoFlags();
  } catch (error) {
    console.error('[workers] cannot reach the database:', (error as Error).message);
    process.exit(1);
  }

  const workers: Worker[] = [
    createLeadGatherWorker(),
    createRetentionWorker(),
    createReminderWorker(),
    createOutboundWorker(),
    createCryptoWatcher(),
    createLicenseWorker(),
  ];

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      console.error(
        `[${worker.name}] job ${job?.id ?? '?'} failed (attempt ${job?.attemptsMade ?? 0}):`,
        error.message,
      );
    });
    worker.on('error', (error) => {
      console.error(`[${worker.name}] worker error:`, error.message);
    });
  }

  try {
    await registerRepeatables();
    console.log('[workers] repeatable schedules registered');
  } catch (error) {
    console.error('[workers] could not register repeatables:', (error as Error).message);
  }

  console.log(`[workers] ready — ${workers.map((w) => w.name).join(', ')}`);

  const shutdown = async (signal: string) => {
    console.log(`[workers] ${signal} received, draining…`);
    await Promise.all(workers.map((w) => w.close()));
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[workers] fatal:', error);
  process.exit(1);
});
