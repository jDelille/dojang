import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { fail, ok, parseBody, withAuth, withWorkspace } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { ROLE_RANK } from '@/lib/rbac';

/**
 * Password changes.
 *
 * PATCH — your own password, and only with the current one to hand, so a
 * borrowed session cannot lock the owner out of their own account.
 * POST  — an admin reset for someone else in the workspace, which is how a
 * member who has forgotten their password gets back in without being deleted
 * and recreated (that would orphan every activity record they own).
 */

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const PATCH = withAuth(async (ctx, req) => {
  const body = await parseBody(req, changeSchema);

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) return fail(404, 'That account no longer exists.');

  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) return fail(403, 'That is not your current password.');

  if (body.currentPassword === body.newPassword) {
    return fail(422, 'Your new password must be different from the current one.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });

  return ok({ ok: true });
});

const resetSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const POST = withWorkspace(async (ctx, req) => {
  const body = await parseBody(req, resetSchema);

  if (body.userId === ctx.userId) {
    return fail(409, 'Change your own password under Your account, where the current one is required.');
  }

  const target = await prisma.user.findFirst({
    where: { id: body.userId, workspaceId: ctx.workspaceId },
    select: { id: true, email: true, role: true },
  });
  if (!target) return fail(404, 'User not found in this workspace.');

  if (ROLE_RANK[target.role] > ROLE_RANK[ctx.role]) {
    return fail(403, 'You cannot reset the password of a user with a higher role than yours.');
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });

  return ok({ user: { id: target.id, email: target.email } });
}, 'team:manage');
