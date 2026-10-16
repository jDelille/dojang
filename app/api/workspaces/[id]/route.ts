import { prisma } from '@/lib/db';
import { fail, noContent, ok, parseBody, routeParam, withAuth } from '@/lib/api';
import { workspaceUpdateSchema } from '@/lib/validation';
import { can } from '@/lib/rbac';

/** Read/update/delete a single workspace, with tenancy checks on every path. */

async function assertAccess(
  ctx: { role: string; workspaceId: string | null },
  workspaceId: string,
): Promise<boolean> {
  if (ctx.role === 'super_admin') return true;
  if (ctx.workspaceId === workspaceId) return true;

  if (ctx.role === 'agency_admin' && ctx.workspaceId) {
    const child = await prisma.workspace.findFirst({
      where: { id: workspaceId, parentId: ctx.workspaceId },
      select: { id: true },
    });
    return Boolean(child);
  }

  return false;
}

export const GET = withAuth(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');
  if (!(await assertAccess(ctx, id))) return fail(403, 'You cannot access that workspace.');

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      _count: { select: { users: true, leads: true, contacts: true, deals: true } },
      license: true,
    },
  });
  if (!workspace) return fail(404, 'Workspace not found.');

  return ok({ workspace });
});

export const PATCH = withAuth(async (ctx, req, params) => {
  const id = await routeParam(params, 'id');
  if (!(await assertAccess(ctx, id))) return fail(403, 'You cannot access that workspace.');
  if (!can(ctx.role as never, 'workspace:write')) {
    return fail(403, 'Your role cannot edit workspace settings.');
  }

  const body = await parseBody(req, workspaceUpdateSchema);

  if (body.customDomain) {
    const clash = await prisma.workspace.findFirst({
      where: { customDomain: body.customDomain, NOT: { id } },
      select: { id: true },
    });
    if (clash) return fail(409, 'That custom domain is already in use.');
  }

  const workspace = await prisma.workspace.update({
    where: { id },
    data: {
      ...body,
      businessEmail: body.businessEmail === '' ? null : body.businessEmail,
      businessHours: body.businessHours as never,
      services: body.services as never,
    },
  });

  return ok({ workspace });
});

export const DELETE = withAuth(async (ctx, _req, params) => {
  const id = await routeParam(params, 'id');
  if (ctx.role !== 'super_admin') {
    return fail(403, 'Only a Super Admin can delete a workspace.');
  }
  if (id === ctx.workspaceId) {
    return fail(409, 'You cannot delete the workspace you are signed in to.');
  }

  await prisma.workspace.delete({ where: { id } });
  return noContent();
});
