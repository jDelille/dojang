import { hubRead, hubWrite } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** GET /api/v2/messaging/broadcasts — audiences, provider status, quiet hours and recent broadcasts. */
export const GET = hubRead('broadcast_context', 'messaging.manage');

/** POST /api/v2/messaging/broadcasts — save a reviewed broadcast for approval (nothing is queued). payload: { channel, purpose, audience, body, name, reason, reviewToken }. */
export const POST = hubWrite('create_broadcast', 'messaging.manage');
