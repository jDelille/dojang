import { prisma } from '@/lib/db';
import { created, ok, paginationFrom, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { leadCreateSchema } from '@/lib/validation';
import { normalizePhone } from '@/lib/utils';
import { logActivity } from '@/lib/workspace';
import type { Prisma } from '@prisma/client';

export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);
  const { take, skip, page } = paginationFrom(req);

  const status = sp.get('status');
  const source = sp.get('source');
  const search = sp.get('q')?.trim();

  const where: Prisma.LeadWhereInput = { workspaceId: ctx.workspaceId };
  if (status) where.status = status as never;
  if (source) where.source = source as never;
  if (search) {
    where.OR = [
      { businessName: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        contact: { select: { id: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return ok({ leads, total, page, pages: Math.ceil(total / take) });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, leadCreateSchema);
  const phone = normalizePhone(body.phone);

  const lead = await prisma.lead.create({
    data: {
      workspaceId: ctx.workspaceId,
      businessName: body.businessName,
      contactName: body.contactName ?? null,
      phone,
      email: body.email?.toLowerCase() ?? null,
      website: body.website ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      country: body.country ?? null,
      niche: body.niche ?? null,
      notes: body.notes ?? null,
      source: body.source ?? 'manual',
      status: body.status ?? 'new',
      ownerId: body.ownerId ?? ctx.userId,
    },
  });

  await logActivity({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    type: 'system',
    title: `Lead added: ${lead.businessName}`,
  });

  return created({ lead });
}, 'leads:write');
