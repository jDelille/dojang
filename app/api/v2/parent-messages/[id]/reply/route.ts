import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/parent-messages/{id}/reply — approve the reviewed reply and queue it for delivery. payload: { expectedRevision, reply }. */
export const POST = hubWrite('approve_reply', 'inbox.use', { id: 'messageId' });
