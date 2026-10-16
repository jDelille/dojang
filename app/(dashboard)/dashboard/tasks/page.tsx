import { requireWorkspace } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { TasksClient } from '@/components/tasks/tasks-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tasks' };

export default async function TasksPage() {
  const t = await getTranslations('tasks');
  const { workspaceId, user } = await requireWorkspace();

  const teammates = await prisma.user.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  });

  return (
    <>
      <PageHeader
        title={t('tasks')}
        description={t('followUpsYouOrYour')}
      />
      <TasksClient teammates={teammates} currentUserId={user.id} />
    </>
  );
}
