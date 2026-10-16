import { z } from 'zod';
import { prisma } from '@/lib/db';
import { created, ok, parseBody, withWorkspace } from '@/lib/api';
import { ensureStages } from '@/lib/workspace';
import { slugify } from '@/lib/utils';

const stageSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  order: z.number().int().min(0).max(50).optional(),
});

const reorderSchema = z.object({
  stages: z.array(z.object({ id: z.string(), order: z.number().int() })).max(50),
});

export const GET = withWorkspace(async (ctx) => {
  await ensureStages(ctx.workspaceId);
  const stages = await prisma.pipelineStage.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { order: 'asc' },
    include: { _count: { select: { deals: true } } },
  });
  return ok({ stages });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, stageSchema);

  const count = await prisma.pipelineStage.count({ where: { workspaceId: ctx.workspaceId } });
  let key = slugify(body.name) || `stage-${count + 1}`;

  // Stage keys are referenced by retention rules, so they must stay unique.
  const clash = await prisma.pipelineStage.findUnique({
    where: { workspaceId_key: { workspaceId: ctx.workspaceId, key } },
    select: { id: true },
  });
  if (clash) key = `${key}-${count + 1}`;

  const stage = await prisma.pipelineStage.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: body.name,
      key,
      color: body.color ?? null,
      order: body.order ?? count,
    },
  });

  return created({ stage });
}, 'pipeline:write');

export const PATCH = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, reorderSchema);

  await prisma.$transaction(
    body.stages.map((s) =>
      prisma.pipelineStage.updateMany({
        where: { id: s.id, workspaceId: ctx.workspaceId },
        data: { order: s.order },
      }),
    ),
  );

  return ok({ updated: body.stages.length });
}, 'pipeline:write');
