import { z } from 'zod';
import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { logActivity } from '@/lib/workspace';
import { startOfDayInZone } from '@/lib/utils';

/**
 * Follow-up tasks.
 *
 * The retention engine's `create_task` step writes rows here, so without this
 * route every task it raises would be invisible — the rule would look like it
 * had done nothing.
 */

const taskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  contactId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

export const GET = withWorkspace(async (ctx, req) => {
  const sp = searchParams(req);
  const scope = sp.get('scope') ?? 'open'; // open | done | all
  const mine = sp.get('mine') === '1';

  const where = {
    workspaceId: ctx.workspaceId,
    ...(scope === 'open' ? { completedAt: null } : {}),
    ...(scope === 'done' ? { completedAt: { not: null } } : {}),
    ...(mine ? { assigneeId: ctx.userId } : {}),
  };

  // Overdue means "the day has passed", matching how the list groups them.
  // Comparing against the current instant makes the tile claim an overdue
  // task while the list shows it under "Due today".
  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { timezone: true },
  });
  const startOfToday = startOfDayInZone(workspace?.timezone ?? 'UTC');

  const [tasks, openCount, overdueCount] = await Promise.all([
    prisma.task.findMany({
      where,
      // Undated tasks sort last: `nulls: 'last'` keeps a task with no due
      // date from jumping ahead of one that is actually due today.
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      include: {
        contact: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.task.count({ where: { workspaceId: ctx.workspaceId, completedAt: null } }),
    prisma.task.count({
      where: {
        workspaceId: ctx.workspaceId,
        completedAt: null,
        dueAt: { lt: startOfToday },
      },
    }),
  ]);

  // The day boundary travels with the data so the client groups by the
  // workspace's day, not the viewer's browser timezone.
  return ok({
    tasks,
    openCount,
    overdueCount,
    startOfToday: startOfToday.toISOString(),
    timezone: workspace?.timezone ?? 'UTC',
  });
}, 'leads:read');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, taskCreateSchema);

  // Both references are workspace-scoped so a task cannot be pinned to
  // another tenant's contact or assigned to their staff.
  if (body.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: body.contactId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!contact) return fail(404, 'Contact not found in this workspace.');
  }

  if (body.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: body.assigneeId, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!assignee) return fail(404, 'That teammate is not in this workspace.');
  }

  const task = await prisma.task.create({
    data: {
      workspaceId: ctx.workspaceId,
      title: body.title,
      contactId: body.contactId || null,
      assigneeId: body.assigneeId || ctx.userId,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
    },
    include: {
      contact: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  await logActivity({
    workspaceId: ctx.workspaceId,
    contactId: task.contactId,
    userId: ctx.userId,
    type: 'task',
    title: task.title,
  });

  return created({ task });
}, 'leads:write');
