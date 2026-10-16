import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, withWorkspace } from '@/lib/api';
import { dealUpdateSchema } from '@/lib/validation';
import { logActivity } from '@/lib/workspace';

/** Deal update — this is what the Kanban drag-and-drop calls. */

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, dealUpdateSchema);

  const existing = await prisma.deal.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: { stage: true },
  });
  if (!existing) return fail(404, 'Deal not found.');

  let stage = existing.stage;
  if (body.stageId && body.stageId !== existing.stageId) {
    const target = await prisma.pipelineStage.findFirst({
      where: { id: body.stageId, workspaceId: ctx.workspaceId },
    });
    if (!target) return fail(400, 'That stage does not belong to this workspace.');
    stage = target;
  }

  // Landing in a won/lost column closes the deal and stamps the close date.
  const status = body.status ?? (stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open');
  const closedAt = status === 'open' ? null : (existing.closedAt ?? new Date());

  const deal = await prisma.deal.update({
    where: { id },
    data: {
      stageId: stage.id,
      title: body.title,
      value: body.value,
      order: body.order,
      status,
      closedAt,
    },
    include: { contact: { select: { id: true, name: true, company: true } } },
  });

  if (stage.id !== existing.stageId) {
    await logActivity({
      workspaceId: ctx.workspaceId,
      contactId: deal.contactId,
      userId: ctx.userId,
      type: 'stage_change',
      title: `${deal.title}: ${existing.stage.name} → ${stage.name}`,
    });
  }

  return ok({ deal: { ...deal, value: Number(deal.value) } });
}, 'pipeline:write');

export const DELETE = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const existing = await prisma.deal.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Deal not found.');

  await prisma.deal.delete({ where: { id } });
  return noContent();
}, 'pipeline:write');
