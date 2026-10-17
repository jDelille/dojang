import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/tasks — create an internal task on a lead or member, assigned to the caller. payload: { relatedType, relatedId, summary, due }. */
export const POST = hubWrite('create_task', 'leads.write');
