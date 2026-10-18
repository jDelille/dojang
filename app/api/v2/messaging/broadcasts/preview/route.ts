import { hubPreview } from '@/lib/domain/hub-routes';

export const runtime = 'nodejs';

/** POST /api/v2/messaging/broadcasts/preview — consented recipients and exclusions. payload: { channel, purpose, audience, body }. */
export const POST = hubPreview('broadcast_preview', 'messaging.manage');
