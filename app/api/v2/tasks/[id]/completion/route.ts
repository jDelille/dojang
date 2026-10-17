import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/tasks/{id}/completion — complete a task with its outcome. payload: { feedback }; expectedVersion is the task's. */
export const POST = hubWrite('complete_task', 'leads.write', { id: 'taskId' });
