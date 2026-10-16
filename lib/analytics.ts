import { prisma } from '@/lib/db';
import { getUsageSummary } from '@/lib/usage';
import { daysAgo, startOfDayUTC } from '@/lib/utils';
import { bucketDaysFor } from '@/lib/ranges';

/** Dashboard metrics (spec §4.10). */

export type AnalyticsSummary = Awaited<ReturnType<typeof getAnalyticsSummary>>;

export async function getAnalyticsSummary(workspaceId: string, days = 30) {
  const from = daysAgo(days);
  const prevFrom = daysAgo(days * 2);

  const [
    leadsTotal,
    leadsPrev,
    contactedTotal,
    convertedTotal,
    convertedPrev,
    wonDeals,
    wonDealsPrev,
    appointments,
    conversations,
    calls,
    reviewStats,
    usage,
    leadsByStatus,
    leadsBySource,
  ] = await Promise.all([
    prisma.lead.count({ where: { workspaceId, createdAt: { gte: from } } }),
    prisma.lead.count({ where: { workspaceId, createdAt: { gte: prevFrom, lt: from } } }),
    prisma.lead.count({
      where: { workspaceId, createdAt: { gte: from }, status: { not: 'new' } },
    }),
    prisma.lead.count({ where: { workspaceId, createdAt: { gte: from }, status: 'won' } }),
    prisma.lead.count({
      where: { workspaceId, createdAt: { gte: prevFrom, lt: from }, status: 'won' },
    }),
    prisma.deal.aggregate({
      where: { workspaceId, status: 'won', closedAt: { gte: from } },
      _sum: { value: true },
      _count: true,
    }),
    prisma.deal.aggregate({
      where: { workspaceId, status: 'won', closedAt: { gte: prevFrom, lt: from } },
      _sum: { value: true },
    }),
    prisma.appointment.count({ where: { workspaceId, startsAt: { gte: from } } }),
    prisma.conversation.count({ where: { workspaceId, createdAt: { gte: from } } }),
    prisma.call.aggregate({
      where: { workspaceId, createdAt: { gte: from } },
      _count: true,
      _sum: { durationSeconds: true },
    }),
    prisma.review.aggregate({
      where: { workspaceId },
      _avg: { rating: true },
      _count: true,
    }),
    getUsageSummary(workspaceId, days),
    prisma.lead.groupBy({
      by: ['status'],
      // Same window as every other figure on the page — mixing all-time
      // status counts with a 30-day total made the funnel nonsensical.
      where: { workspaceId, createdAt: { gte: from } },
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ['source'],
      where: { workspaceId, createdAt: { gte: from } },
      _count: true,
    }),
  ]);

  const revenue = Number(wonDeals._sum.value ?? 0);
  const revenuePrev = Number(wonDealsPrev._sum.value ?? 0);

  return {
    period: { days, from: from.toISOString() },
    leads: {
      total: leadsTotal,
      contacted: contactedTotal,
      converted: convertedTotal,
      delta: percentDelta(leadsTotal, leadsPrev),
      convertedDelta: percentDelta(convertedTotal, convertedPrev),
      conversionRate: leadsTotal ? (convertedTotal / leadsTotal) * 100 : 0,
      byStatus: Object.fromEntries(leadsByStatus.map((r) => [r.status, r._count])),
      bySource: Object.fromEntries(leadsBySource.map((r) => [r.source, r._count])),
      funnel: buildFunnel(
        Object.fromEntries(leadsByStatus.map((r) => [r.status, r._count])),
        leadsTotal,
      ),
    },
    revenue: {
      total: revenue,
      delta: percentDelta(revenue, revenuePrev),
      wonDeals: wonDeals._count,
    },
    engagement: {
      appointments,
      conversations,
      calls: calls._count,
      callMinutes: Math.round((calls._sum.durationSeconds ?? 0) / 60),
      responseTimeMinutes: await getMedianResponseTime(workspaceId, from),
    },
    reputation: {
      averageRating: Number((reviewStats._avg.rating ?? 0).toFixed(2)),
      totalReviews: reviewStats._count,
    },
    usage,
  };
}

/**
 * A funnel has to be monotonically decreasing to mean anything, so each stage
 * counts leads that reached *at least* that far. Counting each status in
 * isolation produced nonsense like "Won 200%" when a lead was marked won
 * without ever passing through booked.
 */
function buildFunnel(byStatus: Record<string, number>, total: number) {
  const n = (key: string) => byStatus[key] ?? 0;

  return [
    { label: 'Leads', value: total },
    // Everyone who moved past "new" — including lost, since they were contacted.
    { label: 'Contacted', value: n('contacted') + n('booked') + n('won') + n('lost') },
    { label: 'Booked', value: n('booked') + n('won') },
    { label: 'Won', value: n('won') },
  ];
}

/**
 * Median minutes from an inbound message to the first outbound reply.
 * Median rather than mean — one abandoned thread shouldn't skew the headline.
 */
async function getMedianResponseTime(workspaceId: string, from: Date): Promise<number> {
  const conversations = await prisma.conversation.findMany({
    where: { workspaceId, createdAt: { gte: from } },
    select: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { direction: true, createdAt: true },
        take: 10,
      },
    },
    take: 500,
  });

  const deltas: number[] = [];
  for (const conversation of conversations) {
    const firstIn = conversation.messages.find((m) => m.direction === 'in');
    if (!firstIn) continue;
    const firstOut = conversation.messages.find(
      (m) => m.direction === 'out' && m.createdAt > firstIn.createdAt,
    );
    if (!firstOut) continue;
    deltas.push((firstOut.createdAt.getTime() - firstIn.createdAt.getTime()) / 60_000);
  }

  if (!deltas.length) return 0;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const median =
    deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  return Math.round(median * 10) / 10;
}

/** Daily leads / conversions series for the dashboard line chart. */
export async function getLeadTimeseries(workspaceId: string, days = 30) {
  const from = startOfDayUTC(daysAgo(days - 1));

  const leads = await prisma.lead.findMany({
    where: { workspaceId, createdAt: { gte: from } },
    select: { createdAt: true, status: true },
  });

  const gathered = new Map<string, number>();
  const converted = new Map<string, number>();

  for (const lead of leads) {
    const key = lead.createdAt.toISOString().slice(0, 10);
    gathered.set(key, (gathered.get(key) ?? 0) + 1);
    if (lead.status === 'won') converted.set(key, (converted.get(key) ?? 0) + 1);
  }

  const points: { x: string; gathered: number; converted: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = startOfDayUTC(daysAgo(i)).toISOString().slice(0, 10);
    points.push({
      x: key,
      gathered: gathered.get(key) ?? 0,
      converted: converted.get(key) ?? 0,
    });
  }

  // Longer ranges are bucketed so the line stays legible. The bucket is
  // stamped with its first day, which is what the axis labels. The rule
  // lives in one place so the chart caption cannot drift from the data.
  const bucketDays = bucketDaysFor(days);
  if (bucketDays === 1) return points;

  const bucketed: typeof points = [];
  for (let i = 0; i < points.length; i += bucketDays) {
    const slice = points.slice(i, i + bucketDays);
    bucketed.push({
      x: slice[0].x,
      gathered: slice.reduce((sum, p) => sum + p.gathered, 0),
      converted: slice.reduce((sum, p) => sum + p.converted, 0),
    });
  }

  return bucketed;
}

/** Per-rule retention performance for the analytics page. */
export async function getRetentionPerformance(workspaceId: string) {
  const rules = await prisma.retentionRule.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      isActive: true,
      _count: { select: { runs: true } },
      runs: { select: { status: true } },
    },
  });

  return rules.map((rule) => {
    const completed = rule.runs.filter((r) => r.status === 'completed').length;
    const failed = rule.runs.filter((r) => r.status === 'failed').length;
    return {
      id: rule.id,
      name: rule.name,
      isActive: rule.isActive,
      enrolled: rule._count.runs,
      completed,
      failed,
      completionRate: rule._count.runs ? (completed / rule._count.runs) * 100 : 0,
    };
  });
}

function percentDelta(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? 100 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}
