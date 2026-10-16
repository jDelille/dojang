import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, withWorkspace } from '@/lib/api';
import { agentUpdateSchema } from '@/lib/validation';

export const GET = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const agent = await prisma.aiAgent.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: { knowledgeDocs: { orderBy: { createdAt: 'desc' } } },
  });
  if (!agent) return fail(404, 'Agent not found.');

  return ok({ agent });
}, 'leads:read');

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, agentUpdateSchema);

  const existing = await prisma.aiAgent.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Agent not found.');

  if (body.isDefault) {
    await prisma.aiAgent.updateMany({
      where: { workspaceId: ctx.workspaceId, NOT: { id } },
      data: { isDefault: false },
    });
  }

  const agent = await prisma.aiAgent.update({
    where: { id },
    data: {
      ...body,
      escalationRules: body.escalationRules as never,
    },
  });

  return ok({ agent });
}, 'agents:write');

export const DELETE = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const agent = await prisma.aiAgent.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true, isDefault: true },
  });
  if (!agent) return fail(404, 'Agent not found.');

  const remaining = await prisma.aiAgent.count({ where: { workspaceId: ctx.workspaceId } });
  if (remaining <= 1) {
    return fail(409, 'You need at least one AI agent. Edit this one instead of deleting it.');
  }

  await prisma.aiAgent.delete({ where: { id } });

  // Never leave the workspace without a default.
  if (agent.isDefault) {
    const next = await prisma.aiAgent.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (next) await prisma.aiAgent.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  return noContent();
}, 'agents:write');
