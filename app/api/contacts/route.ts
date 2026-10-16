import { prisma } from '@/lib/db';
import { created, ok, paginationFrom, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { contactCreateSchema } from '@/lib/validation';
import { normalizePhone } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);
  const { take, skip, page } = paginationFrom(req);
  const search = sp.get('q')?.trim();
  const tag = sp.get('tag');

  const where: Prisma.ContactWhereInput = { workspaceId: ctx.workspaceId };
  if (tag) where.tags = { has: tag };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { company: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
      take,
      skip,
      include: {
        deals: { where: { status: 'open' }, include: { stage: true }, take: 1 },
        _count: { select: { conversations: true, appointments: true, invoices: true } },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return ok({ contacts, total, page, pages: Math.ceil(total / take) });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, contactCreateSchema);

  const contact = await prisma.contact.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: body.name,
      phone: normalizePhone(body.phone),
      email: body.email?.toLowerCase() ?? null,
      company: body.company ?? null,
      tags: body.tags ?? [],
      customFields: (body.customFields ?? {}) as never,
      lastActivityAt: new Date(),
    },
  });

  return created({ contact });
}, 'contacts:write');
