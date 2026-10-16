import { prisma } from '@/lib/db';
import { created, ok, parseBody, withWorkspace } from '@/lib/api';
import { retentionRuleSchema } from '@/lib/validation';
import { RULE_TEMPLATES } from '@/lib/retention';

export const GET = withWorkspace(async (ctx) => {
  const rules = await prisma.retentionRule.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { runs: true } },
      runs: {
        where: { status: 'completed' },
        select: { id: true },
        take: 1000,
      },
    },
  });

  return ok({
    rules: rules.map((rule) => ({
      ...rule,
      completedRuns: rule.runs.length,
      runs: undefined,
    })),
    templates: RULE_TEMPLATES,
  });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, retentionRuleSchema);

  const rule = await prisma.retentionRule.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: body.name,
      description: body.description ?? null,
      triggerType: body.triggerType,
      triggerConfig: (body.triggerConfig ?? {}) as never,
      audience: (body.audience ?? {}) as never,
      steps: body.steps as never,
      isActive: body.isActive ?? false,
    },
  });

  return created({ rule });
}, 'retention:write');
