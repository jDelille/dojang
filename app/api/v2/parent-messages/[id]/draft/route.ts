import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/parent-messages/{id}/draft — prepare (or regenerate) the follow-up summary and reply draft. payload: { expectedRevision }. */
export const POST = hubWrite('draft', 'inbox.use', { id: 'messageId' });
