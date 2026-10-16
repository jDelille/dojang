import { prisma } from '@/lib/db';
import { fail, ok, withAuth } from '@/lib/api';
import { getUsageByWorkspace } from '@/lib/usage';
import { can } from '@/lib/rbac';

/** Platform-wide view for the Super Admin panel (spec §4.9, §4.10). */
export const GET = withAuth(async (ctx) => {
  if (!can(ctx.role, 'platform:admin')) {
    return fail(403, 'Super Admin only.');
  }

  const [workspaces, usage, totals] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        license: { select: { status: true, domain: true, verifiedAt: true } },
        parent: { select: { id: true, name: true } },
        _count: {
          select: { users: true, leads: true, contacts: true, conversations: true, invoices: true },
        },
      },
    }),
    getUsageByWorkspace(30),
    Promise.all([
      prisma.user.count(),
      prisma.lead.count(),
      prisma.contact.count(),
      prisma.conversation.count(),
    ]),
  ]);

  const [totalUsers, totalLeads, totalContacts, totalConversations] = totals;

  return ok({
    workspaces: workspaces.map((w) => ({
      ...w,
      usage: usage.get(w.id) ?? null,
    })),
    platform: {
      workspaces: workspaces.length,
      users: totalUsers,
      leads: totalLeads,
      contacts: totalContacts,
      conversations: totalConversations,
      tenancyMode: process.env.ROSTER_TENANCY_MODE ?? 'single',
    },
  });
});
