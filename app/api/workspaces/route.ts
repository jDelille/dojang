import { prisma } from '@/lib/db';
import { created, fail, ok, parseBody, withAuth } from '@/lib/api';
import { workspaceCreateSchema } from '@/lib/validation';
import { provisionWorkspace } from '@/lib/workspace';
import { hashPassword } from '@/lib/auth';
import { can } from '@/lib/rbac';

/**
 * Workspace list + tenant provisioning (spec §6).
 * Super Admins see every workspace; Agency Admins see their own sub-accounts.
 */

export const GET = withAuth(async (ctx) => {
  const where =
    ctx.role === 'super_admin'
      ? {}
      : ctx.role === 'agency_admin'
        ? { OR: [{ id: ctx.workspaceId ?? '' }, { parentId: ctx.workspaceId ?? '' }] }
        : { id: ctx.workspaceId ?? '' };

  const workspaces = await prisma.workspace.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      customDomain: true,
      accentColor: true,
      logoUrl: true,
      plan: true,
      niche: true,
      parentId: true,
      createdAt: true,
      _count: { select: { users: true, leads: true, contacts: true } },
    },
  });

  return ok({ workspaces });
});

export const POST = withAuth(async (ctx, req) => {
  if (!can(ctx.role, 'workspace:create')) {
    return fail(403, 'Only agency admins and above can create workspaces.');
  }

  const body = await parseBody(req, workspaceCreateSchema);

  // An agency admin can only nest new workspaces under their own agency.
  const parentId =
    ctx.role === 'super_admin' ? (body.parentId ?? null) : (ctx.workspaceId ?? null);

  const workspace = await provisionWorkspace({
    name: body.name,
    niche: body.niche ?? null,
    timezone: body.timezone,
    currency: body.currency,
    parentId,
    businessName: body.name,
    businessEmail: body.adminEmail ?? null,
  });

  // Optionally seed the sub-account with its own admin.
  if (body.adminEmail && body.adminPassword) {
    const email = body.adminEmail.toLowerCase().trim();
    const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (clash) {
      return fail(409, 'That admin email is already in use by another account.');
    }

    await prisma.user.create({
      data: {
        email,
        name: `${body.name} Admin`,
        passwordHash: await hashPassword(body.adminPassword),
        role: 'workspace_admin',
        workspaceId: workspace.id,
      },
    });
  }

  return created({ workspace });
});
