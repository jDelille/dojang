import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, withWorkspace } from '@/lib/api';
import { contactUpdateSchema } from '@/lib/validation';
import { normalizePhone } from '@/lib/utils';

/** Contact detail with the full activity timeline (spec §4.4). */

export const GET = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const contact = await prisma.contact.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      lead: true,
      deals: { include: { stage: true }, orderBy: { createdAt: 'desc' } },
      appointments: { orderBy: { startsAt: 'desc' }, take: 10 },
      invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
      calls: { orderBy: { createdAt: 'desc' }, take: 10 },
      conversations: {
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
      activities: { orderBy: { createdAt: 'desc' }, take: 50, include: { user: { select: { name: true } } } },
    },
  });
  if (!contact) return fail(404, 'Contact not found.');

  return ok({ contact });
}, 'leads:read');

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, contactUpdateSchema);

  const existing = await prisma.contact.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Contact not found.');

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      ...body,
      phone: body.phone !== undefined ? normalizePhone(body.phone) : undefined,
      email: body.email !== undefined ? (body.email?.toLowerCase() ?? null) : undefined,
      customFields: body.customFields as never,
    },
  });

  return ok({ contact });
}, 'contacts:write');

export const DELETE = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const existing = await prisma.contact.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Contact not found.');

  await prisma.contact.delete({ where: { id } });
  return noContent();
}, 'contacts:write');
