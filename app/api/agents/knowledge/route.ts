import { z } from 'zod';
import { prisma } from '@/lib/db';
import { created, fail, noContent, ok, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { knowledgeDocSchema } from '@/lib/validation';

/** Per-business knowledge base fed into the agent system prompt (spec §4.1). */

export const GET = withWorkspace(async (ctx, req) => {
  const agentId = searchParams(req).get('agentId');

  const docs = await prisma.knowledgeDoc.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(agentId ? { OR: [{ agentId }, { agentId: null }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  return ok({ docs });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, knowledgeDocSchema);

  if (body.agentId) {
    const agent = await prisma.aiAgent.findFirst({
      where: { id: body.agentId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!agent) return fail(400, 'That agent does not belong to this workspace.');
  }

  const doc = await prisma.knowledgeDoc.create({
    data: {
      workspaceId: ctx.workspaceId,
      agentId: body.agentId ?? null,
      title: body.title,
      kind: body.kind ?? 'doc',
      content: body.content,
      sourceUrl: body.sourceUrl ?? null,
      // Rough estimate — enough to warn before the prompt gets unwieldy.
      tokens: Math.ceil(body.content.length / 4),
    },
  });

  return created({ doc });
}, 'agents:write');

export const DELETE = withWorkspace(async (ctx, req) => {
  const id = searchParams(req).get('id');
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return fail(400, 'Provide ?id= of the document to delete.');

  const deleted = await prisma.knowledgeDoc.deleteMany({
    where: { id: parsed.data, workspaceId: ctx.workspaceId },
  });
  if (!deleted.count) return fail(404, 'Document not found.');

  return noContent();
}, 'agents:write');
