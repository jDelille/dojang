import { prisma } from '@/lib/db';
import { ok, paginationFrom, searchParams, withWorkspace } from '@/lib/api';
import type { Prisma } from '@prisma/client';

export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);
  const { take, skip, page } = paginationFrom(req, 25);
  const status = sp.get('status');

  const where: Prisma.ReviewWhereInput = { workspaceId: ctx.workspaceId };
  if (status) where.status = status as never;

  const [reviews, total, stats, awaiting] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { contact: { select: { id: true, name: true } } },
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({
      where: { workspaceId: ctx.workspaceId },
      _avg: { rating: true },
      _count: true,
    }),
    // Workspace-wide and unfiltered: the header tile answers "how much is
    // outstanding", which must not change when the tab or page does.
    prisma.review.count({
      where: { workspaceId: ctx.workspaceId, status: { in: ['new', 'drafted'] } },
    }),
  ]);

  return ok({
    reviews,
    total,
    page,
    pages: Math.ceil(total / take),
    averageRating: stats._avg.rating ?? 0,
    totalReviews: stats._count,
    awaitingReply: awaiting,
  });
}, 'leads:read');
