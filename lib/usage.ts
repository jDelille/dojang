import { prisma } from '@/lib/db';
import { startOfDayUTC, daysAgo } from '@/lib/utils';
import type { UsageMetric } from '@prisma/client';

/**
 * Usage metering (spec §4.9 / §9). Agencies bill their own clients from these
 * numbers, so writes are additive and bucketed per UTC day.
 */

export async function recordUsage(
  workspaceId: string,
  metric: UsageMetric,
  quantity = 1,
  meta?: Record<string, unknown>,
) {
  if (quantity <= 0) return;
  const day = startOfDayUTC();

  await prisma.usageRecord
    .upsert({
      where: { workspaceId_metric_day: { workspaceId, metric, day } },
      create: { workspaceId, metric, day, quantity, meta: meta as never },
      update: { quantity: { increment: quantity } },
    })
    .catch((error) => {
      // Metering must never break the user-facing action that triggered it.
      console.error('[usage] failed to record', metric, error);
    });
}

export async function recordAiUsage(
  workspaceId: string,
  tokensIn: number,
  tokensOut: number,
) {
  await Promise.all([
    recordUsage(workspaceId, 'ai_tokens_in', tokensIn),
    recordUsage(workspaceId, 'ai_tokens_out', tokensOut),
  ]);
}

export type UsageSummary = Record<UsageMetric, number>;

const EMPTY_SUMMARY: UsageSummary = {
  ai_tokens_in: 0,
  ai_tokens_out: 0,
  sms_sent: 0,
  calls_minutes: 0,
  emails_sent: 0,
  push_sent: 0,
  leads_gathered: 0,
};

export async function getUsageSummary(workspaceId: string, days = 30): Promise<UsageSummary> {
  const rows = await prisma.usageRecord.groupBy({
    by: ['metric'],
    where: { workspaceId, day: { gte: startOfDayUTC(daysAgo(days)) } },
    _sum: { quantity: true },
  });

  const summary = { ...EMPTY_SUMMARY };
  for (const row of rows) summary[row.metric] = row._sum.quantity ?? 0;
  return summary;
}

/** Platform-wide roll-up for the Super Admin panel. */
export async function getUsageByWorkspace(days = 30) {
  const rows = await prisma.usageRecord.groupBy({
    by: ['workspaceId', 'metric'],
    where: { day: { gte: startOfDayUTC(daysAgo(days)) } },
    _sum: { quantity: true },
  });

  const byWorkspace = new Map<string, UsageSummary>();
  for (const row of rows) {
    const current = byWorkspace.get(row.workspaceId) ?? { ...EMPTY_SUMMARY };
    current[row.metric] = row._sum.quantity ?? 0;
    byWorkspace.set(row.workspaceId, current);
  }
  return byWorkspace;
}

export async function getUsageTimeseries(
  workspaceId: string,
  metric: UsageMetric,
  days = 30,
): Promise<{ day: string; value: number }[]> {
  const from = startOfDayUTC(daysAgo(days));
  const rows = await prisma.usageRecord.findMany({
    where: { workspaceId, metric, day: { gte: from } },
    orderBy: { day: 'asc' },
    select: { day: true, quantity: true },
  });

  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.quantity]));
  const out: { day: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = startOfDayUTC(daysAgo(i)).toISOString().slice(0, 10);
    out.push({ day: key, value: byDay.get(key) ?? 0 });
  }
  return out;
}
