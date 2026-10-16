import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can, type Permission } from '@/lib/rbac';

/** Server-component helpers. Route handlers use lib/api.ts instead. */

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Requires an authenticated user with a workspace; sends to onboarding if not. */
export async function requireWorkspace() {
  const user = await requireUser();
  if (!user.workspaceId) redirect('/onboarding');

  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
  });
  if (!workspace) redirect('/onboarding');

  return { user, workspace, workspaceId: workspace.id };
}

export async function requirePermission(permission: Permission) {
  const ctx = await requireWorkspace();
  if (!can(ctx.user.role, permission)) redirect('/dashboard');
  return ctx;
}

export function isMultiTenant() {
  return process.env.ROSTER_TENANCY_MODE === 'multi';
}
