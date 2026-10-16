import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, withWorkspace } from '@/lib/api';
import { retentionRuleUpdateSchema } from '@/lib/validation';

export const GET = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const rule = await prisma.retentionRule.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      runs: {
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: { contact: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!rule) return fail(404, 'Rule not found.');

  return ok({ rule });
}, 'leads:read');

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, retentionRuleUpdateSchema);

  const existing = await prisma.retentionRule.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Rule not found.');

  const rule = await prisma.retentionRule.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      triggerType: body.triggerType,
      triggerConfig: body.triggerConfig as never,
      audience: body.audience as never,
      steps: body.steps as never,
      isActive: body.isActive,
    },
  });

  return ok({ rule });
}, 'retention:write');

export const DELETE = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const deleted = await prisma.retentionRule.deleteMany({
    where: { id, workspaceId: ctx.workspaceId },
  });
  if (!deleted.count) return fail(404, 'Rule not found.');

  return noContent();
}, 'retention:write');
