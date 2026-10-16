import { z } from 'zod';
import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, withWorkspace } from '@/lib/api';

const taskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  completed: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

export const PATCH = withWorkspace(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  const body = await parseBody(req, taskUpdateSchema);

  // Scoped find first, so another tenant's id reads as missing rather than
  // being silently updated by the where-clause.
  const existing = await prisma.task.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Task not found.');

  if (body.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: body.assigneeId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!assignee) return fail(404, 'That teammate is not in this workspace.');
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId } : {}),
      // Re-opening clears the timestamp; completing stamps it now.
      ...(body.completed !== undefined
        ? { completedAt: body.completed ? new Date() : null }
        : {}),
    },
    include: {
      contact: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  return ok({ task });
}, 'leads:write');

export const DELETE = withWorkspace(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');

  const existing = await prisma.task.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!existing) return fail(404, 'Task not found.');

  await prisma.task.delete({ where: { id } });
  return noContent();
}, 'leads:write');
