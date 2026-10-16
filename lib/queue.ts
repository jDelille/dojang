import { Queue, QueueEvents, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

/**
 * BullMQ wiring (spec §2). One connection is shared by every producer; the
 * worker process in /workers creates its own so a stalled job can't block
 * the web tier.
 */

// BullMQ 5 rejects ':' in queue names — it is the Redis key separator.
export const QUEUE_NAMES = {
  leadGather: 'roster-lead-gather',
  retention: 'roster-retention',
  reminder: 'roster-reminder',
  outbound: 'roster-outbound',
  crypto: 'roster-crypto',
  license: 'roster-license',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ── Job payloads ─────────────────────────────────────────────────────────────

export type LeadGatherJobData = {
  jobId: string;
  workspaceId: string;
  countries: string[];
  niche: string;
  targetCount: number;
};

export type RetentionJobData = {
  runId: string;
  workspaceId: string;
};

export type RetentionScanJobData = {
  kind: 'scan';
  workspaceId?: string;
};

export type ReminderJobData = {
  appointmentId: string;
  workspaceId: string;
};

export type OutboundJobData =
  | { kind: 'sms'; workspaceId: string; to: string; body: string; contactId?: string }
  | { kind: 'email'; workspaceId: string; to: string; subject: string; html: string; contactId?: string }
  | { kind: 'push'; workspaceId: string; title: string; body: string; url?: string; contactId?: string };

// ── Connection ───────────────────────────────────────────────────────────────

const globalForQueue = globalThis as unknown as {
  rosterRedis?: Redis;
  rosterQueues?: Map<string, Queue>;
};

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return new IORedis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

export function getRedis(): Redis {
  if (!globalForQueue.rosterRedis) {
    globalForQueue.rosterRedis = createRedisConnection();
    globalForQueue.rosterRedis.on('error', (err) => {
      console.error('[redis]', err.message);
    });
  }
  return globalForQueue.rosterRedis;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

export function getQueue<T = unknown>(name: QueueName): Queue<T> {
  if (!globalForQueue.rosterQueues) globalForQueue.rosterQueues = new Map();

  const existing = globalForQueue.rosterQueues.get(name);
  if (existing) return existing as Queue<T>;

  const queue = new Queue<T>(name, {
    connection: getRedis(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  globalForQueue.rosterQueues.set(name, queue as unknown as Queue);
  return queue;
}

// ── Producers ────────────────────────────────────────────────────────────────

export async function enqueueLeadGather(data: LeadGatherJobData) {
  return getQueue<LeadGatherJobData>(QUEUE_NAMES.leadGather).add('gather', data, {
    // BullMQ rejects ':' in a custom job id — it is their key separator.
    // Same trap as the queue names above; a colon here throws at enqueue time.
    jobId: `gather-${data.jobId}`,
  });
}

export async function enqueueRetentionStep(data: RetentionJobData, delayMs = 0) {
  return getQueue<RetentionJobData>(QUEUE_NAMES.retention).add('step', data, {
    delay: delayMs,
    jobId: `retention-${data.runId}-${Date.now()}`,
  });
}

export async function enqueueReminder(data: ReminderJobData, runAt: Date) {
  const delay = Math.max(runAt.getTime() - Date.now(), 0);
  return getQueue<ReminderJobData>(QUEUE_NAMES.reminder).add('remind', data, {
    delay,
    jobId: `reminder-${data.appointmentId}`,
  });
}

export async function enqueueOutbound(data: OutboundJobData) {
  return getQueue<OutboundJobData>(QUEUE_NAMES.outbound).add(data.kind, data);
}

/**
 * Repeatable schedulers. Called once at worker boot — BullMQ dedupes on the
 * repeat key, so restarting the worker doesn't multiply the schedule.
 */
export async function registerRepeatables() {
  await getQueue(QUEUE_NAMES.retention).add(
    'scan',
    { kind: 'scan' } satisfies RetentionScanJobData,
    { repeat: { pattern: '*/5 * * * *' }, jobId: 'retention-scan' },
  );

  // Re-verify licenses weekly, so a refunded or charged-back purchase
  // eventually stops working rather than being trusted forever.
  await getQueue(QUEUE_NAMES.license).add(
    'recheck',
    {},
    { repeat: { pattern: '0 4 * * 1' }, jobId: 'license-recheck' },
  );

  // Poll open crypto payments. Frequent because a customer is watching a
  // countdown while they wait for it to clear.
  await getQueue(QUEUE_NAMES.crypto).add(
    'sweep',
    {},
    { repeat: { pattern: '*/1 * * * *' }, jobId: 'crypto-sweep' },
  );

  await getQueue(QUEUE_NAMES.reminder).add(
    'sweep',
    { appointmentId: '__sweep__', workspaceId: '__all__' },
    { repeat: { pattern: '*/15 * * * *' }, jobId: 'reminder-sweep' },
  );
}

export async function queueHealth() {
  const results: Record<string, unknown> = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    try {
      const q = getQueue(name);
      results[name] = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    } catch (error) {
      results[name] = { error: (error as Error).message };
    }
  }
  return results;
}

export { QueueEvents };
