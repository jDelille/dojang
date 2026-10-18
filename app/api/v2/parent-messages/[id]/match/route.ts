import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/parent-messages/{id}/match — confirm which student and class a message is about. payload: { memberId, sessionId, expectedRevision }. */
export const POST = hubWrite('resolve', 'inbox.use', { id: 'messageId' });
