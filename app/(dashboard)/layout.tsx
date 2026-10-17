import { redirect } from 'next/navigation';
import { DashboardShell, type ShellDesk } from '@/components/dashboard/shell';
import { startOfDayInZone } from '@/lib/utils';
import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { brandStyle } from '@/lib/brand';
import { checkLicense } from '@/lib/license-gate';
import { getInstallState } from '@/lib/install';
import { HubActionsProvider } from '@/components/hub/hub-client';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // A fresh copy of the script should land on the installer, not a login loop.
  const install = await getInstallState();
  const userCount = await prisma.user.count().catch(() => 0);
  if (!install.completed && userCount === 0) redirect('/install');

  const user = await requireUser();
  if (!user.workspaceId) redirect('/onboarding');

  // License gate. Enforced here rather than in middleware so it runs after
  // authentication and has a workspace to check — and so the license page
  // itself, which is the only way out, stays reachable.
  // /license sits outside this route group precisely so this redirect cannot
  // trap the page that resolves it.
  const license = await checkLicense(user.workspaceId);
  if (!license.allowed) redirect('/license');

  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { name: true, logoUrl: true, accentColor: true, timezone: true },
  });
  if (!workspace) redirect('/onboarding');

  // Shell data: the "Arriving soon" column, the agent status line and the
  // Do For Me panel. Loaded here so every page shares one front-desk context;
  // router.refresh() after an action re-runs it.
  const workspaceId = user.workspaceId;
  const endOfDay = new Date(startOfDayInZone(workspace.timezone).getTime() + 86_400_000);
  const [arrivals, agent, humanQueue, tasksDue, evidence] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        workspaceId,
        startsAt: { gte: new Date(Date.now() - 60 * 60_000) },
        status: { in: ['scheduled', 'confirmed'] },
      },
      orderBy: { startsAt: 'asc' },
      take: 8,
      select: {
        id: true,
        title: true,
        startsAt: true,
        status: true,
        contact: { select: { id: true, name: true } },
      },
    }),
    prisma.aiAgent.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { isDefault: 'desc' },
      select: { id: true, name: true },
    }),
    prisma.conversation.count({ where: { workspaceId, isOpen: true, needsHuman: true } }),
    prisma.task.findMany({
      where: { workspaceId, completedAt: null, dueAt: { lt: endOfDay } },
      orderBy: { dueAt: 'asc' },
      take: 6,
      select: { id: true, title: true, dueAt: true, contactId: true },
    }),
    prisma.activity.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, title: true, type: true, createdAt: true, contactId: true },
    }),
  ]);

  const desk: ShellDesk = {
    timezone: workspace.timezone,
    arrivals: arrivals.map((a) => ({
      id: a.id,
      title: a.title,
      startsAt: a.startsAt.toISOString(),
      status: a.status,
      contactId: a.contact.id,
      contactName: a.contact.name,
    })),
    agent: agent ? { ...agent, queue: humanQueue } : null,
    tasksDue: tasksDue.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt?.toISOString() ?? null,
      contactId: t.contactId,
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      createdAt: e.createdAt.toISOString(),
      contactId: e.contactId,
    })),
  };

  const accentCss = brandStyle(workspace.accentColor);

  return (
    <>
      {/* White-label accent override, applied per workspace (spec §4.9).
          brandStyle derives the hover and on-accent text colors too, and
          returns '' for anything that is not a plain hex value. */}
      {accentCss && <style dangerouslySetInnerHTML={{ __html: accentCss }} />}
      <DashboardShell
        user={{ name: user.name ?? null, email: user.email, role: user.role }}
        workspace={workspace}
        desk={desk}
        showSuperAdmin={can(user.role, 'platform:admin')}
      >
        <HubActionsProvider>{children}</HubActionsProvider>
      </DashboardShell>
    </>
  );
}
