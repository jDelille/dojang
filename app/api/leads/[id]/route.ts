import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, withWorkspace } from '@/lib/api';
import { leadUpdateSchema } from '@/lib/validation';
import { normalizePhone } from '@/lib/utils';
import { logActivity, upsertContact } from '@/lib/workspace';

export const GET = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contact: { include: { deals: { include: { stage: true } } } },
      gatherJob: { select: { id: true, niche: true, createdAt: true } },
    },
  });
  if (!lead) return fail(404, 'Lead not found.');

  return ok({ lead });
}, 'leads:read');

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, leadUpdateSchema);

  const existing = await prisma.lead.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
  });
  if (!existing) return fail(404, 'Lead not found.');

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...body,
      phone: body.phone !== undefined ? normalizePhone(body.phone) : undefined,
      email: body.email !== undefined ? (body.email?.toLowerCase() ?? null) : undefined,
    },
  });

  // Moving a lead past "new" means someone is working it — promote it to a
  // contact so the conversation, deal and timeline all have a home.
  if (body.status && body.status !== 'new' && body.status !== existing.status) {
    const contact = await upsertContact(ctx.workspaceId, {
      name: lead.contactName || lead.businessName,
      phone: lead.phone,
      email: lead.email,
      company: lead.businessName,
      leadId: lead.id,
    });

    await logActivity({
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      userId: ctx.userId,
      type: 'stage_change',
      title: `Lead status: ${existing.status} → ${body.status}`,
    });
  }

  return ok({ lead });
}, 'leads:write');

export const DELETE = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const existing = await prisma.lead.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Lead not found.');

  await prisma.lead.delete({ where: { id } });
  return noContent();
}, 'leads:write');
