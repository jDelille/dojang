import { hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/messaging/broadcasts/{id}/approval — approve and queue for the provider. payload: { reason }; expectedVersion is the broadcast's. */
export const POST = hubWrite('approve_broadcast', 'messaging.manage', { id: 'broadcastId' });
