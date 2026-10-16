import { Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import {
  createRedisConnection,
  enqueueRetentionStep,
  QUEUE_NAMES,
  type RetentionJobData,
} from '@/lib/queue';
import {
  executeStep,
  findMatchingContacts,
  parseSteps,
  type RetentionLogEntry,
} from '@/lib/retention';

/**
 * Retention engine worker (spec §4.3).
 *
 * Two job types on one queue:
 *   'scan' — every 5 minutes: finds contacts newly matching each active rule
 *            and enrols them.
 *   'step' — executes one step of one run, then schedules the next with the
 *            configured delay. A 14-day wait costs nothing while pending.
 *
 * Enrolment is idempotent: RetentionRun has a unique (ruleId, contactId), so a
 * contact can't be double-enrolled by overlapping scans.
 */

export function createRetentionWorker() {
  return new Worker<RetentionJobData & { kind?: string }>(
    QUEUE_NAMES.retention,
    async (job: Job) => {
      if (job.name === 'scan') return runScan();
      return runStep(job.data as RetentionJobData);
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
    },
  );
}

async function runScan() {
  const rules = await prisma.retentionRule.findMany({ where: { isActive: true } });
  let enrolled = 0;

  for (const rule of rules) {
    try {
      const contacts = await findMatchingContacts(rule);

      for (const contact of contacts) {
        const existing = await prisma.retentionRun.findUnique({
          where: { ruleId_contactId: { ruleId: rule.id, contactId: contact.id } },
          select: { id: true },
        });
        if (existing) continue;

        const run = await prisma.retentionRun.create({
          data: {
            workspaceId: rule.workspaceId,
            ruleId: rule.id,
            contactId: contact.id,
            stepIndex: 0,
            status: 'pending',
            nextRunAt: new Date(),
          },
        });

        const steps = parseSteps(rule.steps);
        const firstDelay = (steps[0]?.delayMinutes ?? 0) * 60_000;

        await enqueueRetentionStep(
          { runId: run.id, workspaceId: rule.workspaceId },
          firstDelay,
        );
        enrolled += 1;
      }

      await prisma.retentionRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date() },
      });
    } catch (error) {
      console.error(`[retention] scan failed for rule ${rule.id}:`, (error as Error).message);
    }
  }

  if (enrolled) console.log(`[retention] scan enrolled ${enrolled} contact(s)`);
  return { enrolled, rulesScanned: rules.length };
}

async function runStep(data: RetentionJobData) {
  const run = await prisma.retentionRun.findUnique({
    where: { id: data.runId },
    include: { rule: true, contact: true },
  });

  if (!run) return { skipped: 'run no longer exists' };
  if (run.status === 'completed' || run.status === 'cancelled') {
    return { skipped: run.status };
  }
  if (!run.rule.isActive) {
    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: 'cancelled', lastError: 'Rule was deactivated.' },
    });
    return { skipped: 'rule inactive' };
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: run.workspaceId } });
  if (!workspace) return { skipped: 'workspace missing' };

  const steps = parseSteps(run.rule.steps);
  const step = steps[run.stepIndex];

  if (!step) {
    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: 'completed', nextRunAt: null },
    });
    return { completed: true };
  }

  await prisma.retentionRun.update({ where: { id: run.id }, data: { status: 'running' } });

  const entry: RetentionLogEntry = {
    ...(await executeStep(step, {
      workspace,
      contact: run.contact,
      rule: run.rule,
      dryRun: false,
    })),
    stepIndex: run.stepIndex,
  };

  const log = [...(Array.isArray(run.log) ? (run.log as unknown[]) : []), entry];
  const nextIndex = run.stepIndex + 1;
  const nextStep = steps[nextIndex];

  // A failed send retries via BullMQ's own backoff rather than being swallowed.
  if (entry.status === 'failed') {
    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: 'failed', lastError: entry.detail ?? 'Step failed.', log: log as never },
    });
    throw new Error(`Retention step failed: ${entry.detail}`);
  }

  if (!nextStep) {
    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: 'completed', stepIndex: nextIndex, nextRunAt: null, log: log as never },
    });
    return { completed: true, steps: nextIndex };
  }

  const delayMs = (nextStep.delayMinutes ?? 0) * 60_000;
  const nextRunAt = new Date(Date.now() + delayMs);

  await prisma.retentionRun.update({
    where: { id: run.id },
    data: { status: 'pending', stepIndex: nextIndex, nextRunAt, log: log as never },
  });

  await enqueueRetentionStep({ runId: run.id, workspaceId: run.workspaceId }, delayMs);

  return { advancedTo: nextIndex, nextRunAt };
}
