import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { created, fail, parseBody, withPublic } from '@/lib/api';
import { registerSchema } from '@/lib/validation';
import { provisionWorkspace } from '@/lib/workspace';

/**
 * Self-serve registration. The first account on a fresh install becomes the
 * Super Admin; everyone after that is a Workspace Admin of their own workspace.
 */
export const POST = withPublic(async (req) => {
  const body = await parseBody(req, registerSchema);
  const email = body.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return fail(409, 'An account with that email already exists.');

  const isFirstUser = (await prisma.user.count()) === 0;

  const workspace = await provisionWorkspace({
    name: body.workspaceName?.trim() || `${body.name}'s workspace`,
    businessName: body.workspaceName?.trim() || null,
    businessEmail: email,
  });

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name.trim(),
      passwordHash: await hashPassword(body.password),
      role: isFirstUser ? 'super_admin' : 'workspace_admin',
      workspaceId: workspace.id,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  return created({ user, workspace: { id: workspace.id, slug: workspace.slug } });
});
