import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/messaging/broadcasts/{id}/cancellation — cancel; queued recipients are removed. payload: { reason }; expectedVersion is the broadcast's. */
export const POST = hubWrite('cancel_broadcast', 'messaging.manage', { id: 'broadcastId' });
