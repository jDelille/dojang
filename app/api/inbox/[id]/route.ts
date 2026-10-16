import { z } from 'zod';
import { prisma } from '@/lib/db';
import { fail, ok, parseBody, routeParam, withWorkspace } from '@/lib/api';

const patchSchema = z.object({
  isOpen: z.boolean().optional(),
  needsHuman: z.boolean().optional(),
  subject: z.string().max(200).optional(),
});

/** Full thread for one conversation. */
export const GET = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const conversation = await prisma.conversation.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: {
      contact: true,
      agent: { select: { id: true, name: true, model: true, provider: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: 500 },
    },
  });
  if (!conversation) return fail(404, 'Conversation not found.');

  return ok({ conversation });
}, 'leads:read');

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, patchSchema);

  const updated = await prisma.conversation.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: body,
  });
  if (!updated.count) return fail(404, 'Conversation not found.');

  const conversation = await prisma.conversation.findUnique({ where: { id } });
  return ok({ conversation });
}, 'inbox:write');
