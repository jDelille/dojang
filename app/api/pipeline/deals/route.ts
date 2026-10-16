import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, withWorkspace } from '@/lib/api';
import { dealCreateSchema } from '@/lib/validation';
import { ensureStages, logActivity } from '@/lib/workspace';

/** Kanban board data + deal creation (spec §4.4). */

export const GET = withWorkspace(async (ctx) => {
  await ensureStages(ctx.workspaceId);

  const [stages, deals] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { order: 'asc' },
    }),
    prisma.deal.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: {
        contact: { select: { id: true, name: true, company: true, email: true, phone: true } },
      },
    }),
  ]);

  return ok({
    stages,
    deals: deals.map((d) => ({ ...d, value: Number(d.value) })),
  });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, dealCreateSchema);
  await ensureStages(ctx.workspaceId);

  const contact = await prisma.contact.findFirst({
    where: { id: body.contactId, workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
  });
  if (!contact) return fail(404, 'Contact not found in this workspace.');

  const stage = body.stageId
    ? await prisma.pipelineStage.findFirst({
        where: { id: body.stageId, workspaceId: ctx.workspaceId },
      })
    : await prisma.pipelineStage.findFirst({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { order: 'asc' },
      });
  if (!stage) return fail(400, 'No pipeline stage available.');

  const deal = await prisma.deal.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      stageId: stage.id,
      title: body.title,
      value: body.value ?? 0,
      currency: body.currency ?? 'USD',
    },
    include: { contact: { select: { id: true, name: true, company: true } } },
  });

  await logActivity({
    workspaceId: ctx.workspaceId,
    contactId: contact.id,
    userId: ctx.userId,
    type: 'system',
    title: `Deal created: ${deal.title}`,
  });

  return created({ deal: { ...deal, value: Number(deal.value) } });
}, 'pipeline:write');
