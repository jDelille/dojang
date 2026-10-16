import { prisma } from '@/lib/db';
import { ok, paginationFrom, searchParams, withWorkspace } from '@/lib/api';
import type { Prisma } from '@prisma/client';

/** Unified inbox conversation list (spec §4.7). */
export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);
  const { take, skip, page } = paginationFrom(req, 30);
  const channel = sp.get('channel');
  const filter = sp.get('filter'); // open | needs_human | all
  const search = sp.get('q')?.trim();

  const where: Prisma.ConversationWhereInput = { workspaceId: ctx.workspaceId };
  if (channel) where.channel = channel as never;
  if (filter === 'needs_human') where.needsHuman = true;
  if (filter !== 'all') where.isOpen = true;
  if (search) {
    where.contact = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ],
    };
  }

  const [conversations, total, counts] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take,
      skip,
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
        agent: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where }),
    prisma.conversation.groupBy({
      by: ['channel'],
      where: { workspaceId: ctx.workspaceId, isOpen: true },
      _count: true,
    }),
  ]);

  return ok({
    conversations,
    total,
    page,
    pages: Math.ceil(total / take),
    channelCounts: Object.fromEntries(counts.map((c) => [c.channel, c._count])),
  });
}, 'leads:read');
