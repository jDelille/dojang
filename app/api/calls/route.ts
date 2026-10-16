import { prisma } from '@/lib/db';
import { ok, paginationFrom, searchParams, withWorkspace } from '@/lib/api';
import type { Prisma } from '@prisma/client';

/**
 * Call log. The voice webhooks have always written Call rows (transcript,
 * summary, recording, missed/text-back flags); nothing read them back.
 */
export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);
  const { take, skip, page } = paginationFrom(req, 25);

  const where: Prisma.CallWhereInput = { workspaceId: ctx.workspaceId };
  if (sp.get('missed') === '1') where.missed = true;
  if (sp.get('direction')) where.direction = sp.get('direction') as never;

  const search = sp.get('q')?.trim();
  if (search) {
    where.OR = [
      { fromNumber: { contains: search } },
      { toNumber: { contains: search } },
      { contact: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [calls, total, stats] = await Promise.all([
    prisma.call.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { contact: { select: { id: true, name: true } } },
    }),
    prisma.call.count({ where }),
    prisma.call.aggregate({
      where: { workspaceId: ctx.workspaceId },
      _count: true,
      _sum: { durationSeconds: true },
    }),
  ]);

  const missedCount = await prisma.call.count({
    where: { workspaceId: ctx.workspaceId, missed: true },
  });

  return ok({
    calls,
    total,
    page,
    pages: Math.ceil(total / take),
    stats: {
      totalCalls: stats._count,
      totalMinutes: Math.round((stats._sum.durationSeconds ?? 0) / 60),
      missed: missedCount,
    },
  });
}, 'leads:read');
