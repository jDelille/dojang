import { ok, searchParams, withWorkspace } from '@/lib/api';
import {
  getAnalyticsSummary,
  getLeadTimeseries,
  getRetentionPerformance,
} from '@/lib/analytics';

export const GET = withWorkspace(async (ctx, req) => {
  const days = Math.min(Math.max(Number(searchParams(req).get('days') ?? 30) || 30, 7), 365);

  const [summary, timeseries, retention] = await Promise.all([
    getAnalyticsSummary(ctx.workspaceId, days),
    getLeadTimeseries(ctx.workspaceId, days),
    getRetentionPerformance(ctx.workspaceId),
  ]);

  return ok({ summary, timeseries, retention });
}, 'analytics:read');
