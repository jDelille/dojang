import { z } from 'zod';
import { prisma } from '@/lib/db';
import { created, fail, noContent, ok, parseBody, searchParams, withWorkspace } from '@/lib/api';
import { teamInviteSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/auth';
import { assignableRoles, ROLE_RANK } from '@/lib/rbac';

/** Team management (spec §4.9 role hierarchy). */

export const GET = withWorkspace(async (ctx) => {
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    Promise.resolve(assignableRoles(ctx.role)),
  ]);

  return ok({ users, assignableRoles: roles });
}, 'team:manage');

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, teamInviteSchema);

  // Nobody can mint an account more powerful than their own.
  if (ROLE_RANK[body.role] > ROLE_RANK[ctx.role]) {
    return fail(403, `You cannot create a user with the ${body.role} role.`);
  }

  const email = body.email.toLowerCase().trim();
  const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (clash) return fail(409, 'That email already has an account.');

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name ?? email.split('@')[0],
      passwordHash: await hashPassword(body.password),
      role: body.role,
      workspaceId: ctx.workspaceId,
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return created({ user });
}, 'team:manage');

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['super_admin', 'agency_admin', 'workspace_admin', 'staff']).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, patchSchema);

  const target = await prisma.user.findFirst({
    where: { id: body.userId, workspaceId: ctx.workspaceId },
  });
  if (!target) return fail(404, 'User not found in this workspace.');

  if (body.role && ROLE_RANK[body.role] > ROLE_RANK[ctx.role]) {
    return fail(403, `You cannot grant the ${body.role} role.`);
  }
  if (ROLE_RANK[target.role] > ROLE_RANK[ctx.role]) {
    return fail(403, 'You cannot modify a user with a higher role than yours.');
  }
  if (target.id === ctx.userId && body.isActive === false) {
    return fail(409, 'You cannot deactivate your own account.');
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { role: body.role, isActive: body.isActive },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  return ok({ user });
}, 'team:manage');

export const DELETE = withWorkspace(async (ctx, req) => {
  const userId = searchParams(req).get('userId');
  if (!userId) return fail(400, 'Provide ?userId=.');
  if (userId === ctx.userId) return fail(409, 'You cannot delete your own account.');

  const target = await prisma.user.findFirst({
    where: { id: userId, workspaceId: ctx.workspaceId },
    select: { id: true, role: true },
  });
  if (!target) return fail(404, 'User not found in this workspace.');
  if (ROLE_RANK[target.role] > ROLE_RANK[ctx.role]) {
    return fail(403, 'You cannot delete a user with a higher role than yours.');
  }

  await prisma.user.delete({ where: { id: target.id } });
  return noContent();
}, 'team:manage');
